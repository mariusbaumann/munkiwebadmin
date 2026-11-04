"""
pkgsinfo/topology.py

Builds the Topology: the graph of Packages and the Requires and Update For
relationships between them, from the Versions listed in a catalog.
"""

import re
from collections import defaultdict

from catalogs.models import trim_version_string

RELATIONSHIPS = ('requires', 'update_for')


def as_list(value):
    '''A pkginfo edited by hand may hold a single string instead of an array'''
    return [value] if isinstance(value, str) else list(value or [])


def version_of(item):
    return trim_version_string(str(item.get('version', '')))


def version_key(version):
    '''Sort key that orders version strings numerically. Numbers sort above
    letters so mixed versions such as 1.2 and 1.b never fail to compare'''
    return [(1, int(part), '') if part.isdigit() else (0, 0, part)
            for part in re.findall(r'\d+|[a-zA-Z]+', version)]


def versions_by_package(catalog_items):
    '''Groups catalog items by Package name, newest Version first'''
    packages = defaultdict(list)
    for item in catalog_items:
        if item.get('name'):
            packages[item['name']].append(item)
    for versions in packages.values():
        versions.sort(key=lambda item: version_key(version_of(item)),
                      reverse=True)
    return packages


def split_name_and_version(reference):
    '''Splits a reference such as Foo-1.2 or Foo--1.2 the way Munki does.
    Returns (reference, '') when no version follows the separator'''
    for delimiter in ('--', '-'):
        name, found, number = reference.rpartition(delimiter)
        if found and number[:1].isdigit():
            return name, number
    return reference, ''


def resolve_reference(reference, packages):
    '''Returns the Package name and pinned version (or '') for a reference.
    An exact name wins, so a Package called Foo-2 is not read as Foo version 2'''
    if reference in packages:
        return reference, ''
    return split_name_and_version(reference)


def build_edges(packages):
    '''Returns one edge per source, target and kind, across all Versions'''
    edges = {}
    for name, versions in packages.items():
        for item in versions:
            is_latest = version_of(item) == version_of(versions[0])
            for kind in RELATIONSHIPS:
                for reference in as_list(item.get(kind)):
                    target, pin = resolve_reference(reference, packages)
                    edge = edges.setdefault((name, target, kind), {
                        'source': name, 'target': target, 'kind': kind,
                        'older_only': True, 'pinned': [], 'broken': []})
                    edge['older_only'] = edge['older_only'] and not is_latest
                    if pin and pin not in edge['pinned']:
                        edge['pinned'].append(pin)
                        if target in packages and not any(
                                version_of(candidate) == trim_version_string(pin)
                                for candidate in packages[target]):
                            edge['broken'].append(pin)
    return list(edges.values())


def build_node(name, versions):
    latest = versions[0] if versions else {}
    return {
        'name': name,
        'missing': not versions,
        'older_only': True,
        'display_name': latest.get('display_name', ''),
        'icon_name': latest.get('icon_name', ''),
        'versions': [{'version': item.get('version', ''),
                      'catalogs': item.get('catalogs', []),
                      'requires': as_list(item.get('requires')),
                      'update_for': as_list(item.get('update_for'))}
                     for item in versions],
    }


def build_topology(catalog_items):
    '''Returns the nodes and edges of the Topology for catalog_items. A node's
    older_only means every edge pointing at it comes from an older Version'''
    packages = versions_by_package(catalog_items)
    edges = build_edges(packages)
    nodes = {}
    for edge in edges:
        for name in (edge['source'], edge['target']):
            if name not in nodes:
                nodes[name] = build_node(name, packages.get(name, []))
        target = nodes[edge['target']]
        target['older_only'] = target['older_only'] and edge['older_only']
    return {'nodes': [nodes[name] for name in sorted(nodes)], 'edges': edges}
