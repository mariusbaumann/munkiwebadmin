# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
import logging
import json
from django.http import HttpResponse
from django.utils import timezone  # Import Session here
from django.contrib.sessions.models import Session  # Import Session here
from process.models import Process

from pkgsinfo.models import PKGSINFO_STATUS_TAG

LOGGER = logging.getLogger('munkiwebadmin')

@login_required
def index(request):
    '''Index methods'''
    LOGGER.debug("Got index request for icons")
    
    # Add logic to count active users
    try:
        now = timezone.now()
        # Filter for sessions that have not expired
        active_sessions = Session.objects.filter(expire_date__gte=now)
        active_user_count = active_sessions.count()
        LOGGER.info(f"Active user count: {active_user_count}")
    except Exception as e:
        LOGGER.error(f"Error in active_users_count: {e}")
        active_user_count = 0  # Fallback in case of error
    
    context = {
        'page': 'icons',
        'active_user_count': active_user_count  # Add active_user_count to context
    }
    return render(request, 'icons/icons.html', context=context)

def status(request):
    '''Get and return a status message for the process generating
    the pkgsinfo list'''
    LOGGER.debug('got status request for pkgsinfo_list_process')
    status_response = {}
    processes = Process.objects.filter(name=PKGSINFO_STATUS_TAG)
    if processes:
        # display status from one of the active processes
        # (hopefully there is only one!)
        process = processes[0]
        status_response['statustext'] = process.statustext
    else:
        status_response['statustext'] = 'Processing'
    return HttpResponse(json.dumps(status_response),
                        content_type='application/json')