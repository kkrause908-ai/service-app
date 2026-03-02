#!/usr/bin/env bash
set -euo pipefail

host="${DB_HOST:-db}"
port="${DB_PORT:-5432}"

echo "Waiting for database ${host}:${port}..."
while ! (echo > /dev/tcp/"$host"/"$port") 2>/dev/null; do
  sleep 0.3
done
echo "Database is up"
