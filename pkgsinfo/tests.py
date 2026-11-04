from unittest.mock import patch

from django.contrib.auth.models import Permission, User
from django.test import SimpleTestCase, TestCase

from api.models import FileReadError
from pkgsinfo.topology import build_topology


def version(name, number='1.0', **fields):
    return {'name': name, 'version': number, **fields}


def edges_of(topology):
    return {(edge['source'], edge['target'], edge['kind'])
            for edge in topology['edges']}


def node_names(topology):
    return {node['name'] for node in topology['nodes']}


class TopologyRelationshipsTest(SimpleTestCase):
    def test_requires_draws_an_edge_from_the_package_to_what_it_requires(self):
        topology = build_topology([
            version('Foo', requires=['Bar']),
            version('Bar'),
        ])
        self.assertEqual(edges_of(topology), {('Foo', 'Bar', 'requires')})

    def test_packages_without_relationships_are_left_out(self):
        topology = build_topology([
            version('Foo', requires=['Bar']),
            version('Bar'),
            version('Standalone'),
        ])
        self.assertEqual(node_names(topology), {'Foo', 'Bar'})

    def test_update_for_draws_an_edge_from_the_update_to_its_package(self):
        topology = build_topology([
            version('FooUpdate', update_for=['Foo']),
            version('Foo'),
        ])
        self.assertEqual(edges_of(topology), {('FooUpdate', 'Foo', 'update_for')})

    def test_a_package_with_no_version_in_the_catalog_is_a_missing_package(self):
        topology = build_topology([version('Foo', requires=['Bar'])])
        missing = {node['name']: node['missing'] for node in topology['nodes']}
        self.assertEqual(missing, {'Foo': False, 'Bar': True})


class TopologyOlderVersionsTest(SimpleTestCase):
    def test_a_relationship_only_on_older_versions_is_marked_older_only(self):
        topology = build_topology([
            version('Office', '16.70', requires=['OfficeBase']),
            version('Office', '16.80', requires=['OfficeTools']),
            version('OfficeBase'),
            version('OfficeTools'),
        ])
        older_only = {edge['target']: edge['older_only']
                      for edge in topology['edges']}
        self.assertEqual(older_only, {'OfficeBase': True, 'OfficeTools': False})

    def test_latest_compares_versions_numerically_not_as_text(self):
        topology = build_topology([
            version('Office', '9.0', requires=['Old']),
            version('Office', '10.0', requires=['New']),
            version('Old'),
            version('New'),
        ])
        older_only = {edge['target']: edge['older_only']
                      for edge in topology['edges']}
        self.assertEqual(older_only, {'Old': True, 'New': False})

    def test_a_missing_package_referenced_only_by_older_versions_is_faded(self):
        topology = build_topology([
            version('Foo', '1.0', requires=['Gone']),
            version('Foo', '2.0', requires=['AlsoGone']),
        ])
        older_only = {node['name']: node['older_only']
                      for node in topology['nodes'] if node['missing']}
        self.assertEqual(older_only, {'Gone': True, 'AlsoGone': False})


class TopologyPinnedReferencesTest(SimpleTestCase):
    def only_edge(self, *items):
        edges = build_topology(list(items))['edges']
        self.assertEqual(len(edges), 1)
        return edges[0]

    def test_a_pinned_reference_points_at_the_package_and_names_the_version(self):
        edge = self.only_edge(version('Foo', requires=['Bar-1.2']),
                              version('Bar', '1.2'))
        self.assertEqual((edge['target'], edge['pinned'], edge['broken']),
                         ('Bar', ['1.2'], []))

    def test_a_pin_to_a_version_absent_from_the_catalog_is_broken(self):
        edge = self.only_edge(version('Foo', requires=['Bar-1.2']),
                              version('Bar', '2.0'))
        self.assertEqual((edge['target'], edge['broken']), ('Bar', ['1.2']))

    def test_a_pin_matches_a_version_differing_only_by_trailing_zeros(self):
        edge = self.only_edge(version('Foo', requires=['Bar-1.2']),
                              version('Bar', '1.2.0'))
        self.assertEqual(edge['broken'], [])

    def test_double_hyphen_separates_name_and_version(self):
        edge = self.only_edge(version('Foo', requires=['Bar--1.2']),
                              version('Bar', '1.2'))
        self.assertEqual((edge['target'], edge['pinned']), ('Bar', ['1.2']))

    def test_an_exact_name_wins_over_splitting_off_a_version(self):
        edge = self.only_edge(version('Foo', requires=['Photoshop-2024']),
                              version('Photoshop-2024'),
                              version('Photoshop', '2024'))
        self.assertEqual((edge['target'], edge['pinned']), ('Photoshop-2024', []))

    def test_a_hyphenated_name_without_a_version_is_not_split(self):
        edge = self.only_edge(version('Foo', requires=['Adobe-Reader']),
                              version('Adobe-Reader'))
        self.assertEqual((edge['target'], edge['pinned']), ('Adobe-Reader', []))

    def test_a_hyphenated_name_with_a_version_keeps_its_whole_name(self):
        edge = self.only_edge(version('Foo', requires=['Adobe-Reader-11.0']),
                              version('Adobe-Reader', '11.0'))
        self.assertEqual((edge['target'], edge['pinned']), ('Adobe-Reader', ['11.0']))

    def test_a_pin_to_a_missing_package_marks_the_package_not_the_edge(self):
        topology = build_topology([version('Foo', requires=['Gone-1.2'])])
        self.assertEqual(topology['edges'][0]['broken'], [])
        self.assertEqual(topology['edges'][0]['target'], 'Gone')
        self.assertIn('Gone', {n['name'] for n in topology['nodes'] if n['missing']})


class TopologyEdgeCasesTest(SimpleTestCase):
    def test_a_cycle_is_drawn_as_it_is(self):
        topology = build_topology([version('Foo', requires=['Bar']),
                                   version('Bar', requires=['Foo'])])
        self.assertEqual(edges_of(topology), {('Foo', 'Bar', 'requires'),
                                              ('Bar', 'Foo', 'requires')})

    def test_a_reference_written_as_a_single_string_still_draws_an_edge(self):
        topology = build_topology([version('Foo', requires='Bar'),
                                   version('Bar')])
        self.assertEqual(edges_of(topology), {('Foo', 'Bar', 'requires')})

    def test_an_item_without_a_name_is_ignored(self):
        topology = build_topology([{'version': '1.0', 'requires': ['Bar']}])
        self.assertEqual(topology, {'nodes': [], 'edges': []})

    def test_an_item_without_a_version_does_not_break_the_graph(self):
        topology = build_topology([{'name': 'Foo', 'requires': ['Bar']}])
        self.assertEqual(edges_of(topology), {('Foo', 'Bar', 'requires')})

    def test_an_empty_catalog_has_an_empty_topology(self):
        self.assertEqual(build_topology([]), {'nodes': [], 'edges': []})


class TopologyPanelDetailTest(SimpleTestCase):
    def node(self, topology, name):
        return next(n for n in topology['nodes'] if n['name'] == name)

    def test_a_package_lists_its_versions_newest_first_with_their_details(self):
        topology = build_topology([
            version('Foo', '9.0', requires=['Bar-1.2'], catalogs=['testing'],
                    display_name='Old Foo'),
            version('Foo', '10.0', update_for=['Baz'], catalogs=['production'],
                    display_name='New Foo'),
        ])
        self.assertEqual(self.node(topology, 'Foo')['versions'], [
            {'version': '10.0', 'catalogs': ['production'],
             'requires': [], 'update_for': ['Baz']},
            {'version': '9.0', 'catalogs': ['testing'],
             'requires': ['Bar-1.2'], 'update_for': []},
        ])

    def test_a_package_takes_display_name_and_icon_from_its_latest_version(self):
        topology = build_topology([
            version('Foo', '9.0', requires=['Bar'], display_name='Old Foo',
                    icon_name='old.png'),
            version('Foo', '10.0', display_name='New Foo', icon_name='new.png'),
        ])
        node = self.node(topology, 'Foo')
        self.assertEqual((node['display_name'], node['icon_name']),
                         ('New Foo', 'new.png'))

    def test_a_missing_package_has_no_versions(self):
        topology = build_topology([version('Foo', requires=['Gone'])])
        self.assertEqual(self.node(topology, 'Gone')['versions'], [])


CATALOGS = {
    'all': [
        {'name': 'Foo', 'version': '1.0', 'requires': ['Bar'],
         'icon_name': 'foo.png'},
        {'name': 'Bar', 'version': '1.0'},
        {'name': 'Baz', 'version': '1.0', 'update_for': ['Bar']},
    ],
    'production': [{'name': 'Foo', 'version': '1.0', 'requires': ['Bar']}],
    'quiet': [{'name': 'Standalone', 'version': '1.0'}],
}


def fake_read(kind, name):
    if kind == 'catalogs' and name in CATALOGS:
        return CATALOGS[name]
    raise FileReadError('no such file')


@patch('pkgsinfo.views.MunkiRepo.read', side_effect=fake_read)
@patch('pkgsinfo.views.MunkiRepo.list', return_value=sorted(CATALOGS))
class TopologyViewTest(TestCase):
    def login(self, with_permission=True):
        user = User.objects.create_user('someone', password='pw')
        if with_permission:
            user.user_permissions.add(
                Permission.objects.get(codename='view_pkginfofile'))
        self.client.force_login(user)

    def test_anonymous_users_are_sent_to_login(self, *_):
        for url in ('/topology/', '/topology/_json'):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 302)
            self.assertIn('/login', response['Location'])

    def test_users_without_the_permission_get_403(self, *_):
        self.login(with_permission=False)
        for url in ('/topology/', '/topology/_json'):
            self.assertEqual(self.client.get(url).status_code, 403)

    def test_page_renders_for_users_with_the_permission(self, *_):
        self.login()
        response = self.client.get('/topology/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Topology')

    def test_json_defaults_to_the_all_catalog(self, *_):
        self.login()
        data = self.client.get('/topology/_json').json()
        self.assertEqual({node['name'] for node in data['nodes']},
                         {'Foo', 'Bar', 'Baz'})
        self.assertEqual(data['catalog'], 'all')
        self.assertTrue(data['catalog_found'])

    def test_json_reads_the_selected_catalog(self, *_):
        self.login()
        data = self.client.get('/topology/_json?catalog=production').json()
        missing = {n['name'] for n in data['nodes'] if n['missing']}
        self.assertEqual(missing, {'Bar'})

    def test_json_lists_the_catalogs_to_choose_from(self, *_):
        self.login()
        data = self.client.get('/topology/_json').json()
        self.assertEqual(data['catalogs'], ['all', 'production', 'quiet'])

    def test_json_gives_existing_packages_an_icon_url(self, *_):
        self.login()
        nodes = {n['name']: n for n in
                 self.client.get('/topology/_json').json()['nodes']}
        self.assertEqual(nodes['Foo']['icon_url'], '/api/icons/foo.png')
        self.assertEqual(nodes['Bar']['icon_url'], '/api/icons/Bar.png')

    def test_a_catalog_with_no_relationships_is_found_but_empty(self, *_):
        self.login()
        data = self.client.get('/topology/_json?catalog=quiet').json()
        self.assertTrue(data['catalog_found'])
        self.assertEqual(data['nodes'], [])

    def test_an_unknown_catalog_is_reported_and_never_read(self, _list, read):
        self.login()
        data = self.client.get(
            '/topology/_json', {'catalog': '../pkgsinfo/secret'}).json()
        self.assertFalse(data['catalog_found'])
        self.assertEqual(data['nodes'], [])
        read.assert_not_called()

    def test_an_unreadable_catalog_is_reported_as_not_found(self, _list, read):
        self.login()
        read.side_effect = FileReadError('broken')
        data = self.client.get('/topology/_json').json()
        self.assertFalse(data['catalog_found'])
