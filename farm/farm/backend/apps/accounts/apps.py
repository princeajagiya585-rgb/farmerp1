from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"

    def ready(self):
        import apps.accounts.signals as acc_signals  # noqa
        from django.db.models.signals import m2m_changed
        from django.contrib.auth import get_user_model
        User = get_user_model()
        m2m_changed.connect(
            acc_signals.sync_manager_on_farm_assign,
            sender=User.farms.through,
        )
