"""Middleware that disables CSRF enforcement for all /api/ routes.

Since this is a pure API backend that authenticates via JWT bearer tokens
(rather than Django session cookies), CSRF protection is unnecessary and
actively harmful — it causes a 500 error on POST requests that include an
Origin header matching CSRF_TRUSTED_ORIGINS (as browsers naturally do for
cross-origin SPA requests).

See Django ticket: https://code.djangoproject.com/ticket/35827
"""

from django.utils.deprecation import MiddlewareMixin


class CsrfExemptApiMiddleware(MiddlewareMixin):
    """Skip CSRF checks for any request path starting with /api/."""

    def process_request(self, request):
        if request.path.startswith("/api/"):
            request.csrf_processing_done = True
