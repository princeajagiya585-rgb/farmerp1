"""
Thin wrapper around gspread that owns the spreadsheet lifecycle:

* authenticate with a Google service account,
* open the EXISTING spreadsheet pinned by GOOGLE_SPREADSHEET_ID
  (a new spreadsheet is never created),
* get-or-create one worksheet per Supabase table with a header row.

Every call that hits the Sheets API goes through :func:`with_retry`, which
backs off on quota (429) and transient (5xx) errors.  Errors here must never
propagate into request handling — callers catch and log.
"""
import json
import logging
import threading
import time

from apps.sheets_sync import conf

logger = logging.getLogger(__name__)

_lock = threading.RLock()
_client = None
_spreadsheet = None
_worksheets = {}  # title -> gspread Worksheet (cached per process)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Sheets hard limit is 50,000 characters per cell.
MAX_CELL_LEN = 49500


class Formula(str):
    """
    A cell value that must be evaluated by Sheets (e.g. ``=IMAGE(url)``).

    Only the sync code constructs Formulas; everything else is written as
    literal text.  This is the one and only way a formula reaches the
    spreadsheet.
    """


def _prepare_cell(value):
    """
    Make one cell safe for ``USER_ENTERED`` writes.

    Sheets must evaluate our own :class:`Formula` cells, but plain data —
    which can contain user input like ``=HYPERLINK(...)`` — is prefixed
    with an apostrophe so it always lands as literal text (the apostrophe
    is Sheets syntax and never shows in the cell). Non-strings (numbers)
    pass through unchanged.
    """
    if isinstance(value, Formula):
        return str(value)
    if isinstance(value, str):
        return "'" + value if value else ""
    return value


def _prepare_rows(rows):
    return [[_prepare_cell(c) for c in row] for row in rows]


def _status_code(exc):
    resp = getattr(exc, "response", None)
    return getattr(resp, "status_code", None)


def with_retry(fn, *args, attempts=5, **kwargs):
    """Run ``fn`` retrying on rate-limit / transient API errors."""
    import gspread

    delay = 2
    for attempt in range(1, attempts + 1):
        try:
            return fn(*args, **kwargs)
        except gspread.exceptions.APIError as exc:
            code = _status_code(exc)
            if code in (429, 500, 502, 503) and attempt < attempts:
                logger.warning(
                    "[SheetsSync] API %s — retrying in %ss (attempt %s/%s)",
                    code, delay, attempt, attempts,
                )
                time.sleep(delay)
                delay = min(delay * 2, 60)
                continue
            raise


def get_client():
    """Authorized gspread client (cached per process)."""
    global _client
    with _lock:
        if _client is not None:
            return _client

        import gspread
        from django.conf import settings

        raw_json = getattr(settings, "GOOGLE_SERVICE_ACCOUNT_JSON", "")
        file_path = getattr(settings, "GOOGLE_SERVICE_ACCOUNT_FILE", "")
        if raw_json:
            info = json.loads(raw_json)
            _client = gspread.service_account_from_dict(info, scopes=SCOPES)
        elif file_path:
            _client = gspread.service_account(filename=file_path, scopes=SCOPES)
        else:
            raise RuntimeError(
                "Google Sheets sync: no credentials. Set "
                "GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE."
            )
        return _client


def service_account_email():
    """Client email of the configured service account (for diagnostics)."""
    from django.conf import settings

    raw_json = getattr(settings, "GOOGLE_SERVICE_ACCOUNT_JSON", "")
    file_path = getattr(settings, "GOOGLE_SERVICE_ACCOUNT_FILE", "")
    if raw_json:
        info = json.loads(raw_json)
    elif file_path:
        with open(file_path, encoding="utf-8") as fh:
            info = json.load(fh)
    else:
        return None
    return info.get("client_email")


def get_spreadsheet():
    """
    Open the existing spreadsheet pinned by GOOGLE_SPREADSHEET_ID.

    The sync mirrors into a spreadsheet the user already owns — it never
    creates one, so a missing/wrong ID is a hard configuration error.
    """
    global _spreadsheet
    with _lock:
        if _spreadsheet is not None:
            return _spreadsheet

        pinned = conf.spreadsheet_id()
        if not pinned:
            raise RuntimeError(
                "Google Sheets sync: GOOGLE_SPREADSHEET_ID is not set. "
                "Set it to the ID of your existing spreadsheet — the sync "
                "never creates a new one."
            )
        gc = get_client()
        _spreadsheet = with_retry(gc.open_by_key, pinned)
        return _spreadsheet


# Header styling: bold white text on Farm-ERP green.
HEADER_GREEN = {"red": 0.094, "green": 0.502, "blue": 0.219}   # #188038
HEADER_TEXT = {"red": 1.0, "green": 1.0, "blue": 1.0}


def format_requests(sheet_id, ncols):
    """
    Sheets API requests that give one worksheet its standard look:
    frozen + bold green header row, a basic filter, auto-sized columns,
    and a hidden ID column (column A stays the upsert/delete key but is
    invisible to readers).
    """
    return [
        {"updateSheetProperties": {
            "properties": {"sheetId": sheet_id,
                           "gridProperties": {"frozenRowCount": 1}},
            "fields": "gridProperties.frozenRowCount",
        }},
        {"repeatCell": {
            "range": {"sheetId": sheet_id,
                      "startRowIndex": 0, "endRowIndex": 1},
            "cell": {"userEnteredFormat": {
                "backgroundColor": HEADER_GREEN,
                "textFormat": {"bold": True,
                               "foregroundColor": HEADER_TEXT},
            }},
            "fields": "userEnteredFormat(backgroundColor,textFormat)",
        }},
        {"setBasicFilter": {"filter": {"range": {
            "sheetId": sheet_id,
            "startRowIndex": 0,
            "startColumnIndex": 0,
            "endColumnIndex": max(ncols, 1),
        }}}},
        {"autoResizeDimensions": {"dimensions": {
            "sheetId": sheet_id, "dimension": "COLUMNS",
            "startIndex": 0, "endIndex": max(ncols, 1),
        }}},
        {"updateDimensionProperties": {
            "range": {"sheetId": sheet_id, "dimension": "COLUMNS",
                      "startIndex": 0, "endIndex": 1},
            "properties": {"hiddenByUser": True},
            "fields": "hiddenByUser",
        }},
    ]


def format_worksheet(ws, ncols):
    """Apply the standard worksheet look (one batched API call)."""
    sh = get_spreadsheet()
    with_retry(sh.batch_update, {"requests": format_requests(ws.id, ncols)})


def get_worksheet(title, headers):
    """
    Get-or-create the worksheet for one table and make sure row 1 carries
    the current column headers (schema changes just extend the header row).
    """
    import gspread
    from gspread.utils import rowcol_to_a1

    with _lock:
        ws = _worksheets.get(title)
        if ws is None:
            sh = get_spreadsheet()
            try:
                ws = with_retry(sh.worksheet, title)
            except gspread.exceptions.WorksheetNotFound:
                # Small initial grid — appends grow it as rows arrive and the
                # spreadsheet-wide 10M cell budget stays available for data.
                ws = with_retry(sh.add_worksheet, title=title, rows=2,
                                cols=max(len(headers), 1))
                format_worksheet(ws, len(headers))
                logger.info("[SheetsSync] Created worksheet '%s'", title)
            _worksheets[title] = ws

        current = with_retry(ws.row_values, 1)
        if current != list(headers):
            if len(headers) > ws.col_count:
                with_retry(ws.resize, cols=len(headers))
            end = rowcol_to_a1(1, len(headers))
            with_retry(ws.update, values=[list(headers)],
                       range_name=f"A1:{end}")
        return ws


def upsert_rows(title, headers, rows):
    """
    Insert-or-update many records of one table in as few API calls as
    possible (one read + one batched update + one batched append).

    Column A holds the primary key.  Existing pks are updated in place —
    a pk can therefore never produce a duplicate row.  Rows sharing a pk
    within one batch are deduplicated keeping the last (newest) version.

    Returns ``{pk: "INSERT" | "UPDATE"}`` for logging.
    """
    if not rows:
        return {}
    ws = get_worksheet(title, headers)
    from gspread.utils import rowcol_to_a1

    by_pk = {}
    for row in rows:
        by_pk[str(row[0])] = list(row)

    ids = with_retry(ws.col_values, 1)
    position = {}
    for i, existing in enumerate(ids[1:], start=2):  # 1-based, skip header
        position.setdefault(existing, i)

    updates, appends, outcome = [], [], {}
    for pk, row in by_pk.items():
        idx = position.get(pk)
        if idx:
            end = rowcol_to_a1(idx, len(row))
            updates.append({"range": f"A{idx}:{end}",
                            "values": _prepare_rows([row])})
            outcome[pk] = "UPDATE"
        else:
            appends.append(_prepare_rows([row])[0])
            outcome[pk] = "INSERT"

    if updates:
        with_retry(ws.batch_update, updates,
                   value_input_option="USER_ENTERED")
    if appends:
        # Write to an explicitly computed range instead of values.append:
        # the API's table detection is unreliable on worksheets that carry
        # a basic filter (it can resolve to A1 and overwrite the header).
        # ``ids`` was read above, so the last occupied row is known.
        start_row = len(ids) + 1
        last_row = start_row + len(appends) - 1
        if last_row > ws.row_count:
            with_retry(ws.resize, rows=last_row)
        ncols = max(len(r) for r in appends)
        end = rowcol_to_a1(last_row, ncols)
        with_retry(ws.update, values=appends,
                   range_name=f"A{start_row}:{end}",
                   value_input_option="USER_ENTERED")
    return outcome


def upsert_row(title, headers, row):
    """Single-record convenience wrapper around :func:`upsert_rows`."""
    upsert_rows(title, headers, [row])


def delete_rows_batch(title, pks):
    """
    Remove every row whose column-A key is in ``pks`` — one read plus one
    batched ``deleteDimension`` request regardless of how many rows go.
    Missing pks are ignored (already gone = success).
    """
    import gspread

    with _lock:
        ws = _worksheets.get(title)
    if ws is None:
        sh = get_spreadsheet()
        try:
            ws = with_retry(sh.worksheet, title)
        except gspread.exceptions.WorksheetNotFound:
            return
        with _lock:
            _worksheets[title] = ws

    wanted = {str(pk) for pk in pks}
    ids = with_retry(ws.col_values, 1)
    row_numbers = [i for i, v in enumerate(ids[1:], start=2) if v in wanted]
    if not row_numbers:
        return

    sh = get_spreadsheet()
    requests = [
        {"deleteDimension": {"range": {
            "sheetId": ws.id,
            "dimension": "ROWS",
            "startIndex": r - 1,  # API is 0-based, half-open
            "endIndex": r,
        }}}
        # Bottom-up so earlier deletions don't shift later row numbers.
        for r in sorted(row_numbers, reverse=True)
    ]
    with_retry(sh.batch_update, {"requests": requests})


def delete_row(title, pk):
    """Single-record convenience wrapper around :func:`delete_rows_batch`."""
    delete_rows_batch(title, [pk])


def replace_all_rows(title, headers, rows):
    """
    Rewrite a whole worksheet (backfill / m2m refresh).  Batches the write
    in chunks to stay inside the Sheets payload limits.
    """
    ws = get_worksheet(title, headers)
    with_retry(ws.clear)
    with_retry(ws.resize, rows=max(len(rows) + 1, 2),
               cols=max(len(headers), 1))

    values = _prepare_rows([list(headers)] + [list(r) for r in rows])
    CHUNK = 2000
    from gspread.utils import rowcol_to_a1

    start = 0
    while start < len(values):
        chunk = values[start:start + CHUNK]
        first_row = start + 1
        end = rowcol_to_a1(first_row + len(chunk) - 1, len(headers))
        with_retry(ws.update, values=chunk, range_name=f"A{first_row}:{end}",
                   value_input_option="USER_ENTERED")
        start += CHUNK
        if start < len(values):
            time.sleep(1.1)  # stay under the 60 writes/min/user quota

    # Re-apply the standard look — auto-resize is data-dependent.
    format_worksheet(ws, len(headers))
