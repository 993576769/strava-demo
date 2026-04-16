FROM oven/bun:1.3.12-alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY frontend/package.json ./frontend/package.json
COPY server ./server
COPY scripts ./scripts
COPY drizzle.config.ts ./

RUN bun install --frozen-lockfile

EXPOSE 8090

CMD ["bun", "server/src/index.ts"]
