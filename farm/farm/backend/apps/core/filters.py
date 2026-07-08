from rest_framework.filters import BaseFilterBackend


class UserFilterBackend(BaseFilterBackend):
    """Generic ``?user=<id>`` filtering by ``created_by``.

    Applied to every viewset so the "All Users" dropdown on the frontend
    works on every page automatically.  Filters on ``created_by_id`` which
    is present on every model via ``OwnedModel``.

    A view can opt out by setting ``user_filter_field = None`` (e.g. when
    the ``user`` query param means something else in that viewset).
    """

    def filter_queryset(self, request, queryset, view):
        field = getattr(view, "user_filter_field", "created_by_id")
        if not field:
            return queryset
        user_param = request.query_params.get("user")
        if user_param:
            try:
                queryset = queryset.filter(**{field: user_param})
            except Exception:
                # Bad UUID or field — ignore rather than 500.
                return queryset
        return queryset


class DateRangeFilterBackend(BaseFilterBackend):
    """Generic ``?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`` filtering.

    Applied to every viewset so any list endpoint can be filtered by a date
    range. It filters on the view's ``date_range_field`` (default
    ``created_at`` — present on every model via ``TimeStampedModel``).

    A view can set ``date_range_field = None`` to opt out (e.g. when it already
    handles ``date_from`` / ``date_to`` itself, like the GPS pings viewset),
    or point it at a domain date field (e.g. ``"date"``).
    """

    def filter_queryset(self, request, queryset, view):
        field = getattr(view, "date_range_field", "created_at")
        if not field:
            return queryset
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        try:
            if date_from:
                queryset = queryset.filter(**{f"{field}__date__gte": date_from})
            if date_to:
                queryset = queryset.filter(**{f"{field}__date__lte": date_to})
        except Exception:
            # Bad date string or field — ignore rather than 500.
            return queryset
        return queryset
