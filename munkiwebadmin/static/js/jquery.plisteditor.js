// PlistEditor

// © 2015 Greg Neagle
// Inspired by and borrowing code from Davis Durman's FlexiJsonEditor
// https://github.com/DavidDurman/FlexiJsonEditor

// Dependencies:

// * Bootstrap 5
//  (not strictly dependent on Bootstrap, but you may find it painful without)
// * jQuery (most recently tested with v1.11.2)
// * JSON (use json2 library for browsers that do not support JSON natively)

// Example:
//     $('#mydiv').plistEditor(jsobj, opt);

(function( $ ) {

    $.fn.plistEditor = function(obj, options) {
        options = options || {};
        
        var K = function() {};
        var onchange = options.change || K;
        var onpropertyclick = options.propertyclick || K;
        var key_list = options.keylist;
        var key_types = options.keytypes;
        var validator = options.validator
        // keys offered by "Add list" inside a Conditional Item
        var conditional_keys = options.conditionalkeys;
        // which key titles the cards of an array, e.g. {installs: 'path'}
        var card_titles = options.cardtitles || {};
        // show values with more than one entry as collapsed cards
        var collapse_values = !!options.collapsevalues;
        // suggest(path) returns the names to offer for a string, or null
        var suggest = options.suggest || null;

        return this.each(function() {
            PlistEditor($(this), obj, onchange, onpropertyclick, key_list, key_types, validator, conditional_keys, card_titles, collapse_values, suggest);
        });

    };

    function PlistEditor(target, obj, onchange, onpropertyclick, key_list, key_types, validator, conditional_keys, card_titles, collapse_values, suggest) {
        var opt = {
            target: target,
            onchange: onchange,
            onpropertyclick: onpropertyclick,
            key_list: key_list,
            key_types: key_types,
            validator: validator,
            conditional_keys: conditional_keys,
            card_titles: card_titles,
            collapse_values: collapse_values,
            suggest: suggest,
            original: obj,
        };
        target.addClass('plist-root');
        construct(opt, obj, target, null);
        resizeTextOnWidthChange(target);
    }

    // Cards the user has collapsed. Keyed on the dict itself rather than its
    // path, so the state follows a card through reordering and re-rendering.
    var collapsedCards = new WeakSet();
    // Value cards start collapsed, so track the ones the user has expanded.
    // Scripts are strings, which a WeakSet can't hold, so those go by path.
    var expandedValues = new WeakSet();
    var expandedPaths = new Set();

    function isExpanded(val, path) {
        return isString(val) ? expandedPaths.has(path) : expandedValues.has(val);
    }

    function setExpanded(val, path, expanded) {
        if (isString(val)) {
            if (expanded) expandedPaths.add(path); else expandedPaths.delete(path);
        } else if (isObject(val) || isArray(val)) {
            if (expanded) expandedValues.add(val); else expandedValues.delete(val);
        }
    }

    function isDate(o) {
        return Object.prototype.toString.call(o) == '[object Date]';
    }
    function isObject(o) {
        return Object.prototype.toString.call(o) == '[object Object]'; 
    }
    function isArray(o) {
        return Object.prototype.toString.call(o) == '[object Array]';
    }
    function isBoolean(o) {
        return Object.prototype.toString.call(o) == '[object Boolean]';
    }
    function isNumber(o) {
        return Object.prototype.toString.call(o) == '[object Number]';
    }
    function isInteger(o) {
        return (isNumber(o) && Math.round(o) == o);
    }
    function isString(o) {
        return Object.prototype.toString.call(o) == '[object String]';
    }
    var types = 'object array boolean number string date null';

    // Feeds object `o` with `value` at `path`. If value argument is omitted,
    // object at `path` will be deleted from `o`.
    // Example:
    //      feed({}, 'foo.bar.baz', 10);
    // returns { foo: { bar: { baz: 10 } } }
    function feed(o, path, value) {
        var del = arguments.length == 2;
        
        if (path.indexOf('.') > -1) {
            var diver = o,
                i = 0,
                parts = path.split('.');
            for (var len = parts.length; i < len - 1; i++) {
                diver = diver[parts[i]];
            }
            if (del) {
                if (getType(diver) == 'array') {
                    var index = parts[len - 1];
                    diver.splice(index, 1);
                } else { delete diver[parts[len - 1]]; }
            } else { diver[parts[len - 1]] = value; }
        } else {
            if (del) {
                if (getType(diver) == 'array') {
                    o.splice(path, 1);
                } else { delete o[path]; }
            } else { o[path] = value; }
        }
        return o;
    }

    // Get a property by path from object o if it exists. 
    // If not, return defaultValue.
    // Example:
    //     def({ foo: { bar: 5 } }, 'foo.bar', 100);   // returns 5
    //     def({ foo: { bar: 5 } }, 'foo.baz', 100);   // returns 100
    function def(o, path, defaultValue) {
        path = path.split('.');
        var i = 0;
        while (i < path.length) {
            if ((o = o[path[i++]]) == undefined) return defaultValue;
        }
        return o;
    }

    function error(reason) { if (window.console) { console.error(reason); } }
    
    function parse(str) {
        var res;
        try { res = JSON.parse(str); }
        catch (e) { res = null; error('JSON parse failed'); }
        return res;
    }

    function stringify(obj) {
        var res;
        try { res = JSON.stringify(obj); }
        catch (e) { res = 'null'; error('JSON stringify failed.'); }
        return res;
    }
    
    function lastPathItem(path) {
        return path.split('.').pop();
    }

    function parentPath(path) {
        return path.split('.').slice(0, -1).join('.');
    }

    function valueAt(opt, path) {
        return path ? def(opt.original, path) : opt.original;
    }

    function isArrayItem(opt, path) {
        return path !== '' && isArray(valueAt(opt, parentPath(path)));
    }

    function isConditionalItem(path, obj) {
        return /(^|\.)conditional_items\.\d+$/.test(path) &&
               (!obj.hasOwnProperty('condition') || isString(obj.condition));
    }

    // Does this value render as one or more cards once it has content?
    function holdsCards(opt, val, path) {
        if (isObject(val)) return true;
        if (!isArray(val)) return false;
        var defaultValue = get_default_value(path, opt.key_types);
        return val.some(isObject) ||
               (isArray(defaultValue) && isObject(defaultValue[0]));
    }

    // Would deleting this value take cards with content along with it?
    function deletesCards(val) {
        if (isObject(val)) return Object.keys(val).length > 0;
        return isArray(val) && val.some(isObject);
    }

    // Grow each text value to fit. All heights are reset before any is read,
    // so a long manifest only forces one layout.
    function resizeText(container) {
        var fields = container.find('textarea.value:visible').toArray();
        fields.forEach(function(field) { field.style.height = 'auto'; });
        var heights = fields.map(function(field) {
            return field.scrollHeight + field.offsetHeight - field.clientHeight;
        });
        fields.forEach(function(field, i) {
            field.style.height = heights[i] + 'px';
        });
        container.find('.plist-script').each(function() {
            var editor = $(this).data('editor');
            if (editor) editor.resize();
        });
    }

    function isScript(path, val) {
        return isString(val) && !!path &&
               (/_script$/.test(lastPathItem(path)) || val.slice(0, 2) == '#!');
    }

    var SCRIPT_MODES = [[/python/, 'python'], [/perl/, 'perl'],
                        [/ruby/, 'ruby'], [/osascript/, 'applescript']];

    // highlighting follows the shebang; Munki scripts are shell by default
    function scriptMode(text) {
        var shebang = text.split('\n')[0];
        if (shebang.slice(0, 2) == '#!') {
            for (var i = 0; i < SCRIPT_MODES.length; i++) {
                if (SCRIPT_MODES[i][0].test(shebang)) {
                    return 'ace/mode/' + SCRIPT_MODES[i][1];
                }
            }
        }
        return 'ace/mode/sh';
    }

    // An Ace editor with line numbers and highlighting, like the Plist tab.
    // Created when first shown, as a long pkginfo may hold many scripts.
    function scriptEditor(opt, root, text) {
        var host = $('<div>', {'class': 'plist-script'});
        root.append(host);
        function init() {
            if (host.data('editor')) return;
            var editor = ace.edit(host[0]),
                session = editor.getSession(),
                dark = document.documentElement.getAttribute('data-bs-theme') == 'dark',
                timer = null;
            editor.setOptions({minLines: 3, maxLines: 40, fontSize: '0.875rem',
                               showPrintMargin: false, highlightActiveLine: false,
                               tabSize: 4, useSoftTabs: true});
            editor.setTheme(dark ? 'ace/theme/tomorrow_night' : 'ace/theme/xcode');
            session.getDocument().setNewLineMode('unix');
            session.setMode(scriptMode(text));
            editor.setValue(text, -1);
            function save() {
                clearTimeout(timer);
                var path = host.closest('[data-bs-path]').attr('data-bs-path'),
                    value = editor.getValue();
                if (valueAt(opt, path) === value) return;
                feed(opt.original, path, value);
                session.setMode(scriptMode(value));
                refreshCardHeader(host);
                opt.onchange(opt.original);
            }
            session.on('change', function() {
                clearTimeout(timer);
                timer = setTimeout(save, 400);
            });
            editor.on('blur', save);
            host.data('editor', editor);
        }
        if (host.closest('.collapsed').length) {
            host.one('plist:expand', init);
        } else {
            // once the row is in the page, so Ace can measure it
            setTimeout(init, 0);
        }
    }

    // Best matches first: names starting with the text, then shorter names
    // (so "Firefox" comes before "Firefox-120.0").
    function rankSuggestions(names, text) {
        var needle = text.trim().toLowerCase();
        return names.filter(function(name) {
            return name.toLowerCase().indexOf(needle) != -1;
        }).sort(function(a, b) {
            var aStarts = a.toLowerCase().indexOf(needle) == 0,
                bStarts = b.toLowerCase().indexOf(needle) == 0;
            if (aStarts != bStarts) return aStarts ? -1 : 1;
            return a.length - b.length || a.localeCompare(b);
        }).slice(0, 50);
    }

    // Autocomplete for a string whose path asks for names, e.g. an item of
    // managed_installs. Asks for the names on each search, as the catalog
    // data arrives after the editor is built and rows can move.
    function addSuggestions(opt, field, path) {
        if (!opt.suggest || !opt.suggest(path) || !$.fn.autocomplete) return;
        function currentPath() {
            return field.closest('[data-bs-path]').attr('data-bs-path') || path;
        }
        field.autocomplete({
            minLength: 0,
            delay: 0,
            classes: {'ui-autocomplete': 'plist-suggestions'},
            source: function(request, response) {
                response(rankSuggestions(opt.suggest(currentPath()) || [],
                                         request.term));
            },
            focus: function() { return false; },
            select: function(event, ui) {
                field.val(ui.item.value).trigger('change');
                return false;
            }
        });
        field.autocomplete('instance')._renderItem = function(ul, item) {
            var text = item.value,
                at = text.toLowerCase().indexOf(field.val().trim().toLowerCase()),
                length = field.val().trim().length,
                label = $('<div>');
            if (length && at != -1) {
                label.append(document.createTextNode(text.slice(0, at)),
                             $('<mark>').text(text.slice(at, at + length)),
                             document.createTextNode(text.slice(at + length)));
            } else {
                label.text(text);
            }
            return $('<li>').append(label).appendTo(ul);
        };
        // show the choices as soon as the field is entered
        field.on('focus', function() {
            field.autocomplete('search', field.val());
        });
    }

    function expandScripts(card) {
        card.find('.plist-script').trigger('plist:expand');
    }

    function destroyScripts(root) {
        root.find('.plist-script').each(function() {
            var editor = $(this).data('editor');
            if (editor) editor.destroy();
        });
    }

    function scheduleResizeText(opt) {
        if (opt.resize_pending) return;
        opt.resize_pending = true;
        setTimeout(function() {
            opt.resize_pending = false;
            resizeText(opt.target);
        }, 0);
    }

    // Text wraps differently at a new width, and a hidden tab has no width
    // until it is shown.
    function resizeTextOnWidthChange(target) {
        if (target.data('plist-resize-observer')) return;
        var lastWidth = null;
        var observer = new ResizeObserver(function(entries) {
            var width = entries[0].contentRect.width;
            if (width !== lastWidth) {
                lastWidth = width;
                resizeText(target);
            }
        });
        observer.observe(target[0]);
        target.data('plist-resize-observer', observer);
    }

    function resizeOneField() {
        resizeText($(this).parent());
    }

    function addButton(label, handler) {
        var appender = $('<div>', {'class': 'plist-add'}),
            btn = $('<button>', {'type': 'button',
                                 'class': 'btn btn-primary btn-sm'});
        btn.append($('<i>', {'class': 'fa fa-plus', 'aria-hidden': 'true'}));
        btn.append(document.createTextNode(' ' + label));
        btn.click(handler);
        appender.append(btn);
        return appender;
    }

    function deleteButton(opt, iconClass, label) {
        var btn = $('<button>', {'type': 'button',
                                 'class': 'row_del_btn btn btn-sm plist-icon-btn',
                                 'aria-label': label,
                                 'title': label});
        btn.append($('<i>', {'class': 'fa ' + iconClass, 'aria-hidden': 'true'}));
        btn.click(confirmDeleteOfCards(opt));
        return btn;
    }

    // Deleting cards with content takes a second click, as there is no undo
    // short of discarding every unsaved edit.
    function confirmDeleteOfCards(opt) {
        var remove = deleteRow(opt);
        return function() {
            var btn = $(this),
                path = btn.closest('[data-bs-path]').data('bs-path');
            if (!deletesCards(valueAt(opt, path)) || btn.hasClass('plist-armed')) {
                remove.call(this);
                return;
            }
            var icon = btn.children().detach();
            btn.addClass('plist-armed btn-danger').text('Delete?');
            setTimeout(function() {
                btn.removeClass('plist-armed btn-danger').empty().append(icon);
            }, 3000);
        };
    }

    function rowControls(opt, iconClass, label) {
        var _rowControls = $('<td>', {'class': 'row-controls'});
        _rowControls.append(deleteButton(opt, iconClass, label));
        return _rowControls;
    }

    function refreshCardHeader(element) {
        var refresh = element.closest('.plist-card').data('refreshHeader');
        if (refresh) refresh();
    }

    function focusAdded(root, path, onKey) {
        var row = root.find('[data-bs-path]').filter(function() {
            return this.getAttribute('data-bs-path') === path;
        }).first();
        var script = row.find('.plist-script').first();
        if (!onKey && script.length) {
            // the editor is created once the row is in the page
            setTimeout(function() {
                var editor = script.data('editor');
                if (!editor) return;
                script[0].scrollIntoView({block: 'nearest'});
                editor.focus();
            }, 0);
            return;
        }
        var field = onKey ? row.find('.property').first() :
            row.find('textarea.value, input.value, select.value')
               .not('[type=checkbox]').first();
        if (!field.length) return;
        field[0].scrollIntoView({block: 'nearest'});
        field.focus().select();
    }

    function keyAdder(opt, obj, root, path, isConditional) {
        var label = isConditional ? 'Add list' : 'Add key',
            childPath = function(key) { return (path ? path + '.' : '') + key; },
            choices = null;
        if (isConditional) {
            choices = opt.conditional_keys;
        } else if (!path && opt.key_types) {
            choices = Object.keys(opt.key_types).sort(function(a, b) {
                return a.localeCompare(b);
            });
        }
        function added(key, onKey) {
            construct(opt, obj, root, path);
            opt.onchange(opt.original);
            focusAdded(root, childPath(key), onKey);
        }
        function addNamed(key) {
            obj[key] = get_default_value(childPath(key), opt.key_types);
            // show what was just added rather than a collapsed card
            setExpanded(obj[key], childPath(key), true);
            added(key, false);
        }
        function addOther() {
            added(addNewValue(obj), true);
        }
        if (!choices) {
            return addButton(label, addOther);
        }
        return keyPicker(label, choices.filter(function(key) {
            return !obj.hasOwnProperty(key);
        }), function(key) {
            addNamed(key);
        }, function(typed) {
            if (typed && !obj.hasOwnProperty(typed)) {
                addNamed(typed);
            } else {
                addOther();
            }
        });
    }

    // A button opening a searchable menu of keys. "Other" stays available
    // whatever the search, and takes what was typed as the new key's name.
    function keyPicker(label, keys, onPick, onOther) {
        var appender = $('<div>', {'class': 'plist-add dropdown'}),
            btn = $('<button>', {'type': 'button',
                                 'class': 'btn btn-primary btn-sm dropdown-toggle',
                                 'data-bs-toggle': 'dropdown',
                                 'aria-expanded': 'false'}),
            menu = $('<div>', {'class': 'dropdown-menu plist-key-menu'}),
            search = $('<input>', {'type': 'search',
                                   'class': 'form-control form-control-sm',
                                   'placeholder': 'Search keys…',
                                   'aria-label': 'Search keys'}).attr('autocomplete', 'off'),
            list = $('<div>', {'class': 'plist-key-list'}),
            other = $('<button>', {'type': 'button', 'class': 'dropdown-item'}),
            items = keys.map(function(key) {
                return $('<button>', {'type': 'button', 'class': 'dropdown-item'})
                    .text(key).data('key', key);
            }),
            dropdown;

        function typed() {
            return search.val().trim();
        }

        // what Enter would add: an exact match, else the first one shown
        function target() {
            var text = typed().toLowerCase(),
                shown = items.filter(function(item) {
                    return !item.hasClass('d-none');
                }),
                exact = shown.filter(function(item) {
                    return item.data('key').toLowerCase() === text;
                });
            return exact[0] || shown[0] || other;
        }

        function filter() {
            var text = typed().toLowerCase();
            items.forEach(function(item) {
                item.toggleClass('d-none',
                    item.data('key').toLowerCase().indexOf(text) == -1);
            });
            other.text(typed() ? 'Other: "' + typed() + '"' : 'Other…');
            list.find('.dropdown-item').removeClass('active');
            if (text) target().addClass('active');
        }

        items.forEach(function(item) {
            list.append(item);
            item.click(function() {
                dropdown.hide();
                onPick(item.data('key'));
            });
        });
        other.click(function() {
            var text = typed();
            dropdown.hide();
            onOther(text);
        });
        list.append(other);

        search.on('input', filter);
        search.on('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                target().click();
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                list.find('.dropdown-item:not(.d-none)').first().focus();
            }
        });

        btn.append($('<i>', {'class': 'fa fa-plus', 'aria-hidden': 'true'}));
        btn.append(document.createTextNode(' ' + label));
        menu.append($('<div>', {'class': 'plist-key-search'}).append(search), list);
        appender.append(btn, menu);

        // fixed, so that the card frames around it can't clip the menu
        dropdown = new bootstrap.Dropdown(btn[0], {popperConfig: {strategy: 'fixed'}});
        btn.on('shown.bs.dropdown', function() {
            search.focus();
        });
        btn.on('hidden.bs.dropdown', function() {
            search.val('');
            filter();
        });
        filter();
        return appender;
    }

    function cardTitle(opt, obj, path) {
        var titleKey = opt.card_titles[lastPathItem(parentPath(path))],
            title = titleKey ? obj[titleKey] : null;
        return (isString(title) && title) ||
               '#' + (parseInt(lastPathItem(path), 10) + 1);
    }

    function cardSummary(obj, isConditional) {
        var keys = Object.keys(obj);
        if (!isConditional) {
            return keys.length + (keys.length == 1 ? ' key' : ' keys');
        }
        return keys.filter(function(key) {
            return key != 'condition';
        }).map(function(key) {
            return isArray(obj[key]) ? obj[key].length + ' ' + key : key;
        }).join(', ');
    }

    function conditionField(opt, obj, path) {
        var conditionPath = path + '.condition',
            field = $('<div>', {'class': 'plist-condition',
                                'data-bs-path': conditionPath,
                                'data-bs-type': 'string'}),
            textarea = $('<textarea>', {'class': 'value form-control',
                                        'rows': 1,
                                        'aria-label': 'Condition'}),
            feedback = $('<div>', {'class': 'invalid-feedback'})
                .text('This Conditional Item has no Condition.');
        function markIfMissing() {
            textarea.toggleClass('is-invalid', !textarea.val().trim());
        }
        textarea.val(obj.condition || '');
        markIfMissing();
        textarea.on('input', resizeOneField).on('input', markIfMissing);
        textarea.change(valueChanged(opt));
        return field.append(textarea, feedback);
    }

    function collapseToggle(collapsed, onToggle) {
        var toggle = $('<button>', {'type': 'button',
                                    'class': 'btn btn-sm plist-icon-btn plist-card-toggle',
                                    'aria-label': 'Collapse or expand',
                                    'aria-expanded': String(!collapsed)});
        toggle.append($('<i>', {'class': 'fa fa-chevron-down', 'aria-hidden': 'true'}));
        toggle.click(function() {
            var nowCollapsed = onToggle();
            toggle.attr('aria-expanded', String(!nowCollapsed));
        });
        return toggle;
    }

    // Is a value a script, or does it have more than one entry, and so
    // become a value card?
    function isCollapsible(opt, val, path) {
        if (!opt.collapse_values) return false;
        if (isScript(path, val)) return !!window.ace;
        var size = isArray(val) ? val.length :
                   isObject(val) ? Object.keys(val).length : 0;
        return size > 1;
    }

    // e.g. "3 entries: testing, production, beta", "2 keys: path, md5checksum"
    // or "#!/bin/sh · 12 lines"
    function valueSummary(val) {
        if (isString(val)) {
            var lines = val ? val.split('\n') : [];
            return (lines[0] ? lines[0] + ' · ' : '') + lines.length +
                   (lines.length == 1 ? ' line' : ' lines');
        }
        var parts = isArray(val) ? val : Object.keys(val || {}),
            nouns = isArray(val) ? ['entry', 'entries'] : ['key', 'keys'],
            count = parts.length + ' ' + nouns[parts.length == 1 ? 0 : 1],
            names = parts.filter(function(part) {
                return isString(part) || isNumber(part);
            });
        return names.length && names.length == parts.length ?
            count + ': ' + names.join(', ') : count;
    }

    // A value with more than one entry sits in the value column as a card,
    // collapsed until the user expands it. Returns the card's body, which the
    // value is rendered into. Looks up the value when toggled, as reordering
    // replaces the array and renaming changes the row's path.
    function valueCard(opt, tableRow, cell, val) {
        var card = $('<div>', {'class': 'plist-card plist-value-card'}),
            header = $('<div>', {'class': 'plist-card-header'}),
            summary = $('<span>', {'class': 'plist-card-summary'}),
            body = $('<div>', {'class': 'plist-card-body',
                               'data-bs-type': getType(val)}),
            collapsed = !isExpanded(val, tableRow.attr('data-bs-path'));
        function current() {
            return valueAt(opt, tableRow.attr('data-bs-path'));
        }
        var toggle = collapseToggle(collapsed, function() {
            var nowCollapsed = card.toggleClass('collapsed').hasClass('collapsed');
            setExpanded(current(), tableRow.attr('data-bs-path'), !nowCollapsed);
            if (!nowCollapsed) expandScripts(card);
            if (!nowCollapsed) resizeText(card);
            return nowCollapsed;
        });
        header.on('click', function(event) {
            if (!$(event.target).closest('.plist-card-toggle').length) toggle.click();
        });
        card.toggleClass('collapsed', collapsed);
        card.data('refreshHeader', function() {
            summary.text(valueSummary(current()));
        });
        summary.text(valueSummary(val));
        cell.append(card.append(header.append(toggle, summary), body));
        return body;
    }

    function buildCard(opt, obj, path, isConditional, content, adder) {
        var card = $('<div>', {'class': 'plist-card'}),
            header = $('<div>', {'class': 'plist-card-header'}),
            body = $('<div>', {'class': 'plist-card-body'}),
            collapsed = collapsedCards.has(obj),
            title = $('<span>', {'class': 'plist-card-title'}),
            summary = $('<span>', {'class': 'plist-card-summary'}),
            toggle = collapseToggle(collapsed, function() {
                var nowCollapsed = card.toggleClass('collapsed').hasClass('collapsed');
                if (nowCollapsed) collapsedCards.add(obj); else collapsedCards.delete(obj);
                if (!nowCollapsed) expandScripts(card);
                if (!nowCollapsed) resizeText(card);
                return nowCollapsed;
            });

        card.toggleClass('collapsed', collapsed);
        card.toggleClass('plist-card-conditional', isConditional);

        header.append($('<i>', {'class': 'grabber fa fa-bars',
                                'aria-hidden': 'true'}));
        header.append(toggle);
        if (isConditional) {
            header.append($('<span>', {'class': 'badge text-bg-primary plist-if'}).text('IF'));
            header.append(conditionField(opt, obj, path));
        } else {
            header.append(title);
        }
        header.append(summary);
        header.append(deleteButton(opt, 'fa-trash',
            isConditional ? 'Delete Conditional Item' : 'Delete'));

        function refresh() {
            title.text(cardTitle(opt, obj, path));
            summary.text(cardSummary(obj, isConditional));
        }
        refresh();
        card.data('refreshHeader', refresh);

        body.append(content, adder);
        return card.append(header, body);
    }

    function addNewValue(obj, default_value) {
        var new_value = null;
        if ( ! (default_value == undefined) ) {
            new_value = default_value;
        }
        if (isArray(obj)) {
            obj.push(new_value);
            return obj.length - 1;
        }

        if (isObject(obj)) {
            var i = 1, newName = "newKey";

            while (obj.hasOwnProperty(newName)) {
                newName = "newKey" + i;
                i++;
            }

            obj[newName] = new_value;
            return newName;
        }

        return null;
    }

    function clone(obj) {
        // See http://stackoverflow.com/questions/728360/most-elegant-way-to-clone-a-javascript-object
        var copy;

        // Handle the 3 simple types, and null or undefined
        if (null == obj || "object" != typeof obj) return obj;

        // Handle Date
        if (obj instanceof Date) {
            copy = new Date();
            // we actually want the current date and not a copy of the
            // date stored at the time the default object was created
            //copy.setTime(obj.getTime());
            return copy;
        }

        // Handle Array
        if (obj instanceof Array) {
            copy = [];
            for (var i = 0, len = obj.length; i < len; i++) {
                copy[i] = clone(obj[i]);
            }
            return copy;
        }

        // Handle Object
        if (obj instanceof Object) {
            copy = {};
            for (var attr in obj) {
                if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
            }
            return copy;
        }

        throw new Error("Unable to copy obj! Its type isn't supported.");
    }

    function get_default_value(path, key_types) {
        // if key name (last item in 'path') is in our list of key types,
        // return the type of item that should be in the array for this key
        var path_items = path.split('.'),
            last_path_item = path_items[path_items.length - 1];
        var defaultValue = null;
        if (key_types && key_types.hasOwnProperty(last_path_item)) {
            defaultValue = clone(key_types[last_path_item]);
        }
        return defaultValue;
    }

    function construct(opt, obj, root, path) {
        path = path || '';
        destroyScripts(root);
        root.children().remove();
        scheduleResizeText(opt);
        var objType = getType(obj);
        if (objType == 'dict') {
            // a dict in an array is a card; under a key it may be a value card
            var isCard = isArrayItem(opt, path),
                isConditional = isCard && isConditionalItem(path, obj),
                table = $('<table>', {"class": "table table-sm plist-table"}),
                tableBody = $('<tbody>', {'class': 'dict'});
            if (opt.key_list) {
                var keys = Object.keys(opt.key_list);
            } else {
                var keys = Object.keys(obj);
            }
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                // a Conditional Item's Condition is its card's heading
                if (isConditional && key == 'condition') continue;
                if (obj.hasOwnProperty(key)) {
                    var dataPath = (path ? path + '.' : '') + key;
                    var tableRow = $('<tr>', {'data-bs-path': dataPath});
                    var rowHeader = $('<th>', {'scope': 'row'});
                    if (!opt.key_list) {
                        var keyElement = $('<input>',
                            {'class': 'property form-control'});
                        keyElement.val(key).attr('title', key);
                        keyElement.click(propertyClicked(opt));
                        keyElement.change(propertyChanged(opt));
                    } else {
                        var keyElement = $('<div>' + opt.key_list[key] + '</div>');
                        keyElement.val(key).attr('title', key);
                    }
                    rowHeader.append(keyElement);
                    var rowValue = $('<td>',
                                     {'data-bs-type': getType(obj[key])});
                    var valueHost = isCollapsible(opt, obj[key], dataPath) ?
                        valueCard(opt, tableRow, rowValue, obj[key]) : rowValue;
                    construct(opt, obj[key], valueHost, dataPath);
                    tableRow.append(rowHeader).append(rowValue);
                    if (!opt.key_list) {
                       // only show delete control if we aren't showing the
                       // special/important keys
                       tableRow.append(isObject(obj[key]) || isArray(obj[key]) ?
                           rowControls(opt, 'fa-trash', 'Delete ' + key) :
                           rowControls(opt, 'fa-xmark', 'Delete ' + key));
                    }
                    tableBody.append(tableRow);
                }
            }
            table.append(tableBody);
            var adder = opt.key_list ? null :
                keyAdder(opt, obj, root, path, isConditional);
            if (isCard) {
                root.append(buildCard(opt, obj, path, isConditional, table, adder));
            } else {
                root.append(table, adder);
            }
        } else if (objType == 'array') {
            // array
            var table = $('<table>', {"class": "table table-sm plist-table"}),
                tableBody = $('<tbody>', {'class': 'array'});
            for (var i=0; i<obj.length; ++i) {
                var dataPath = (path ? path + '.' : '') + i;
                var isCardRow = isObject(obj[i]);
                var tableRow = $('<tr>', {'data-bs-path': dataPath});
                tableRow.toggleClass('plist-card-row', isCardRow);
                var rowValue = $('<td>',
                                 {'data-bs-type': getType(obj[i])});
                construct(opt, obj[i], rowValue, dataPath);
                if (isCardRow) {
                    // a card carries its own drag handle and delete button
                    tableRow.append(rowValue);
                } else {
                    var rowHeader = $('<th>', {'scope': 'row'});
                    rowHeader.append($('<i>', {'class': 'grabber fa fa-bars',
                                               'aria-hidden': 'true'}));
                    tableRow.append(rowHeader, rowValue,
                                    rowControls(opt, 'fa-xmark', 'Delete item'));
                }
                tableBody.append(tableRow);
            }
            // make array elements re-orderable
            tableBody.sortable({
                items: '> tr',
                handle: '.grabber',
                axis: 'y',
                start: function(event, ui) {
                    // store the value for the object that is moving
                    // so we still have it if the object is dragged
                    // to a different array
                    var val = def(opt.original, ui.item.data('bs-path'));
                    ui.item.data('value', val);
                    // an absolutely positioned row would shrink to its content
                    ui.helper.width(ui.item.parent().width());
                    // Some tweaks for the drop placeholder
                    ui.placeholder.height(ui.helper.outerHeight()-10);
                },
                update: function( event, ui ) {
                    var newArray = [],
                        childItems = $(event.target).children('tr');
                    $(childItems).each(function() {
                        if ($(this).data('value') != undefined) {
                            var val = $(this).data('value');
                        } else {
                            var path = $(this).data('bs-path')
                            var val = def(opt.original, path);
                        }
                        newArray.push(val);
                    });
                    // the array's cell, or the body of its value card
                    var valueElement = $(event.target).closest('[data-bs-type]'),
                        parentTableRow = valueElement.closest('tr'),
                        path = parentTableRow.data('bs-path');
                    if (expandedValues.has(valueAt(opt, path))) {
                        expandedValues.add(newArray);
                    }
                    feed(opt.original, path, newArray);
                    construct(opt, newArray, valueElement, path);
                    refreshCardHeader(valueElement);
                    opt.onchange(opt.original);
                }
            });
            table.append(tableBody);
            root.append(table);
            var defaultValue = get_default_value(path, opt.key_types);
            if (isArray(defaultValue)) defaultValue = defaultValue[0];
            var addLabel = 'Add item';
            if (lastPathItem(path) == 'conditional_items') {
                addLabel = 'Add Conditional Item';
            } else if (holdsCards(opt, obj, path)) {
                addLabel = 'Add entry';
            }
            root.append(addButton(addLabel, function() {
                    var index = addNewValue(obj, defaultValue);
                    construct(opt, obj, root, path);
                    refreshCardHeader(root);
                    opt.onchange(opt.original);
                    focusAdded(root, (path ? path + '.' : '') + index, false);
            }));
        } else if (objType == 'null') {
            valueElement = typeSelect();
            root.append(valueElement);
            valueElement.change(valueChanged(opt));
        } else if (objType == 'boolean') {
            var toggleSwitch = checkbox(obj);
            root.append(toggleSwitch);
            toggleSwitch.find('input').change(valueChanged(opt));
        } else if (objType == 'string' && isScript(path, obj) && window.ace) {
            scriptEditor(opt, root, obj);
        } else if (objType == 'string') {
            var rows = obj.split('\n').length;
            if (rows == 1 && obj.length > 79) { rows = 2 };
            valueElement = $('<textarea>', 
                            {'class': 'value form-control', 'rows': rows});
            valueElement.val(obj);
            valueElement.on('input', resizeOneField);
            root.append(valueElement);
            addSuggestions(opt, valueElement, path);
            if (opt.validator) {
                var extraClass = opt.validator(path, obj);
                if (extraClass) root.addClass(extraClass);
            }
            valueElement.change(valueChanged(opt));
        } else {
            valueElement = $('<input>', 
                             {'class': 'value form-control'});
            if (objType == 'date') {
                var val = obj.toISOString().slice(0, 19) + 'Z';
            } else {
                var val = stringify(obj);
            }
            valueElement.val(val).attr('title', val);
            root.append(valueElement);
            valueElement.change(valueChanged(opt));
        }
    };

    var switchCount = 0;

    // a toggle switch labelled with the plist value
    function checkbox(currentValue) {
        var id = 'plist-switch-' + (++switchCount),
            input = $('<input>', {'type': 'checkbox', 'role': 'switch', 'id': id,
                                  'class': 'form-check-input value'})
                .prop('checked', currentValue),
            label = $('<label>', {'class': 'form-check-label', 'for': id})
                .text(currentValue ? 'true' : 'false');
        input.on('change', function() {
            label.text(this.checked ? 'true' : 'false');
        });
        return $('<div>', {'class': 'form-check form-switch plist-switch'})
            .append(input, label);
    }

    function typeSelect() {
        var arr = [
          {val: null,       text: 'Select type'},
          {val: 'string',   text: 'String'},
          {val: 0,          text: 'Integer'},
          {val: false,      text: 'Boolean'},
          {val: new Date(), text: 'Date'},
          {val: [],         text: 'Array'},
          {val: {},         text: 'Dict'}
        ];

        var sel = $('<select>', {'class': 'value form-control'});
        $(arr).each(function() {
            sel.append($("<option>").attr('value',
                stringify(this.val)).text(this.text));
        });
        return sel;
    }

    function propertyClicked(opt) {
        return function() {
            var tableRow = $(this).closest('tr'),
            path = $(tableRow).data('bs-path');
            var safePath = path.split('.').join('\'][\'');
            opt.onpropertyclick('[\'' + safePath + '\']');
        };
    }

    function propertyChanged(opt) {
        return function() {
            //parent is <th>; its parent is <tr>
            //alert('propertyChanged');
            var tableRow = $(this).closest('tr'),
                prevPath = $(tableRow).data('bs-path'),
                newKey = $(this).val(),
                oldKey = $(this).attr('title'),
                val = def(opt.original, prevPath, null),
                hadNoValue = (val == null),
                valueHost = $(tableRow).parent();

            // store the new key
            $(this).attr('title', newKey);

            // remove oldKey and value
            feed(opt.original, prevPath);
            // insert newKey and value
            if (newKey) {
                // calculate the newPath
                var pathElements = prevPath.split('.')
                pathElements.pop();
                pathElements.push(newKey);
                var newPath = pathElements.join('.');
                if (val == null && opt.key_types) {
                    // update the default value based on key name
                    val = get_default_value(newPath, opt.key_types);
                }
                feed(opt.original, newPath, val);
                //update the tableRow's data path
                $(tableRow).data('bs-path', newPath);
                // jQuery doesn't actually update the DOM; in order that we
                // can see what's going on, we'll also update the DOM item
                $(tableRow).attr('data-bs-path', newPath);
                //paths for all sub-elements need to be updated, so just
                //re-construct the value
                //th is $(this).parent(); next item is td (value)
                var valueElement = $(this).parent().next(),
                    cardBody = valueElement.find('> .plist-value-card > .plist-card-body');
                if (cardBody.length) valueElement = cardBody;
                valueElement.attr('data-bs-type', getType(val));
                if (hadNoValue && (isArray(val) || isObject(val))) {
                    // the row's layout depends on what its value holds
                    renderParent(opt, tableRow, newPath);
                } else {
                    construct(opt, val, valueElement, newPath);
                }
            } else {
                $(tableRow).remove();
            }
            refreshCardHeader(valueHost);
            opt.onchange(opt.original);
        };
    }

    // Rebuild the container a row lives in, for when the row's own layout or
    // the paths of its siblings have changed.
    function renderParent(opt, tableRow, path) {
        var container = tableRow.parent().closest('[data-bs-type], .plist-root'),
            containerPath = parentPath(path);
        construct(opt, valueAt(opt, containerPath), container, containerPath);
    }

    function deleteRow(opt){
        return function() {
            var tableRow = $(this).closest('[data-bs-path]'),
                path = $(tableRow).data('bs-path'),
                card = $(tableRow).closest('.plist-card');
            // remove oldKey and value
            stringify(feed(opt.original, path));
            if ($(tableRow).closest('tbody').hasClass('array')) {
                // the paths of the rows after this one are now wrong
                renderParent(opt, tableRow, path);
            } else {
                $(tableRow).remove();
            }
            refreshCardHeader(card);
            opt.onchange(opt.original);
        };
    }

    function getValue(valueElement, path) {
        console.log(valueElement);
        var type = $(valueElement).closest('[data-bs-type]').data('bs-type');
        if (type == 'string') {
            // do not parse value; just return it as-is
            val = $(valueElement).val();
        } else if (type == 'date') {
            // attempt to parse as a valid date
            var timestamp = Date.parse($(valueElement).val());
            if (isNaN(timestamp)) {
                // invalid date string
                alert("Invalid date!")
                $(valueElement).closest('td').addClass('table-danger');
                timestamp = 0;
            } else {
                $(valueElement).parent().closest('td').removeClass('table-danger');
            }
            val = new Date(timestamp);
        } else if (type == 'boolean') {
            // boolean, which is displayed as a checkbox; is it checked?
            val = $(valueElement).is(':checked');
        } else {
            // parse as JSON
            val = parse($(valueElement).val() || 'null');
            // TO-DO: validate that type wasn't changed -- like number to bool
        }
        return val
    }

    function valueChanged(opt) {
        return function() {
            var val = null,
                tableRow = $(this).closest('[data-bs-path]'),
                path = $(tableRow).data('bs-path');

            if ($(this).is('select')) {
                // null type; select new type
                val = parse($(this).val() || 'null');
                var type = getType(val);
                if (type == 'string') {
                    // strings and dates are both strings in JSON
                    // so try to parse the string as a date
                    var timestamp = Date.parse(val);
                    if (!isNaN(timestamp)) {
                        type = 'date';
                        val = new Date(timestamp);
                    }
                }
                if (type == 'dict' || type == 'array') {
                    // the row's layout depends on what its value holds
                    feed(opt.original, path, val);
                    renderParent(opt, tableRow, path);
                    opt.onchange(opt.original);
                    return;
                }
                var parent = $(this).parent();
                parent.data('bs-type', type);
                // jQuery doesn't actually update the DOM, so we're going to
                parent.attr('data-bs-type', type);
                construct(opt, val, parent, path);
                // set focus
                if ( type == 'string' || type == 'number') {
                    parent.children()[0].focus();
                    parent.children()[0].select();
                }
            } else {
                val = getValue($(this));
            }
            if (opt.validator) {
                // this is a cheat and ties us to Bootstrap 3 contextual classes
                $(this).parent().removeClass('table-success table-info table-warning table-danger');
                console.log(path, val)
                var extraClass = opt.validator(path, val);
                if (extraClass) $(this).parent().addClass(extraClass);
            }
            feed(opt.original, path, val);
            refreshCardHeader(tableRow);
            opt.onchange(opt.original);
        };
    }

    function getType(val) {
        var type = 'null';
        
        if (isDate(val)) type = 'date';
        else if (isObject(val)) type = 'dict';
        else if (isArray(val)) type = 'array';
        else if (isBoolean(val)) type = 'boolean';
        else if (isString(val)) type = 'string';
        else if (isNumber(val)) type = 'number';
        //error(type);
        return type
    }

})( jQuery );
