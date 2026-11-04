# MunkiWebAdmin

A web interface for administering a Munki repository: the software it offers, how that software is organised into catalogs, and how the pieces relate to each other.

## Language

### Software

**Package**:
Everything in the repo that shares one Munki `name`, across all its Versions. This includes anything Munki can install, such as printer drivers, profiles and scripts, not only applications.
_Avoid_: App, item, software

**Version**:
One specific release of a Package, described by a single pkginfo file.
_Avoid_: Pkginfo, item

### Relationships

**Requires**:
A relationship in which one Package needs another Package to be installed first.
_Avoid_: Dependency, depends on

**Update For**:
A relationship in which one Package is an add-on or patch that applies to another Package.
_Avoid_: Patch of, child of

**Missing Package**:
A Package named in a Requires or Update For relationship that has no Version in the selected catalog.
_Avoid_: Broken package, orphan

### Topology

**Topology**:
The graph of Packages and the Requires and Update For relationships between them. It leaves out Packages that have no relationships.
_Avoid_: Dependency graph, tree

**Cluster**:
A group of Packages connected to each other, directly or indirectly, within the Topology.
_Avoid_: Group, family
