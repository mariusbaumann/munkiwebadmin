// The Topology page: draws Packages and their Requires and Update For
// relationships, using the data from /topology/_json

var topology = {cy: null, catalog: 'all', latestRequest: 0};

function cssVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
}

var labelMeasure = document.createElement('canvas').getContext('2d');

function labelWidth(node) {
    labelMeasure.font = '12px Helvetica Neue, Helvetica, sans-serif';
    return labelMeasure.measureText(node.id()).width;
}

function topologyStyles() {
    var text = cssVar('--bs-body-color'),
        background = cssVar('--bs-body-bg'),
        surface = cssVar('--bs-tertiary-bg'),
        border = cssVar('--bs-border-color'),
        muted = cssVar('--bs-secondary-color'),
        primary = cssVar('--bs-primary'),
        update = cssVar('--bs-success'),
        danger = cssVar('--bs-danger');
    return [
        {selector: 'node', style: {
            'shape': 'round-rectangle',
            'label': 'data(id)',
            'color': text,
            'font-size': 12,
            'text-valign': 'center',
            'text-halign': 'center',
            'width': labelWidth,
            'height': 14,
            'padding': 9,
            'background-color': surface,
            'border-width': 1,
            'border-color': border,
        }},
        {selector: 'node[?missing]', style: {
            'border-width': 2,
            'border-style': 'dashed',
            'border-color': danger,
            'color': danger,
        }},
        {selector: 'node[?missing][?older_only]', style: {'opacity': 0.5}},
        {selector: 'edge', style: {
            'width': 2,
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'line-color': text,
            'target-arrow-color': text,
            'label': 'data(label)',
            'font-size': 10,
            'color': text,
            'text-background-color': background,
            'text-background-opacity': 1,
            'text-background-padding': 2,
        }},
        {selector: 'edge[kind = "update_for"]', style: {
            'line-style': 'dashed',
            'line-color': update,
            'target-arrow-color': update,
        }},
        {selector: 'edge[?older_only]', style: {
            'line-color': muted,
            'target-arrow-color': muted,
            'opacity': 0.5,
        }},
        {selector: 'edge[?is_broken]', style: {
            'line-color': danger,
            'target-arrow-color': danger,
            'color': danger,
        }},
        {selector: '.selected', style: {
            'border-width': 3,
            'border-color': primary,
        }},
        {selector: '.dimmed', style: {'opacity': 0.12}},
    ];
}

function layoutClusters(cy) {
    // Lay out each Cluster on its own, then place them in rows so that
    // unrelated Packages stay apart
    var gap = 70,
        clusters = cy.elements().components().sort(function(a, b) {
            return b.length - a.length;
        }),
        rowWidth = Math.max(1200, cy.width()),
        x = 0, y = 0, rowHeight = 0;
    clusters.forEach(function(cluster) {
        cluster.layout({name: 'dagre', rankDir: 'LR', nodeSep: 25, rankSep: 90,
                        fit: false, animate: false}).run();
        var box = cluster.boundingBox();
        if (x > 0 && x + box.w > rowWidth) {
            x = 0;
            y += rowHeight + gap;
            rowHeight = 0;
        }
        cluster.nodes().shift({x: x - box.x1, y: y - box.y1});
        x += box.w + gap;
        rowHeight = Math.max(rowHeight, box.h);
    });
    cy.fit(undefined, 30);
}

function clearFocus() {
    topology.cy.elements().removeClass('dimmed selected');
}

function focusChains(nodes) {
    // Everything these Packages need, and everything that needs or updates them
    var chain = nodes.union(nodes.predecessors()).union(nodes.successors());
    topology.cy.elements().addClass('dimmed').removeClass('selected');
    chain.removeClass('dimmed');
    nodes.addClass('selected');
}

function appendList(parent, heading, names) {
    if (!names.length) {
        return;
    }
    $('<h6>').text(heading).appendTo(parent);
    var list = $('<ul>').appendTo(parent);
    names.forEach(function(name) {
        $('<li>').text(name).appendTo(list);
    });
}

function incomingNames(node, kind) {
    return node.incomers('edge[kind = "' + kind + '"]').map(function(edge) {
        return edge.data('source');
    }).sort();
}

function showPanel(node) {
    var data = node.data(),
        content = $('#topology-panel-content').empty(),
        icon = $('#topology-panel-icon');
    $('#topology-panel-name').text(data.id);
    $('#topology-panel-display-name').text(data.display_name);
    icon.prop('hidden', data.missing);
    if (!data.missing) {
        icon.attr('src', data.icon_url);
    }
    if (data.missing) {
        $('<p>').addClass('text-danger mb-0')
                .text('No Version in the ' + topology.catalog + ' catalog.')
                .appendTo(content);
    }
    appendList(content, 'Required by', incomingNames(node, 'requires'));
    appendList(content, 'Updated by', incomingNames(node, 'update_for'));
    if (data.versions.length) {
        $('<h6>').text('Versions').appendTo(content);
    }
    data.versions.forEach(function(version) {
        var row = $('<div>').addClass('topology-version').appendTo(content);
        $('<strong>').text(version.version).appendTo(row);
        version.catalogs.forEach(function(catalog) {
            $('<span>').addClass('badge bg-secondary').text(catalog).appendTo(row);
        });
        appendList(row, 'Requires', version.requires);
        appendList(row, 'Update For', version.update_for);
    });
    // A Missing Package may still have Versions in other catalogs
    var linkCatalog = data.missing ? 'all' : topology.catalog;
    $('#topology-panel-link').attr('href', '/pkgsinfo/?search=' +
        encodeURIComponent(data.id) + '&catalog=' + encodeURIComponent(linkCatalog));
    setPanelHidden(false);
}

function hidePanel() {
    setPanelHidden(true);
}

function setPanelHidden(hidden) {
    // The panel takes width from the graph, so keep the whole graph in view
    var panel = $('#topology-panel'),
        changed = panel.prop('hidden') !== hidden;
    panel.prop('hidden', hidden);
    if (changed && topology.cy) {
        topology.cy.resize();
        topology.cy.fit(undefined, 30);
    }
}

function updateUrl(packageName) {
    var params = new URLSearchParams();
    if (packageName) {
        params.set('package', packageName);
    }
    if (topology.catalog !== 'all') {
        params.set('catalog', topology.catalog);
    }
    var query = params.toString();
    window.history.replaceState(null, '', '/topology/' + (query ? '?' + query : ''));
}

function selectPackage(node) {
    focusChains(node);
    showPanel(node);
    $('#listSearchField').val(node.id());
    updateUrl(node.id());
}

function applySearch() {
    var query = $('#listSearchField').val().trim().toLowerCase();
    if (!topology.cy) {
        return;
    }
    updateUrl($('#listSearchField').val().trim());
    if (!query) {
        clearFocus();
        hidePanel();
        return;
    }
    var nodes = topology.cy.nodes(),
        exact = nodes.filter(function(node) {
            return node.id().toLowerCase() === query;
        }),
        matches = exact.nonempty() ? exact : nodes.filter(function(node) {
            return node.id().toLowerCase().indexOf(query) !== -1;
        });
    if (matches.empty()) {
        topology.cy.elements().addClass('dimmed').removeClass('selected');
        hidePanel();
        return;
    }
    focusChains(matches);
    if (exact.nonempty()) {
        showPanel(exact.first());
    } else {
        hidePanel();
    }
}

function showMessage(message) {
    $('#topology-message').text(message).prop('hidden', !message);
}

function fillCatalogs(data) {
    var select = $('#topology-catalog').empty(),
        names = data.catalogs.slice();
    if (names.indexOf(data.catalog) === -1) {
        names.unshift(data.catalog);
    }
    names.forEach(function(name) {
        $('<option>').val(name).text(name).appendTo(select);
    });
    select.val(data.catalog);
}

function drawTopology(data) {
    if (topology.cy) {
        topology.cy.destroy();
        topology.cy = null;
    }
    hidePanel();
    if (!data.catalog_found) {
        showMessage('The catalog "' + data.catalog + '" could not be read. ' +
                    'Run makecatalogs if it has not been built yet.');
        return;
    }
    if (!data.nodes.length) {
        showMessage('No Packages in the catalog "' + data.catalog +
                    '" have Requires or Update For relationships.');
        return;
    }
    showMessage('');
    var elements = data.nodes.map(function(node) {
        return {data: Object.assign({id: node.name}, node)};
    }).concat(data.edges.map(function(edge) {
        return {data: Object.assign({
            label: edge.pinned.join(', '),
            is_broken: edge.broken.length > 0,
        }, edge)};
    }));
    topology.cy = cytoscape({
        container: document.getElementById('topology-graph'),
        elements: elements,
        style: topologyStyles(),
        layout: {name: 'preset'},
        minZoom: 0.1,
        maxZoom: 3,
    });
    layoutClusters(topology.cy);
    topology.cy.on('tap', 'node', function(event) {
        selectPackage(event.target);
    });
    topology.cy.on('tap', function(event) {
        if (event.target === topology.cy) {
            $('#listSearchField').val('');
            applySearch();
        }
    });
    applySearch();
}

function loadTopology(catalog) {
    var request = ++topology.latestRequest;
    topology.catalog = catalog;
    $.getJSON('/topology/_json', {catalog: catalog}).done(function(data) {
        if (request === topology.latestRequest) {
            fillCatalogs(data);
            drawTopology(data);
        }
    }).fail(function() {
        if (request === topology.latestRequest) {
            showMessage('The Topology could not be loaded.');
        }
    });
}

$(document).ready(function() {
    $('#listSearchField').on('input', applySearch);
    $('#topology-catalog').on('change', function() {
        loadTopology($(this).val());
    });
    $('#topology-panel-close').on('click', function() {
        $('#listSearchField').val('');
        applySearch();
    });
    $('#topology-panel-icon').on('error', function() {
        $(this).prop('hidden', true);
    });
    new MutationObserver(function() {
        if (topology.cy) {
            topology.cy.style(topologyStyles());
        }
    }).observe(document.documentElement, {attributes: true,
                                          attributeFilter: ['data-bs-theme']});
    loadTopology($('#topology-catalog').data('selected'));
});
