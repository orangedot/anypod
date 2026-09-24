FROM node:20-alpine

# Install sqlite for database initialization and maintenance
RUN apk add --no-cache sqlite

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source code
COPY . .

# Run production bundler (minifies JS and CSS into public/dist/)
RUN npm run build

# Ensure entrypoint is executable
RUN chmod +x docker-entrypoint.sh

# Persistent storage volume for SQLite DB and config
VOLUME ["/data"]

# Default Anypod port
EXPOSE 8788

ENTRYPOINT ["/app/docker-entrypoint.sh"]
