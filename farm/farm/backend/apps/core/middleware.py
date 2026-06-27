from apps.core.models import AuditLog

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
METHOD_ACTION = {
    "POST": "CREATE",
    "PUT": "UPDATE",
    "PATCH": "UPDATE",
    "DELETE": "DELETE",
}


def get_client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class AuditTrailMiddleware:
    """Logs every authenticated write request to the AuditLog table."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            self._log(request, response)
        except Exception:  # never break the request because of audit logging
            pass
        return response

    def _log(self, request, response):
        if request.method not in WRITE_METHODS:
            return
        if not request.path.startswith("/api/"):
            return
        if 200 <= response.status_code < 400:
            user = getattr(request, "user", None)
            AuditLog.objects.create(
                user=user if user and user.is_authenticated else None,
                action=METHOD_ACTION.get(request.method, "UPDATE"),
                method=request.method,
                path=request.path[:255],
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[:255],
            )
