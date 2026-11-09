from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from api.models import MunkiRepo
from process import makecatalogs
from process.models import CatalogState


@mock.patch.object(MunkiRepo, 'makecatalogs', return_value=[])
class MakecatalogsTests(TestCase):

    def test_clean_catalogs_do_not_run(self, mkc):
        self.assertFalse(makecatalogs.run())
        mkc.assert_not_called()
        self.assertEqual(makecatalogs.status()['state'], 'clean')

    def test_stale_catalogs_run_once_and_become_clean(self, mkc):
        makecatalogs.mark_stale()
        makecatalogs.mark_stale()
        self.assertEqual(makecatalogs.status()['state'], 'stale')
        self.assertTrue(makecatalogs.run())
        self.assertFalse(makecatalogs.run())
        self.assertEqual(mkc.call_count, 1)
        self.assertEqual(makecatalogs.status()['state'], 'clean')

    def test_request_runs_even_when_clean(self, mkc):
        makecatalogs.request_now()
        self.assertEqual(makecatalogs.status()['state'], 'queued')
        self.assertTrue(makecatalogs.run())
        self.assertEqual(makecatalogs.status()['state'], 'clean')

    def test_change_during_run_queues_exactly_one_follow_up(self, mkc):
        def change_meanwhile():
            makecatalogs.mark_stale()
            makecatalogs.mark_stale()
            makecatalogs.request_now()  # someone clicks during the run
            return []
        mkc.side_effect = change_meanwhile
        makecatalogs.mark_stale()
        makecatalogs.run()
        state = makecatalogs.get_state()
        self.assertTrue(state.requested)
        self.assertGreater(state.changes, state.built)
        mkc.side_effect = None
        makecatalogs.run()
        self.assertEqual(makecatalogs.status()['state'], 'clean')
        self.assertEqual(mkc.call_count, 2)

    def test_running_lock_blocks_second_run(self, mkc):
        makecatalogs.mark_stale()
        CatalogState.objects.filter(pk=1).update(running_since=timezone.now())
        self.assertFalse(makecatalogs.run())
        mkc.assert_not_called()
        self.assertEqual(makecatalogs.status()['state'], 'running')

    def test_dead_lock_is_taken_over(self, mkc):
        makecatalogs.mark_stale()
        CatalogState.objects.filter(pk=1).update(
            running_since=timezone.now() - timedelta(days=1))
        self.assertTrue(makecatalogs.run())

    def test_failure_stays_stale_and_reports_error(self, mkc):
        mkc.side_effect = Exception('repo unreachable')
        makecatalogs.mark_stale()
        makecatalogs.run()
        status = makecatalogs.status()
        self.assertEqual(status['state'], 'failed')
        self.assertIn('repo unreachable', status['error'])
        state = makecatalogs.get_state()
        self.assertGreater(state.changes, state.built)
        self.assertFalse(state.requested)  # no immediate retry loop

    def test_warnings_are_not_failures(self, mkc):
        mkc.return_value = ['WARNING: foo has an empty catalogs array!']
        makecatalogs.mark_stale()
        makecatalogs.run()
        self.assertEqual(makecatalogs.status()['state'], 'clean')

    def test_writing_pkginfo_marks_stale(self, mkc):
        with mock.patch('api.models.repo') as repo:
            MunkiRepo.write({'name': 'x'}, 'pkgsinfo', 'x.plist')
            MunkiRepo.write({'x': 1}, 'manifests', 'site')
            MunkiRepo.delete('icons', 'x.png')
            repo.put.assert_called()
        state = makecatalogs.get_state()
        self.assertEqual(state.changes, 2)


class MakecatalogsRealRunTest(TestCase):
    '''Runs the real Munki makecatalogs against a throwaway copy of a repo'''

    def test_real_run_writes_catalogs(self):
        import os
        import plistlib
        import tempfile
        from munkilib import munkirepo
        with tempfile.TemporaryDirectory() as tmp:
            for kind in ('pkgsinfo', 'catalogs', 'pkgs', 'icons'):
                os.makedirs(os.path.join(tmp, kind))
            with open(os.path.join(tmp, 'pkgsinfo', 'Foo-1.0.plist'), 'wb') as f:
                plistlib.dump({'name': 'Foo', 'version': '1.0',
                               'catalogs': ['testing'],
                               'installer_type': 'nopkg'}, f)
            repo = munkirepo.connect('file://' + tmp, 'FileRepo')
            with mock.patch('api.models.repo', repo):
                makecatalogs.mark_stale()
                self.assertTrue(makecatalogs.run())
            self.assertEqual(makecatalogs.status()['state'], 'clean')
            self.assertEqual(sorted(os.listdir(os.path.join(tmp, 'catalogs'))),
                             ['all', 'testing'])
