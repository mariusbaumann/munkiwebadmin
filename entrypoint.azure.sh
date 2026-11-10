#!/bin/sh
# Keep everything before gunicorn short: Azure stops the container if port
# 8000 doesn't answer within WEBSITES_CONTAINER_START_TIME_LIMIT (default 230s).

# migrate database
python manage.py makemigrations catalogs pkgsinfo manifests icons santa process munkiwebadmin
python manage.py migrate

# collectstatic already runs during the Oryx build

# 7z is only needed for package uploads (munkiimport_linux), so install it
# in the background instead of delaying startup. 7zip (7zz) also reads APFS
# disk images; it's missing from older Debian releases, hence the fallback.
(apt-get update -qq && apt-get install -y -qq p7zip-full && (apt-get install -y -qq 7zip || true)) &

# background Makecatalogs worker (docs/adr/0001); started after gunicorn has
# booted so the two don't compete during startup
(sleep 90; while true; do python manage.py makecatalogs_worker; sleep 5; done) &

gunicorn --bind=0.0.0.0 --timeout 600 --workers=4 munkiwebadmin.wsgi
