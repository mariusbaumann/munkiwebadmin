"""
process/views.py
"""
import json

from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt

from process import makecatalogs


def _json(data, status=200):
    return HttpResponse(json.dumps(data), content_type='application/json',
                        status=status)


def index(request):
    '''Not implemented'''
    return _json('view not implemented')


@csrf_exempt
def run(request):
    '''"Makecatalogs now": queue a run for the background worker'''
    if request.method != 'POST':
        return _json('must be a POST request', status=405)
    makecatalogs.request_now()
    return _json(makecatalogs.status())


def status(request):
    '''State of the catalogs: clean, stale, queued, running or failed'''
    return _json(makecatalogs.status())
