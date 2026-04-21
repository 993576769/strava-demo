# Strava Art Lab

一个基于 `Vue 3 + Bun + Hono + Zod + Drizzle + PostgreSQL` 的运动轨迹作品生成项目。

## 技术栈

- 前端：Vue 3、TypeScript、Vite、Pinia、Tailwind CSS v4
- 后端：Bun、Hono、Zod
- 数据层：Drizzle ORM、PostgreSQL
- 文件：S3
- 图像生成：Doubao Seedream

## 本地开发

1. 安装依赖

```bash
bun install
```

2. 配置环境变量

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

3. 启动 Postgres

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

4. 推送数据库 schema

```bash
bun run db:push
```

5. 启动开发环境

```bash
bun run dev:all
```

## 常用命令

```bash
bun run dev:server
bun run dev:web
bun run db:generate
bun run db:push
bun run db:studio
bun run build
bun run typecheck
```

## 生产部署

生产 compose 文件使用：

- `SERVER_IMAGE`
- `FRONTEND_IMAGE`
- `DATABASE_URL`
- 认证、Strava、S3、Doubao 相关环境变量

部署脚本位于 [deploy/deploy.sh](/Users/ouyang/Project/vue-pocketbase-template/deploy/deploy.sh:1)。
