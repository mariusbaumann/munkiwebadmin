from django.apps import AppConfig

class MunkiWebAdminConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'munkiwebadmin'

    def ready(self):
        import munkiwebadmin.signals 