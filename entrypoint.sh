#!/bin/sh

if [ "$DATABASE" = "postgres" ]
then
    echo "Waiting for postgres..."

    while ! nc -z $SQL_HOST $SQL_PORT; do
      sleep 0.1
    done

    echo "PostgreSQL started"
fi

# python manage.py flush --no-input
python manage.py migrate

# background Makecatalogs worker (docs/adr/0001)
(while true; do python manage.py makecatalogs_worker; sleep 5; done) &

exec "$@"