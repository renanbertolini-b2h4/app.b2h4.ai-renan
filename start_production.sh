#!/bin/bash
set -e

echo "Starting production server..."

export CELERY_ENABLED=false

exec gunicorn app.main:app --bind 0.0.0.0:5000 --workers 2 --worker-class uvicorn.workers.UvicornWorker --timeout 120 --reuse-port
