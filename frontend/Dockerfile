# build stage
FROM oven/bun:1.3.12-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY frontend ./frontend

RUN bun install --frozen-lockfile

RUN cd frontend && bun run build

# production stage
FROM nginx:alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
