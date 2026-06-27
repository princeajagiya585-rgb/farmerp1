from django.db import models

from apps.core.models import OwnedModel


class Document(OwnedModel):
    class Category(models.TextChoices):
        FARM = "FARM", "Farm"
        COMPLIANCE = "COMPLIANCE", "Compliance"
        INVOICE = "INVOICE", "Invoice"
        EMPLOYEE = "EMPLOYEE", "Employee"
        MACHINERY = "MACHINERY", "Machinery"
        OTHER = "OTHER", "Other"

    title = models.CharField(max_length=200)
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.OTHER
    )
    file = models.FileField(upload_to="documents/")
    farm = models.ForeignKey(
        "farms.Farm",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="documents",
    )
    description = models.TextField(blank=True)
    tags = models.CharField(max_length=255, blank=True, help_text="comma separated")
    version = models.IntegerField(default=1)
    expiry_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    @property
    def uploaded_by(self):
        return self.created_by


class DocumentVersion(OwnedModel):
    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="versions"
    )
    file = models.FileField(upload_to="documents/versions/")
    version = models.IntegerField(default=1)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-version", "-created_at"]

    def __str__(self):
        return f"{self.document.title} v{self.version}"
