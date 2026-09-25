#!/bin/sh
set -e

if [ "$SKIP_MIGRATIONS" != "true" ]; then
  echo "Waiting for PostgreSQL to be ready and applying migrations..."

  max_retries=${MIGRATION_MAX_RETRIES:-30}
  retry_interval=${MIGRATION_RETRY_INTERVAL:-2}
  count=0

  until npx prisma migrate deploy; do
    count=$((count + 1))
    if [ "$count" -ge "$max_retries" ]; then
      echo "Error: Database was not reachable or migrations failed after $max_retries attempts." >&2
      exit 1
    fi
    echo "Database is not ready yet (attempt $count/$max_retries). Retrying in ${retry_interval}s..."
    sleep "$retry_interval"
  done

  echo "Database migrations applied successfully."
fi

exec "$@"
