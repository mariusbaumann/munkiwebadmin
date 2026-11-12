from django.urls import re_path as url
import pkgsinfo.views
import pkgsinfo.autopkg

from django.conf import settings

try:
    ENABLE_REPO_VIEW = settings.ENABLE_REPO_VIEW
except:
    ENABLE_REPO_VIEW = None

urlpatterns = [
    url(r'^$', pkgsinfo.views.index, name='pkginfo'),
    url(r'^__get_process_status$', pkgsinfo.views.status),
    url(r'^_json$', pkgsinfo.views.getjson),
    url(r'^_autopkg_override$', pkgsinfo.autopkg.start),
    url(r'^_autopkg_override/(?P<job_id>[0-9a-fA-F-]+)$', pkgsinfo.autopkg.result),
]

if ENABLE_REPO_VIEW:
    urlpatterns.append(
        url(r'^_package_json', pkgsinfo.views.list_available_packages_json, name="list_available_packages_json"),
    )
    urlpatterns.append(
        url(r'^_package_icon/(?P<icon_name>.+)$', pkgsinfo.views.package_icon, name="package_icon"),
    )

urlpatterns.append(url(r'^(?P<pkginfo_path>^.*$)', pkgsinfo.views.detail))
