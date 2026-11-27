#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/app/.data}"
mkdir -p "$DATA_DIR"

echo "Starting Spring Boot backend on 127.0.0.1:8080..."
java -Xms128m -Xmx280m -XX:+UseSerialGC \
  -jar /app/backend/app.jar \
  --server.address=127.0.0.1 \
  --server.port=8080 \
  --spring.datasource.url="jdbc:h2:file:${DATA_DIR}/laundry;DB_CLOSE_ON_EXIT=FALSE" &
JAVA_PID=$!

cleanup() {
  echo "Shutting down services..."
  kill -TERM "$JAVA_PID" 2>/dev/null || true
  wait "$JAVA_PID" 2>/dev/null || true
}
trap cleanup TERM INT

echo "Waiting for backend readiness..."
i=0
until node -e "fetch('http://127.0.0.1:8080/api/csrf').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" 2>/dev/null; do
  i=$((i + 1))
  if ! kill -0 "$JAVA_PID" 2>/dev/null; then
    echo "Backend process exited unexpectedly." >&2
    exit 1
  fi
  if [ "$i" -ge 60 ]; then
    echo "Backend failed to become ready within 60s." >&2
    exit 1
  fi
  sleep 1
done

echo "Starting Next.js frontend on 0.0.0.0:${PORT:-3000}..."
exec ./node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
