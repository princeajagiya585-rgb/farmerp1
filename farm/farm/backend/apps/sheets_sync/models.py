"""
Persistent audit trail of every Google Sheets sync operation.

One row per attempted operation (insert/update/delete/refresh/backfill),
written by the background worker.  This table is itself EXCLUDED from
mirroring (see ``registry.EXCLUDED_APP_LABELS``) — syncing the sync log
would recurse forever.
"""
from django.db import models


class SyncLog(models.Model):
    """Outcome of one sync operation against Google Sheets."""

    OP_INSERT = "INSERT"
    OP_UPDATE = "UPDATE"
    OP_DELETE = "DELETE"
    OP_REFRESH = "REFRESH"
    OP_BACKFILL = "BACKFILL"
    OPERATIONS = [
        (OP_INSERT, "Insert"),
        (OP_UPDATE, "Update"),
        (OP_DELETE, "Delete"),
        (OP_REFRESH, "Refresh (whole worksheet)"),
        (OP_BACKFILL, "Backfill (whole worksheet)"),
    ]

    STATUS_SUCCESS = "SUCCESS"
    STATUS_RETRYING = "RETRYING"
    STATUS_FAILED = "FAILED"
    STATUSES = [
        (STATUS_SUCCESS, "Success"),
        (STATUS_RETRYING, "Retrying"),
        (STATUS_FAILED, "Failed"),
    ]

    table_name = models.CharField(max_length=200, db_index=True)
    record_id = models.CharField(max_length=64, blank=True, default="")
    operation = models.CharField(max_length=10, choices=OPERATIONS)
    status = models.CharField(max_length=10, choices=STATUSES, db_index=True)
    attempts = models.PositiveSmallIntegerField(default=1)
    error = models.TextField(blank=True, default="")
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-timestamp"]
        verbose_name = "sync log entry"
        verbose_name_plural = "sync log entries"

    def __str__(self):
        return f"{self.operation} {self.table_name}[{self.record_id}] {self.status}"
