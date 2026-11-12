'''Create AutoPkg override: proxies the Windmill flow so its token never
reaches the browser. One view starts a run, the other is polled for its result.'''
import json
import logging

import requests
from django.conf import settings
from django.contrib.auth.decorators import login_required, permission_required
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

LOGGER = logging.getLogger('munkiwebadmin')
TIMEOUT = 30

TEXT_FIELDS = ('software_name', 'download_url', 'developer', 'vendor',
               'display_name', 'description', 'category',
               'munki_repo_subdir', 'parent_recipe')
BOOL_FIELDS = ('unattended_install', 'unattended_uninstall',
               'prefer_own_recipe', 'overwrite', 'run_build')
REQUIRED = ('software_name', 'download_url')


def _windmill(method, path, **kwargs):
    if not settings.WINDMILL_TOKEN:
        raise RuntimeError('WINDMILL_TOKEN is not set on the server.')
    response = requests.request(
        method, settings.WINDMILL_WORKSPACE_URL.rstrip('/') + path,
        headers={'Authorization': 'Bearer ' + settings.WINDMILL_TOKEN},
        timeout=TIMEOUT, **kwargs)
    if not response.ok:
        # Windmill answers errors with the reason as text
        raise RuntimeError('Windmill: %s %s' % (response.status_code,
                                                response.text[:500]))
    return response


def _error(message, status):
    return JsonResponse({'error': message}, status=status)


@login_required
@permission_required('pkgsinfo.change_pkginfofile', raise_exception=True)
@require_POST
def start(request):
    try:
        form = json.loads(request.body)
    except ValueError:
        return _error('Invalid JSON.', 400)
    inputs = {key: str(form.get(key) or '').strip() for key in TEXT_FIELDS}
    missing = [key for key in REQUIRED if not inputs[key]]
    if missing:
        return _error('Missing: ' + ', '.join(missing), 400)
    inputs.update({key: bool(form.get(key)) for key in BOOL_FIELDS})
    inputs['catalogs'] = [c for c in (str(c).strip() for c in form.get('catalogs') or []) if c]
    inputs.update(settings.WINDMILL_AUTOPKG_DEFAULTS)
    try:
        job_id = _windmill('POST', '/jobs/run/f/' + settings.WINDMILL_AUTOPKG_FLOW,
                           json=inputs).text.strip().strip('"')
    except (RuntimeError, requests.RequestException) as err:
        LOGGER.error('Create AutoPkg override failed to start: %s', err)
        return _error(str(err), 502)
    LOGGER.info('%s started AutoPkg override for %s: job %s',
                request.user, inputs['software_name'], job_id)
    return JsonResponse({'job_id': job_id})


@login_required
@permission_required('pkgsinfo.change_pkginfofile', raise_exception=True)
@require_GET
def result(request, job_id):
    try:
        data = _windmill('GET', '/jobs_u/completed/get_result_maybe/' + job_id).json()
    except (RuntimeError, requests.RequestException, ValueError) as err:
        return _error(str(err), 502)
    if not data.get('completed'):
        return JsonResponse({'completed': False})
    res = data.get('result')
    if isinstance(res, dict) and isinstance(res.get('error'), dict):
        return JsonResponse({'completed': True,
                             'error': res['error'].get('message') or 'The flow failed.'})
    return JsonResponse({'completed': True, 'result': res})
