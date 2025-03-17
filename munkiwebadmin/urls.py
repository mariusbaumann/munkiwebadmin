from django.urls import re_path as url
from django.urls import include
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from  django.contrib.auth.views import LoginView, logout_then_login
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView
from django.shortcuts import redirect
from django.core.exceptions import ImproperlyConfigured

from .views import dashboard
from pkgsinfo.views import list_available_packages

from django.contrib import admin
admin.autodiscover()

try:
	BASE_DIR = settings.BASE_DIR
except:
	BASE_DIR = ""
      
try:
    ENABLE_REPO_VIEW = settings.ENABLE_REPO_VIEW
except:
    ENABLE_REPO_VIEW = None

urlpatterns = [
    url(r'^admin/', admin.site.urls),
    url(r'^login/', LoginView.as_view(template_name='registration/login.html'), name='login'),
    url(r'^logout/', logout_then_login, name='logout'),
    url(r'^oauth2/', include('django_auth_adfs.urls')),
    url(r'^api/', include('api.urls')),
    url(r'^dashboard/', dashboard, name="dashboard"),  
    url(r'^manifests/', include('manifests.urls')),
    url(r'^catalogs/', include('catalogs.urls')),
    url(r'^pkgsinfo/', include('pkgsinfo.urls')),
    url(r'^icons/', include('icons.urls')),
    url(r'^santa/', include('santa.urls')),
    url(r'^makecatalogs/', include('process.urls')),
    url(r'^monitoring/', include('monitoring.urls')),
]

if ENABLE_REPO_VIEW:
    urlpatterns.append(url(r'^packages/', list_available_packages, name="list_available_packages"))

    urlpatterns.append(url(r'^$', RedirectView.as_view(url="/packages/")))
else:
    urlpatterns.append(url(r'^$', RedirectView.as_view(url="/dashboard/")))


# comment out the following if you are serving
# static files a different way
urlpatterns += staticfiles_urlpatterns()

# debug/development serving MEDIA files (icons)
try:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
except ImproperlyConfigured:
    print("**** MEDIA_URL or MEDIA_ROOT missing from settings.py       ****")
    print("**** copy MEDIA_URL or MEDIA_ROOT from settings_template.py ****")
    raise
