# Django settings for munkiwebadmin project.
import os
import socket

try:
    HOSTNAME = socket.gethostname()
except:
    HOSTNAME = 'localhost'

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_URL = '/static/'
MEDIA_URL = "/media/"

###########################################################################
# munkiwebadmin-specific
###########################################################################
# APPNAME is user-visible web app name
APPNAME = os.getenv('APPNAME', 'MunkiWebAdmin')
MUNKI_REPO_DIR = os.getenv('MUNKI_REPO_DIR', '/munkirepo')
MAKECATALOGS_PATH = os.getenv('MAKECATALOGS_PATH')
MEDIA_ROOT = os.path.join(MUNKI_REPO_DIR, 'icons')
ICONS_URL = MEDIA_URL
CONVERT_TO_QWERTZ = os.getenv('CONVERT_TO_QWERTZ')
VAULT_USERNAME = os.getenv('VAULT_USERNAME', 'admin')
PROXY_ADDRESS = os.getenv('PROXY_ADDRESS', '')
DEFAULT_MANIFEST = os.getenv('DEFAULT_MANIFEST')
MUNKISCRIPTS_PATH = os.path.join(BASE_DIR, 'munkiscripts', 'build')
FIELD_ENCRYPTION_KEY = os.environ.get('FIELD_ENCRYPTION_KEY', 'VDKEyIzST-hbtX7rvA7LPue63E0XB0m3pZEFWKk0BKI=')
REPO_MANAGEMENT_ONLY = os.getenv("REPO_MANAGEMENT_ONLY", 'False').lower() in ('true', '1', 't')

# enable git integration
if os.path.isdir(os.path.join(MUNKI_REPO_DIR, '.git')):
    GIT_PATH = '/usr/bin/git'

SECRET_KEY = os.environ.get("SECRET_KEY", "CHANGEME!!!")
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost 127.0.0.1 [::1]").split(" ")
DEBUG = os.getenv("DEBUG", 'False').lower() in ('true', '1', 't')

CORS_ORIGIN_ALLOW_ALL = DEBUG
CORS_ORIGIN_WHITELIST = ()
LOGIN_EXEMPT_URLS = ()

# django ldap auth
USE_LDAP = False
KERBEROS_REALM = os.getenv('KERBEROS_REALM')

TIMEOUT = 20 # default 20

try:
    execfile("/config/settings.py")
except:
    pass

###########################################################################
# munkiwebadmin-specific end
###########################################################################

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'encrypted_model_fields',

    # our apps
    'api',
    'catalogs',
    'pkgsinfo',
    'manifests',
    'inventory',
    'process',
    'reports',
    'icons',
    'santa',
    'vault',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'munkiwebadmin.urls'
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [ os.path.join(BASE_DIR, 'munkiwebadmin/templates') ],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                "munkiwebadmin.processor.index",
            ],
            'debug': DEBUG,
        },
    },
]

WSGI_APPLICATION = 'munkiwebadmin.wsgi.application'

DATABASES = {
    "default": {
        "ENGINE": os.environ.get("SQL_ENGINE", "django.db.backends.sqlite3"),
        "NAME": os.environ.get("SQL_DATABASE", os.path.join(BASE_DIR, "db.sqlite3")),
        "USER": os.environ.get("SQL_USER", "user"),
        "PASSWORD": os.environ.get("SQL_PASSWORD", "password"),
        "HOST": os.environ.get("SQL_HOST", "localhost"),
        "PORT": os.environ.get("SQL_PORT", "5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [ {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
# https://docs.djangoproject.com/en/1.9/topics/i18n/
LANGUAGE_CODE = os.getenv('LANGUAGE_CODE', 'en-us')
TIME_ZONE = os.getenv('TIME_ZONE', 'UTC')
USE_I18N = True
USE_L10N = True
USE_TZ = True

#### end basic Django settings
if DEBUG:
    LOGLEVEL = 'DEBUG'
else:
    LOGLEVEL = 'WARNING'

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '%(levelname)s %(asctime)s %(module)s %(process)d %(thread)d %(message)s'
        },
        'simple': {
            'format': '%(levelname)s %(message)s'
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple'
        },
        'file': {
            'class':'logging.handlers.RotatingFileHandler',
            'filename': 'munkiwebadmin.log',
            'maxBytes': 1024*1024*5, # 5 MB
            'backupCount': 5,
            'formatter': 'verbose'
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': LOGLEVEL,
            'propagate': False
        },
        'munkiwebadmin': {
            'level': LOGLEVEL,
            'handlers': ['console', 'file'],
            'propagate': False,
        },
    },
}

# needed by django-wsgiserver when using staticserve=collectstatic
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
# Additional locations of static files
STATICFILES_DIRS = (
    # Put strings here, like "/home/html/static" or "C:/www/django/static".
    # Always use forward slashes, even on Windows.
    # Don't forget to use absolute paths, not relative paths.
    os.path.join(BASE_DIR, 'munkiwebadmin/static'),
)

# List of finder classes that know how to find static files in
# various locations.
STATICFILES_FINDERS = (
    'django.contrib.staticfiles.finders.FileSystemFinder',
    'django.contrib.staticfiles.finders.AppDirectoriesFinder',
)

if USE_LDAP:
    if KERBEROS_REALM:
        AUTHENTICATION_BACKENDS = (
            'django_remote_auth_ldap.backend.RemoteUserLDAPBackend',
            'django.contrib.auth.backends.ModelBackend',
        )
    else:
        AUTHENTICATION_BACKENDS = (
            'django_auth_ldap.backend.LDAPBackend',
            'django.contrib.auth.backends.ModelBackend',
        )
else:
    AUTHENTICATION_BACKENDS = (
        'django.contrib.auth.backends.ModelBackend',
    )

LOGIN_URL='/login/'
LOGIN_REDIRECT_URL = '/'

ADMINS = (
     ('Local Admin', 'root@example.com'),
)
MANAGERS = ADMINS