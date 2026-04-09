# build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

# Copy all workspace files
COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build frontend
RUN cd frontend && pnpm build

# production stage
FROM nginx:alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
