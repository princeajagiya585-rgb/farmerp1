from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Default pagination that honours a client-supplied ``page_size``.

    Without ``page_size_query_param`` DRF ignores ``?page_size=...`` and caps
    every list at ``PAGE_SIZE`` (25). Many dropdowns request ``page_size=200``
    to load all options (farms, employees, …) — this lets that work, capped
    at ``max_page_size`` for safety.
    """

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 1000
