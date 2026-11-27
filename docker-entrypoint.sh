#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/app/.data}"
mkdir -p "$DATA_DIR"

if [ -n "${DATABASE_URL:-}" ]; then
  echo "Configuring external PostgreSQL datasource from DATABASE_URL..."
  eval "$(
    node -e '
      const raw = (process.env.DATABASE_URL || "").trim();
      const esc = (v) => "\x27" + String(v ?? "").replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
      if (raw.startsWith("jdbc:postgresql://")) {
        console.log("SPRING_DATASOURCE_URL=" + esc(raw));
        console.log("SPRING_DATASOURCE_USERNAME=" + esc(process.env.DB_USERNAME || ""));
        console.log("SPRING_DATASOURCE_PASSWORD=" + esc(process.env.DB_PASSWORD || ""));
      } else if (raw.startsWith("postgres://") || raw.startsWith("postgresql://")) {
        const normalized = raw.replace(/^postgres:\/\//, "postgresql://");
        const u = new URL(normalized.replace(/^postgresql:\/\//, "http://"));
        const port = u.port ? ":" + u.port : "";
        const params = new URLSearchParams(u.search);
        if (!params.has("sslmode") && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
          params.set("sslmode", "require");
        }
        const qs = params.toString();
        const jdbcUrl = "jdbc:postgresql://" + u.hostname + port + u.pathname + (qs ? "?" + qs : "");
        console.log("SPRING_DATASOURCE_URL=" + esc(jdbcUrl));
        console.log("SPRING_DATASOURCE_USERNAME=" + esc(decodeURIComponent(u.username) || process.env.DB_USERNAME || ""));
        console.log("SPRING_DATASOURCE_PASSWORD=" + esc(decodeURIComponent(u.password) || process.env.DB_PASSWORD || ""));
      } else {
        console.error("Unsupported DATABASE_URL scheme. Expected postgresql://, postgres://, or jdbc:postgresql://");
        process.exit(1);
      }
    '
  )"
  export SPRING_DATASOURCE_URL
  export SPRING_DATASOURCE_USERNAME
  export SPRING_DATASOURCE_PASSWORD
  export SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE="${SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE:-5}"
  export SPRING_DATASOURCE_HIKARI_MAX_LIFETIME="${SPRING_DATASOURCE_HIKARI_MAX_LIFETIME:-300000}"
else
  echo "DATABASE_URL not set; using local H2 file storage at ${DATA_DIR}/laundry..."
  export SPRING_DATASOURCE_URL="jdbc:h2:file:${DATA_DIR}/laundry;DB_CLOSE_ON_EXIT=FALSE"
  export SPRING_DATASOURCE_USERNAME="sa"
  export SPRING_DATASOURCE_PASSWORD=""
fi

echo "Starting Spring Boot backend on 127.0.0.1:8080..."
java \
  -Xms128m \
  -Xmx280m \
  -XX:+UseSerialGC \
  -XX:TieredStopAtLevel=1 \
  -Djava.security.egd=file:/dev/./urandom \
  -jar /app/backend/app.jar \
  --server.address=127.0.0.1 \
  --server.port=8080 &
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
