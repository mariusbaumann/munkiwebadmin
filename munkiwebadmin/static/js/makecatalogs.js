// Navbar badge for Stale Catalogs. Makecatalogs itself runs in the
// background worker (docs/adr/0001-makecatalogs-in-background-worker.md).
// Fires 'makecatalogs:done' on document when a run finishes.

(function () {
    var lastState = null;
    var timer = null;

    var LOOK = {
        stale:   {cls: 'btn-outline-warning', icon: 'fa-solid fa-triangle-exclamation',
                  label: 'Catalogs stale',
                  text: 'Changes are not applied to the catalogs yet. ' +
                        'They are applied automatically within %m minutes.'},
        queued:  {cls: 'btn-outline-secondary', icon: 'fa-solid fa-spinner fa-spin',
                  label: 'Makecatalogs queued…',
                  text: 'Makecatalogs starts in a few seconds.'},
        running: {cls: 'btn-outline-secondary', icon: 'fa-solid fa-spinner fa-spin',
                  label: 'Makecatalogs running…',
                  text: 'Makecatalogs is running. You can keep working.'},
        failed:  {cls: 'btn-outline-danger', icon: 'fa-solid fa-circle-xmark',
                  label: 'Makecatalogs failed',
                  text: 'The last Makecatalogs failed. It is retried automatically ' +
                        'every %m minutes while the catalogs are stale.'}
    };

    function render(status) {
        var $item = $('#makecatalogsStatus');
        var look = LOOK[status.state];
        if (!look) {
            $item.addClass('d-none');
            return;
        }
        var minutes = Math.round((status.interval || 300) / 60);
        $('#makecatalogsBadge')
            .removeClass('btn-outline-warning btn-outline-secondary btn-outline-danger')
            .addClass(look.cls);
        $('#makecatalogsBadgeIcon').attr('class', look.icon);
        $('#makecatalogsBadgeLabel').text(look.label);
        $('#makecatalogsText').text(look.text.replace('%m', minutes));
        $('#makecatalogsError').text(status.error || '').toggleClass('d-none', !status.error);
        var busy = status.state === 'running' || status.state === 'queued';
        $('#makecatalogsNow').toggleClass('disabled', busy);
        $item.removeClass('d-none');
    }

    function schedule(state) {
        clearTimeout(timer);
        var busy = state === 'running' || state === 'queued';
        timer = setTimeout(refreshMakecatalogsStatus, busy ? 3000 : 30000);
    }

    function handle(status) {
        var wasBusy = lastState === 'running' || lastState === 'queued';
        var isBusy = status.state === 'running' || status.state === 'queued';
        render(status);
        if (wasBusy && !isBusy) {
            $(document).trigger('makecatalogs:done', status);
        }
        lastState = status.state;
        schedule(status.state);
    }

    window.refreshMakecatalogsStatus = function () {
        if (!document.getElementById('makecatalogsStatus')) return;
        $.ajax({url: '/makecatalogs/status', dataType: 'json', global: false,
                success: handle,
                error: function () { schedule(lastState); }});
    };

    window.requestMakecatalogs = function () {
        $.ajax({type: 'POST', url: '/makecatalogs/run', dataType: 'json',
                global: false, success: handle});
    };

    $(refreshMakecatalogsStatus);
})();
