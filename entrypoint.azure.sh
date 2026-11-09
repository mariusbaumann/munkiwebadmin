#!/bin/sh

# install dependencies
apt-get update
apt-get install -y p7zip-full

# migrate database
python manage.py makemigrations catalogs pkgsinfo manifests icons santa process munkiwebadmin
python manage.py migrate

python manage.py collectstatic --noinput

# background Makecatalogs worker (docs/adr/0001)
(while true; do python manage.py makecatalogs_worker; sleep 5; done) &

gunicorn --bind=0.0.0.0 --timeout 600 --workers=4 munkiwebadmin.wsgi
