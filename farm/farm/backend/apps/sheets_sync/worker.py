"""
In-process background worker that pushes committed Supabase records to
Google Sheets.

Jobs are enqueued from ``transaction.on_commit`` hooks, so the database
write has already succeeded by the time a job exists; API responses never
wait on the Sheets API.  The worker runs in a daemon thread.

Reliability model:

* **Batching** — the worker drains everything queued (up to a cap) in one
  cycle and groups jobs per table, so N rapid writes to one table cost a
  couple of API calls instead of N.
* **Coalescing** — duplicate jobs for the same record are merged while
  queued; only the latest database state is ever written.
* **Retry with backoff** — a failed batch is re-queued per-job with
  exponential backoff (5s → 10s → … capped at 5 min, max 8 attempts).
  Quota (429) and transient (5xx) errors additionally retry inside each
  API call (see ``client.with_retry``).
* **Audit trail** — every operation outcome is recorded in the
  :class:`~apps.sheets_sync.models.SyncLog` table: table name, record id,
  operation, timestamp, status, error.
"""
import logging
import queue
import threading

logger = logging.getLogger(__name__)

_queue = queue.Queue()
_pending = set()          # job keys currently queued (coalescing)
_pending_lock = threading.Lock()
_thread = None
_thread_lock = threading.Lock()

UPSERT, DELETE, REFRESH = "upsert", "delete", "refresh"

BATCH_MAX = 40            # jobs drained per worker cycle
BATCH_LINGER = 0.25       # seconds to wait for more jobs before flushing
MAX_ATTEMPTS = 8
RETRY_BASE_DELAY = 5      # 5s, 10s, 20s, ... capped below
RETRY_MAX_DELAY = 300
PRUNE_EVERY = 500         # cycles between SyncLog retention sweeps
PRUNE_AFTER_DAYS = 30

_cycles = 0


def _ensure_thread():
    global _thread
    with _thread_lock:
        if _thread is None or not _thread.is_alive():
            _thread = threading.Thread(
                target=_run, name="sheets-sync-worker", daemon=True
            )
            _thread.start()


def _job_key(job):
    if job["kind"] == UPSERT:
        return (UPSERT, job["app_label"], job["model_name"], job["pk"])
    if job["kind"] == DELETE:
        return (DELETE, job["table"], job["pk"])
    return (REFRESH, job["app_label"], job["model_name"])


def _enqueue(job):
    key = _job_key(job)
    with _pending_lock:
        if key in _pending:
            return
        _pending.add(key)
    _queue.put(job)
    _ensure_thread()


def _requeue_later(job, delay):
    """Schedule a retry without blocking the worker thread."""
    timer = threading.Timer(delay, _enqueue, args=(job,))
    timer.daemon = True
    timer.start()


def enqueue_upsert(app_label, model_name, pk):
    _enqueue({"kind": UPSERT, "app_label": app_label,
              "model_name": model_name, "pk": str(pk), "attempts": 0})


def enqueue_delete(worksheet, pk):
    _enqueue({"kind": DELETE, "table": worksheet, "pk": str(pk),
              "attempts": 0})


def enqueue_refresh(app_label, model_name):
    """Rewrite a whole worksheet — used for M2M through tables."""
    _enqueue({"kind": REFRESH, "app_label": app_label,
              "model_name": model_name, "attempts": 0})


def pending_count():
    """Jobs currently queued (dashboard metric)."""
    return _queue.qsize()


def worker_alive():
    return _thread is not None and _thread.is_alive()


# ---------------------------------------------------------------------------
# Worker loop
# ---------------------------------------------------------------------------

def _run():
    global _cycles
    while True:
        jobs = _drain()
        try:
            _process_batch(jobs)
        except Exception:
            # _process_batch handles per-group errors; this is a backstop.
            logger.exception("[SheetsSync] Unexpected worker error")
        finally:
            for _ in jobs:
                _queue.task_done()
        _cycles += 1
        if _cycles % PRUNE_EVERY == 0:
            _prune_logs()


def _drain():
    """Block for one job, then gather everything else already queued."""
    jobs = [_queue.get()]
    while len(jobs) < BATCH_MAX:
        try:
            jobs.append(_queue.get(timeout=BATCH_LINGER))
        except queue.Empty:
            break
    with _pending_lock:
        for job in jobs:
            _pending.discard(_job_key(job))
    return jobs


def _process_batch(jobs):
    """Group drained jobs per table and execute them with batch API calls."""
    from django.db import close_old_connections

    close_old_connections()

    upserts, deletes, refreshes = {}, {}, []
    for job in jobs:
        if job["kind"] == UPSERT:
            upserts.setdefault(
                (job["app_label"], job["model_name"]), {}
            )[job["pk"]] = job
        elif job["kind"] == DELETE:
            deletes.setdefault(job["table"], {})[job["pk"]] = job
        else:
            refreshes.append(job)

    for (app_label, model_name), by_pk in upserts.items():
        _do_upserts(app_label, model_name, by_pk)
    for table, by_pk in deletes.items():
        _do_deletes(table, by_pk)
    for job in refreshes:
        _do_refresh(job)

    close_old_connections()


def _do_upserts(app_label, model_name, by_pk):
    from apps.sheets_sync import client, registry
    from apps.sheets_sync.models import SyncLog

    model = registry.get_model(app_label, model_name)
    title = registry.worksheet_title(model)
    try:
        instances = {
            str(obj.pk): obj
            for obj in model._base_manager.filter(pk__in=list(by_pk))
        }
        rows, gone = [], []
        for pk in by_pk:
            obj = instances.get(pk)
            if obj is None:
                gone.append(pk)  # deleted between commit and sync
            else:
                rows.append(registry.serialize_instance(obj)[1])
        outcome = client.upsert_rows(title, registry.headers(model), rows)
        if gone:
            client.delete_rows_batch(title, gone)
        for pk in by_pk:
            logger.info("[SheetsSync] %s %s[%s] -> SUCCESS",
                        outcome.get(pk, SyncLog.OP_DELETE), title, pk)
        _log([
            (title, pk, outcome.get(pk, SyncLog.OP_DELETE),
             SyncLog.STATUS_SUCCESS, by_pk[pk]["attempts"] + 1, "")
            for pk in by_pk
        ])
    except Exception as exc:
        _handle_failure(list(by_pk.values()), title, exc)


def _do_deletes(table, by_pk):
    from apps.sheets_sync import client
    from apps.sheets_sync.models import SyncLog

    try:
        client.delete_rows_batch(table, list(by_pk))
        for pk in by_pk:
            logger.info("[SheetsSync] DELETE %s[%s] -> SUCCESS", table, pk)
        _log([
            (table, pk, SyncLog.OP_DELETE, SyncLog.STATUS_SUCCESS,
             job["attempts"] + 1, "")
            for pk, job in by_pk.items()
        ])
    except Exception as exc:
        _handle_failure(list(by_pk.values()), table, exc)


def _do_refresh(job):
    from apps.sheets_sync import client, registry
    from apps.sheets_sync.models import SyncLog

    model = registry.get_model(job["app_label"], job["model_name"])
    title = registry.worksheet_title(model)
    try:
        headers = registry.headers(model)
        rows = [
            registry.serialize_instance(obj)[1]
            for obj in model._base_manager.all().iterator(chunk_size=500)
        ]
        client.replace_all_rows(title, headers, rows)
        logger.info("[SheetsSync] REFRESH %s (%s rows) -> SUCCESS",
                    title, len(rows))
        _log([(title, "", SyncLog.OP_REFRESH, SyncLog.STATUS_SUCCESS,
               job["attempts"] + 1, "")])
    except Exception as exc:
        _handle_failure([job], title, exc)


def _handle_failure(jobs, table, exc):
    """Log the error (with full traceback) and re-queue each job with
    exponential backoff."""
    import traceback

    from apps.sheets_sync.models import SyncLog

    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    error = f"{type(exc).__name__}: {exc}\n{tb}"[:4000]
    entries = []
    for job in jobs:
        job["attempts"] += 1
        op = {UPSERT: SyncLog.OP_UPDATE, DELETE: SyncLog.OP_DELETE,
              REFRESH: SyncLog.OP_REFRESH}[job["kind"]]
        if job["attempts"] >= MAX_ATTEMPTS:
            status = SyncLog.STATUS_FAILED
            logger.error("[SheetsSync] %s %s[%s] failed permanently: %s",
                         job["kind"], table, job.get("pk", ""), error,
                         exc_info=exc)
        else:
            status = SyncLog.STATUS_RETRYING
            delay = min(RETRY_BASE_DELAY * 2 ** (job["attempts"] - 1),
                        RETRY_MAX_DELAY)
            logger.warning("[SheetsSync] %s %s[%s] failed (attempt %s/%s), "
                           "retrying in %ss: %s", job["kind"], table,
                           job.get("pk", ""), job["attempts"], MAX_ATTEMPTS,
                           delay, error, exc_info=exc)
            _requeue_later(job, delay)
        entries.append((table, job.get("pk", ""), op, status,
                        job["attempts"], error))
    _log(entries)


def _log(entries):
    """Persist (table, record_id, operation, status, attempts, error) rows."""
    from apps.sheets_sync.models import SyncLog

    try:
        SyncLog.objects.bulk_create([
            SyncLog(table_name=t, record_id=r, operation=op,
                    status=status, attempts=attempts, error=err)
            for (t, r, op, status, attempts, err) in entries
        ])
    except Exception:
        logger.exception("[SheetsSync] Could not write sync log")


def _prune_logs():
    from datetime import timedelta

    from django.utils import timezone

    from apps.sheets_sync.models import SyncLog

    try:
        cutoff = timezone.now() - timedelta(days=PRUNE_AFTER_DAYS)
        deleted, _ = SyncLog.objects.filter(timestamp__lt=cutoff).delete()
        if deleted:
            logger.info("[SheetsSync] Pruned %s old sync log entries", deleted)
    except Exception:
        logger.exception("[SheetsSync] Sync log prune failed")


def wait_until_drained(timeout=None):
    """
    Test/backfill helper — block until the queue is empty.  Retries that
    are waiting out a backoff delay are not covered (they re-enter the
    queue when their timer fires).
    """
    _queue.join()
