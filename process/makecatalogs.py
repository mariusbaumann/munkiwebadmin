'''
process/makecatalogs.py

Stale Catalog tracking and the Makecatalogs run itself.
See docs/adr/0001-makecatalogs-in-background-worker.md
'''
import logging
from datetime import timedelta

from django.conf import settings
from django.db.models import F, Q
from django.utils import timezone

from process.models import CatalogState

LOGGER = logging.getLogger('munkiwebadmin')

# a run older than this is assumed dead (worker killed mid-run)
LOCK_TIMEOUT = timedelta(
    seconds=getattr(settings, 'MAKECATALOGS_LOCK_TIMEOUT', 3600))


def _row():
    return CatalogState.objects.filter(pk=1)


def get_state():
    return CatalogState.objects.get_or_create(pk=1)[0]


def mark_stale():
    '''A Version changed: the catalogs are stale until the next Makecatalogs'''
    get_state()
    _row().update(changes=F('changes') + 1)


def request_now():
    '''Ask the worker to run Makecatalogs as soon as possible'''
    get_state()
    _row().update(requested=True)


def status():
    '''One of clean, stale, queued, running, failed, plus the error'''
    state = get_state()
    if state.running_since and state.running_since > timezone.now() - LOCK_TIMEOUT:
        name = 'running'
    elif state.requested:
        name = 'queued'
    elif state.last_error:
        name = 'failed'
    elif state.changes > state.built:
        name = 'stale'
    else:
        name = 'clean'
    return {'state': name, 'error': state.last_error,
            'interval': getattr(settings, 'MAKECATALOGS_INTERVAL', 300)}


def _claim():
    '''Take the lock. A conditional UPDATE is atomic, so only one worker
    (even across instances) gets it.'''
    now = timezone.now()
    return _row().filter(
        Q(running_since__isnull=True) | Q(running_since__lt=now - LOCK_TIMEOUT)
    ).update(running_since=now, requested=False) == 1


def run(force=False):
    '''Run Makecatalogs if the catalogs are stale (or force/requested).
    Returns True if it ran.'''
    from api.models import MunkiRepo  # imports munkilib, keep it lazy

    state = get_state()
    if not (force or state.requested or state.changes > state.built):
        return False
    if not _claim():
        return False
    generation = get_state().changes
    LOGGER.info('makecatalogs started (changes=%s)', generation)
    error = ''
    try:
        problems = MunkiRepo.makecatalogs()
        for problem in problems:
            LOGGER.warning('makecatalogs: %s', problem)
        error = '\n'.join(p for p in problems if not p.startswith('WARNING'))
    except Exception as err:  # repo unreachable, MakeCatalogsError, ...
        LOGGER.exception('makecatalogs failed')
        error = str(err) or err.__class__.__name__
    update = {'running_since': None, 'finished_at': timezone.now(),
              'last_error': error}
    if not error:
        update['built'] = generation
    _row().update(**update)
    state = get_state()
    if not error and state.changes > state.built:
        # changed while we ran: exactly one follow-up, never a pile-up
        _row().update(requested=True)
    LOGGER.info('makecatalogs finished%s', ' with errors' if error else '')
    return True
