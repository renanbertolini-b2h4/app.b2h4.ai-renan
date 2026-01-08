#!/bin/bash
set -e

echo "Installing Python dependencies..."
pip install -q -r requirements.txt

echo "Building frontend..."
cd client
npm install --silent
npm run build
cd ..

echo "Starting FastAPI server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 5000
