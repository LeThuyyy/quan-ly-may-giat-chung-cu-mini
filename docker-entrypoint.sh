#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/app/.data}"
mkdir -p "$DATA_DIR"

echo "Starting Spring Boot backend on 127.0.0.1:8080..."
java \
  -Xms128m \
  -Xmx280m \
  -XX:+UseSerialGC \
  -XX:TieredStopAtLevel=1 \
  -Djava.security.egd=file:/dev/./urandom \
  -jar /app/backend/app.jar \
  --server.address=127.0.0.1 \
  --server.port=8080 \
  --spring.datasource.url="jdbc:h2:file:${DATA_DIR}/laundry;DB_CLOSE_ON_EXIT=FALSE" &
JAVA_PID=$!

echo "Starting Next.js frontend on 0.0.0.0:${PORT:-3000}..."
./node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}" &
NEXT_PID=$!

cleanup() {
  echo "Shutting down services..."
  kill -TERM "$NEXT_PID" "$JAVA_PID" 2>/dev/null || true
  wait "$NEXT_PID" "$JAVA_PID" 2>/dev/null || true
}
trap cleanup TERM INT

BACKEND_READY=0
while kill -0 "$JAVA_PID" 2>/dev/null && kill -0 "$NEXT_PID" 2>/dev/null; do
  if [ "$BACKEND_READY" -eq 0 ] && curl -sf http://127.0.0.1:8080/api/csrf >/dev/null 2>&1; then
    echo "Spring Boot backend is ready on 127.0.0.1:8080."
    BACKEND_READY=1
  fi
  sleep 3
done

if ! kill -0 "$JAVA_PID" 2>/dev/null; then
  echo "Spring Boot backend exited unexpectedly." >&2
else
  echo "Next.js server exited unexpectedly." >&2
fi

cleanup
exit 1
