FROM oven/bun:1.3.12-alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY frontend/package.json ./frontend/package.json
COPY server ./server

RUN bun install --frozen-lockfile
RUN bun build server/src/index.ts --target=bun --outdir /app/dist

FROM oven/bun:1.3.12-alpine

WORKDIR /app

COPY --from=builder /app/dist/index.js ./server/index.js

EXPOSE 8090

CMD ["bun", "server/index.js"]
