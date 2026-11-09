# Makecatalogs runs in a background worker on a fixed tick

Running Makecatalogs inside the request after every pkginfo change blocked the user behind a modal, tied up one of only 3–4 gunicorn workers for the whole run (slow on blobfuse), and let concurrent runs overlap on the same repo. Instead, changes made through MWA only mark the catalogs as Stale. A single dedicated worker process, started next to gunicorn in every entrypoint, runs Makecatalogs every 5 minutes if they are Stale, or within seconds when a user clicks "Makecatalogs now". A database lock allows at most one run at a time, plus at most one queued follow-up.

## Considered Options

- **Celery/Redis:** rejected. It adds infrastructure to both the Docker and Azure App Service deployments for a single periodic job.
- **Background thread inside gunicorn:** rejected. Each of the multiple workers would need to coordinate, and a run dies when gunicorn recycles its worker.
- **Debounce (run N seconds after the last change):** rejected in favour of a fixed tick. "Applied within 5 minutes" is easier to predict, and a long editing session never postpones applying changes indefinitely.
- **Killing a running Makecatalogs when new changes arrive:** rejected. Munki writes the catalog files at the end of a run, so a kill could leave clients with a half-written catalog. Instead the run finishes and exactly one follow-up run is queued.

## Consequences

- Munki clients and MWA's own list and Topology can lag behind a change by up to one tick. The navbar shows Stale Catalogs to every admin.
- Changes made outside MWA (AutoPkg, munkiimport, git) do not mark the catalogs as Stale. Those tools are expected to run Makecatalogs themselves, or an admin clicks "Makecatalogs now".
