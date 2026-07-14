from django.db import migrations, models


class Migration(migrations.Migration):
    """Add the partial UNIQUE constraints in their own transaction.

    Kept separate from 0013's dedupe so the CREATE UNIQUE INDEX does not run in
    the same transaction as the dedupe DELETEs (Postgres: "cannot CREATE INDEX
    ... because it has pending trigger events").
    """

    dependencies = [
        ("finance", "0013_expense_uniq_expense_source_and_more"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="expense",
            constraint=models.UniqueConstraint(
                condition=models.Q(("source_type", ""), _negated=True),
                fields=("source_type", "source_id"),
                name="uniq_expense_source",
            ),
        ),
        migrations.AddConstraint(
            model_name="revenueentry",
            constraint=models.UniqueConstraint(
                condition=models.Q(("source_type", ""), _negated=True),
                fields=("source_type", "source_id"),
                name="uniq_revenue_source",
            ),
        ),
    ]
