# Vue PocketBase Template

一个可直接二次开发的 `Vue 3 + TypeScript + Pinia + PocketBase` 起步模板。

这个模板保留了几类最常见的基础能力：
- 用户注册 / 登录
- PocketBase 记录类型生成
- 实时订阅
- 主题切换
- 一个可替换的示例业务模块（当前是 `todos`）
- Docker Compose 本地启动

## 适合什么场景

适合拿来做新的后台、小型 SaaS、内部工具、个人项目原型。

如果你要做新项目，通常只需要改这几层：
- `pocketbase/pb_migrations`：换成你的数据结构
- `frontend/src/stores`：改成你的业务 store
- `frontend/src/views`：换成你的页面
- `frontend/src/types/pocketbase.ts`：根据生成类型调整前端别名

## 技术栈

- Vue 3
- TypeScript
- Vite
- Pinia
- PocketBase
- Tailwind CSS v4

## 快速开始

### 1. 安装依赖

```bash
pnpm install
pnpm --dir frontend install
```

### 2. 配置环境变量

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

### 3. 启动 PocketBase

方式一：Docker

```bash
docker compose up -d pocketbase
```

方式二：本地二进制

把 PocketBase 可执行文件放到 `pocketbase/pocketbase`，然后运行：

```bash
pnpm run dev:pb
```

### 4. 启动前端

```bash
pnpm run dev:web
```

### 5. 可选：初始化演示数据

```bash
pnpm run seed:pocketbase
```

默认会创建一个演示账号：
- Email: `demo@example.com`
- Password: `demo123456`

## 常用命令

```bash
pnpm run dev:web
pnpm run dev:pb
pnpm run dev:all
pnpm run build
pnpm run seed:pocketbase
pnpm run typegen:pocketbase
pnpm run typecheck:pocketbase
pnpm --dir frontend run typecheck
```

## 目录结构

```text
vue-pocketbase-template/
├── frontend/
│   └── src/
│       ├── components/
│       ├── composables/
│       ├── lib/
│       ├── router/
│       ├── stores/
│       ├── types/
│       └── views/
├── pocketbase/
│   ├── pb_migrations/
│   ├── scripts/
│   └── seeds/
├── docker-compose.yml
└── README.md
```

## 模板默认约定

- `users` collection 负责认证
- `todos` collection 只是一个示例业务模块
- migration 只放 schema 和数据修复，不放 demo 数据
- demo 数据统一走 `seed` 脚本
- 前端类型来自 `pocketbase-typegen`

## 下一步建议

新项目初始化时，推荐按这个顺序改：

1. 先改 `README.md`、包名和页面文案
2. 再改 PocketBase schema 和迁移
3. 运行 `pnpm run typegen:pocketbase`
4. 最后替换示例视图、store 和组件
