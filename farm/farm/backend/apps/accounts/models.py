import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    SUPER_ADMIN = "SUPER_ADMIN", "Super Administrator"
    FARM_MANAGER = "FARM_MANAGER", "Farm Manager"
    EMPLOYEE = "EMPLOYEE", "Employee / Labour"


class User(AbstractUser):
    """Custom user with role-based access and multi-farm assignment."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.EMPLOYEE)
    phone = models.CharField(max_length=20, blank=True)
    preferred_language = models.CharField(max_length=5, default="en")
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    fcm_token = models.CharField(max_length=255, blank=True)

    # Optional (recommended) Aadhaar identity verification
    aadhaar_number = models.CharField(max_length=12, blank=True)
    aadhaar_photo = models.ImageField(upload_to="aadhaar/", null=True, blank=True)

    # Soft-delete tracking
    deleted_at = models.DateTimeField(null=True, blank=True, editable=False)
    deleted_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        editable=False,
        related_name="deleted_users_set",
    )

    # Multi-farm scoping
    farms = models.ManyToManyField(
        "farms.Farm", related_name="members", blank=True
    )

    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["username"]

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"

    @property
    def is_super_admin(self):
        return self.role == Role.SUPER_ADMIN
