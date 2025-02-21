"""
manifests/views.py
"""
from django.http import HttpResponse
from django.shortcuts import render
from django.contrib.auth.decorators import login_required

from api.models import MunkiRepo, FileDoesNotExistError, FileReadError
from process.models import Process

# Added Active-Users related imports
#####################################
from django.utils import timezone
from django.contrib.sessions.models import Session  # Import Session here

import os
from django.conf import settings
#####################################
import json
import logging
import plistlib

logger = logging.getLogger(__name__)
LOGGER = logging.getLogger('munkiwebadmin')

def is_ajax(request):
    return request.META.get('HTTP_X_REQUESTED_WITH') == 'XMLHttpRequest'

def status(request):
    '''Returns status of long-running process'''
    LOGGER.debug('got status request for manifests_list_process')
    status_response = {}
    processes = Process.objects.filter(name='manifests_list_process')
    if processes:
        # display status from one of the active processes
        # (hopefully there is only one!)
        process = processes[0]
        status_response['statustext'] = process.statustext
    else:
        status_response['statustext'] = 'Processing'
    return HttpResponse(json.dumps(status_response),
                        content_type='application/json')

@login_required
def index(request, manifest_path=None):
    '''Returns manifest list or detail and includes active user count'''
    # Add logic to count active users
    try:
        now = timezone.now()
        # Filter for sessions that have not expired
        active_sessions = Session.objects.filter(expire_date__gte=now)
        active_user_count = active_sessions.count()
        logger.info(f"Active user count: {active_user_count}")
    except Exception as e:
        logger.error(f"Error in active_users_count: {e}")
        active_user_count = 0  # Fallback in case of error

    if manifest_path and is_ajax(request):
        # return manifest detail
        if request.method == 'GET':
            LOGGER.debug("Got read request for %s", manifest_path)
            key_list = {'catalogs', 'included_manifests', 'featured_items', 'managed_installs', 'managed_uninstalls', 'managed_updates', 'optional_installs'}
            try:
                plist = MunkiRepo.read('manifests', manifest_path)
                for key in key_list:
                    if key not in plist:
                        plist[key] = []
                plist = plistlib.dumps(plist).decode()
            except (FileDoesNotExistError, FileReadError) as err:
                return HttpResponse(
                    json.dumps({'result': 'failed',
                                'exception_type': str(type(err)),
                                'detail': str(err)}),
                    content_type='application/json', status=404)
            context = {'plist_text': plist,
                       'pathname': manifest_path}
            return render(request, 'manifests/detail.html', context=context)
        if request.method == 'POST':
            return HttpResponse(
                json.dumps({'result': 'failed',
                            'exception_type': 'MethodNotSupported',
                            'detail': 'POST/PUT/DELETE should use the API'}),
                content_type='application/json', status=404)
    
    # Return list of available manifests
    LOGGER.debug("Got index request for manifests")
    context = {'page': 'manifests',
               'manifest_name': manifest_path,
               'active_user_count': active_user_count}  # Added active_user_count to context
    return render(request, 'manifests/manifests.html', context=context)

# Toto je naše funkce pro uložení informací do textového souboru
def log_user_action_to_file(user, action):
    log_file_path = os.path.join(settings.BASE_DIR, 'user_action_log.txt')
    with open(log_file_path, 'a') as log_file:
        log_file.write(f'{timezone.now()} - {user.username} - {action}\n')
