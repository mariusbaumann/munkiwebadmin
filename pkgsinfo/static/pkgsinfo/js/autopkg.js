// "Create AutoPkg override" modal: starts the Windmill flow through
// pkgsinfo/autopkg.py and polls until the run finishes.
(function () {
    var POLL_MS = 3000;
    var running = false;

    function status(kind, html) {
        $('#autopkgStatus').html(
            '<div class="alert alert-' + kind + ' mb-0">' + html + '</div>');
    }

    function escape(text) {
        return $('<div>').text(text).html();
    }

    function setRunning(on) {
        running = on;
        $('#autopkgForm :input').prop('disabled', on);
        $('#autopkgSubmit').prop('disabled', on).html(on ?
            '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Running…' :
            'Create override');
    }

    function formData() {
        var data = {};
        $('#autopkgForm :input[name]').each(function () {
            data[this.name] = this.type === 'checkbox' ? this.checked : $(this).val().trim();
        });
        data.catalogs = data.catalogs.split(',').map(function (c) { return c.trim(); })
                                     .filter(Boolean);
        return data;
    }

    function errorText(xhr) {
        return (xhr.responseJSON && xhr.responseJSON.error) ||
               xhr.statusText || 'Request failed';
    }

    function poll(jobId, started) {
        $.ajax({url: '/pkgsinfo/_autopkg_override/' + jobId, dataType: 'json',
                global: false})
            .done(function (data) {
                if (!data.completed) {
                    var secs = Math.round((Date.now() - started) / 1000);
                    status('info', '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> ' +
                           'Running job <code>' + escape(jobId) + '</code> … ' + secs + 's');
                    setTimeout(poll, POLL_MS, jobId, started);
                    return;
                }
                setRunning(false);
                if (data.error) {
                    status('danger', '<strong>The flow failed:</strong> ' + escape(data.error));
                    return;
                }
                var result = data.result;
                var text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
                status('success', '<strong>Override created.</strong>' +
                       (text ? '<pre class="small mb-0 mt-2" style="white-space:pre-wrap">' +
                               escape(text) + '</pre>' : ''));
            })
            .fail(function (xhr) {
                // a hiccup while polling doesn't mean the run failed: keep trying
                status('warning', 'Could not read the job status (' + escape(errorText(xhr)) +
                       '). Retrying…');
                setTimeout(poll, POLL_MS * 2, jobId, started);
            });
    }

    function submit() {
        var form = document.getElementById('autopkgForm');
        // only mark the fields while something is missing
        form.classList.toggle('was-validated', !form.checkValidity());
        if (!form.checkValidity()) return;
        setRunning(true);
        status('info', 'Starting the flow…');
        $.ajax({type: 'POST', url: '/pkgsinfo/_autopkg_override',
                contentType: 'application/json', dataType: 'json', global: false,
                headers: {'X-CSRFToken': getCookie('csrftoken')},
                data: JSON.stringify(formData())})
            .done(function (data) { poll(data.job_id, Date.now()); })
            .fail(function (xhr) {
                setRunning(false);
                status('danger', escape(errorText(xhr)));
            });
    }

    $(function () {
        $('#autopkgSubmit').on('click', submit);
        // start fresh when reopened, unless a run is still going
        $('#autopkgModal').on('show.bs.modal', function () {
            if (running) return;
            document.getElementById('autopkgForm').classList.remove('was-validated');
            $('#autopkgStatus').empty();
        });
    });
})();
