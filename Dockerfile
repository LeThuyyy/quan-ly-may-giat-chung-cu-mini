# Stage 1: Build Java Spring Boot backend
FROM maven:3.9-eclipse-temurin-21 AS java-build
WORKDIR /app/backend
COPY backend/pom.xml ./pom.xml
RUN mvn -B dependency:go-offline
COPY backend/src ./src
RUN mvn -B package -DskipTests

# Stage 2: Build Next.js frontend
FROM node:22-bookworm-slim AS node-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY next-env.d.ts tsconfig.json eslint.config.mjs next.config.mjs ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN npx next build --webpack && npm prune --omit=dev

# Stage 3: Unified production runtime (Java 21 + Node 22)
FROM eclipse-temurin:21-jre-jammy AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
  && mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
  && apt-get update && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV JAVA_API_ORIGIN=http://127.0.0.1:8080
ENV PORT=3000

COPY --from=java-build /app/backend/target/shared-laundry-backend-*.jar /app/backend/app.jar
COPY --from=node-build /app/package.json ./package.json
COPY --from=node-build /app/next.config.mjs ./next.config.mjs
COPY --from=node-build /app/node_modules ./node_modules
COPY --from=node-build /app/.next ./.next
COPY --from=node-build /app/public ./public
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh && mkdir -p /app/.data

EXPOSE 3000
CMD ["/app/docker-entrypoint.sh"]
