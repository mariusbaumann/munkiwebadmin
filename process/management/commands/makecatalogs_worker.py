'''Runs Makecatalogs every MAKECATALOGS_INTERVAL seconds if the catalogs are
stale, and within a few seconds when someone clicks "Makecatalogs now".'''
import logging
import time

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import close_old_connections

from process import makecatalogs

LOGGER = logging.getLogger('munkiwebadmin')
POLL_SECONDS = 5


class Command(BaseCommand):
    help = 'Background worker that runs Makecatalogs for Stale Catalogs'

    def handle(self, *args, **options):
        interval = getattr(settings, 'MAKECATALOGS_INTERVAL', 300)
        LOGGER.info('makecatalogs worker started, interval %ss', interval)
        # the DB may have been reset (Azure keeps SQLite outside /home), losing
        # Stale Catalogs from before the restart: assume stale, run on first tick
        makecatalogs.mark_stale()
        next_tick = time.monotonic() + interval
        while True:
            close_old_connections()
            try:
                state = makecatalogs.get_state()
                due = time.monotonic() >= next_tick
                if due:
                    next_tick = time.monotonic() + interval
                if state.requested or due:
                    makecatalogs.run()
            except Exception:
                LOGGER.exception('makecatalogs worker iteration failed')
            time.sleep(POLL_SECONDS)
