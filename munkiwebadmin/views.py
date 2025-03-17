from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from api.models import MunkiRepo

@login_required
def dashboard(request):
    """
    Dashboard view
    """
    
    manifests = MunkiRepo.list('manifests')
    catalogs = MunkiRepo.list('catalogs')
    catalog = MunkiRepo.read('catalogs', 'all')

    app_list = []
    creation_date = None
    for item in catalog:
        medadata = item.get('_metadata', None)
        if medadata:
            creation_date = medadata.get('creation_date', None)

        # check if the app already exists in the list
        existing_app = next((app for app in app_list if app['name'] == item['name']), None)

        if existing_app:
            # if the version is not already in the list, add it
            if item['version'] not in existing_app["version"]:
                existing_app["version"].append(item['version'])
                existing_app["creation_date"] = creation_date
        else:
            # if the app is not in the list, add it
            app = {
                "name": item['name'],
                "version": [item['version']],
                 "creation_date": creation_date
            }
            app_list.append(app)
            

    context = {
        'page': 'dashboard',
        "catalog_count": len(catalogs),
        "manifest_count": len(manifests),
        "pkgs":  app_list,
    }

    return render(request, "munkiwebadmin/dashboard.html", context)