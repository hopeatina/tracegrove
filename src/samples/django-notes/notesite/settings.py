"""Tracegrove sample: minimal Django notes API. The database lives in the per-run data dir."""
import os

SECRET_KEY = "tracegrove-sample-not-secret"
DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
INSTALLED_APPS = ["notes"]
MIDDLEWARE = ["notes.auth.tracegrove_auth"]
ROOT_URLCONF = "notesite.urls"
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.path.join(os.environ.get("TRACEGROVE_DATA_DIR", "."), "db.sqlite3"),
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
