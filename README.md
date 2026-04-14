# Strava Art Lab

一个基于 `Vue 3 + Pinia + PocketBase` 的运动轨迹作品生成项目。

当前主线已经接通到这一步：
- GitHub 登录产品账号
- 连接 Strava 并读取授权状态
- 手动同步 Strava 活动到本地 `activities` / `activity_streams`
- 从活动创建 `art_jobs`
- 通过统一渲染入口生成 `art_results`
- 已支持接入 `doubao-seedream-5-0-260128`
- 查看结果详情并下载成品

当前仍是 MVP 迭代中，默认保留 mock 回退，方便在未配置火山引擎 AK/SK 时继续联调产品闭环。

## 当前能力边界

- 产品登录当前只支持 GitHub OAuth。
- Strava 只负责数据授权，不负责产品登录。
- 已支持：
  - Strava 连接 / 断开 / 状态读取
  - 首次同步和手动重新同步
  - 活动列表 / 活动详情
  - 生成任务创建
  - 统一生成结果页
  - Doubao Seedream 5.0 渲染接入
- 暂未完成：
  - Strava webhook
  - 更稳的增量同步和退避策略
  - 邮箱密码注册 / 登录 / 找回密码

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

根目录 `.env` 至少需要补这些字段：

- `PB_ADMIN_EMAIL`
- `PB_ADMIN_PASSWORD`
- `PB_HOOKS_WATCH`
  开发环境建议设为 `false`，避免 `pb_hooks` 文件事件触发 PocketBase 自动重启；只有需要 hook 热重载时再改成 `true`
- `APP_URL`
  前端本地地址，例如 `http://127.0.0.1:5173`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI`
  本地开发建议填 `http://127.0.0.1:8090/api/integrations/strava/callback`
- `STRAVA_STATE_SECRET`
- `STRAVA_WEBHOOK_VERIFY_TOKEN`
  用于 Strava webhook 验证，建议与 state secret 分开设置
- `STRAVA_SCOPES`
  默认建议 `read,activity:read_all`
- `ART_RENDER_PROVIDER`
  可选 `mock` 或 `doubao-seedream`；不填时会自动判断，如果 `ARK_API_KEY` 存在则优先走 `doubao-seedream`
- `ART_ASSET_BASE_URL`
  公开可访问的应用域名，用来拼接轨迹底稿图片 URL；图生图模式下必须能被火山引擎访问
- `ARK_API_KEY`
  用于调用火山方舟图片生成接口

如果要启用 `doubao-seedream-5-0-260128`，建议补这些字段：

- `ARK_BASE_URL`
  默认 `https://ark.cn-beijing.volces.com/api/v3`
- `DOUBAO_SEEDREAM_MODEL`
  默认 `doubao-seedream-5-0-260128`
- `DOUBAO_IMAGE_SIZE`
  默认 `2K`
- `DOUBAO_OUTPUT_FORMAT`
  默认 `png`
- `DOUBAO_RESPONSE_FORMAT`
  默认 `url`
- `DOUBAO_WATERMARK`
  默认 `true`
- `DOUBAO_HELPER_HOST`
  默认 `127.0.0.1`
- `DOUBAO_HELPER_PORT`
  默认 `3211`
- `DOUBAO_HELPER_TIMEOUT_MS`
  默认 `120000`

前端 `frontend/.env` 通常只需要保留：

- `VITE_PB_URL=`
  本地开发留空即可，默认走同源 / 代理访问

### 3. 启动 PocketBase

方式一：Docker

```bash
docker compose -f docker-compose.dev.yml up -d pocketbase
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

### 5. 在 PocketBase 后台启用 GitHub 登录

登录 PocketBase Admin UI 后，确认：

- `users` collection 已启用 OAuth2
- GitHub provider 已配置好 client id / client secret

如果 GitHub 登录没配好，前端登录页会提示 GitHub OAuth 未启用。

### 6. 在 Strava 创建应用

前往 [Strava API Settings](https://www.strava.com/settings/api) 创建应用，并把 `Authorization Callback Domain` 指向你的 PocketBase 域名或本地地址。

本地开发至少要保证：

- Strava 应用里的回调域能覆盖 `127.0.0.1:8090`
- `.env` 里的 `STRAVA_REDIRECT_URI` 与 Strava 应用配置一致

### 7. 可选：创建 Strava webhook 订阅

当前后端已经提供了：

- `GET /api/integrations/strava/webhook`
  用于 Strava 校验 webhook
- `POST /api/integrations/strava/webhook`
  用于接收 activity create / update / delete 和 athlete revoke 事件

如果你要在本地调试 webhook，通常需要先用 ngrok 或其他隧道把 PocketBase 暴露出去。

创建订阅时，Strava 官方文档示例是向 `https://www.strava.com/api/v3/push_subscriptions` 发请求，并带上：

- `client_id`
- `client_secret`
- `callback_url`
  例如 `https://your-public-host/api/integrations/strava/webhook`
- `verify_token`
  需要和 `.env` 里的 `STRAVA_WEBHOOK_VERIFY_TOKEN` 一致

### 8. 手动验证主链路

1. 使用 GitHub 登录。
2. 点击“连接 Strava”。
3. 授权成功后进入活动页。
4. 点击“同步活动”。
5. 打开某条活动详情，创建生成任务。
6. 如果已配置 `doubao-seedream-5-0-260128`，等待远端生成完成；否则会自动回退到 mock。
7. 查看结果页并下载成品。

## 常用命令

```bash
pnpm run dev:web
pnpm run dev:pb
pnpm run dev:doubao-helper
pnpm run dev:all
pnpm run build
pnpm run seed:pocketbase
pnpm run typegen:pocketbase
pnpm run typecheck:pocketbase
pnpm --dir frontend run typecheck
```

## 生产部署

当前仓库已经包含一套 `GitHub Actions + GHCR + SSH` 的生产部署骨架，目标域名是 `https://strava.lazegull.top`。

### 1. GitHub Actions 自动部署

工作流文件：

- `.github/workflows/deploy.yml`

触发方式：

- push 到 `master`
- 手动触发 `workflow_dispatch`

工作流会：

1. 构建前端镜像
2. 构建 PocketBase 镜像
3. 推送到 GHCR
4. 通过 SSH 连接服务器
5. 在 `/root/strava` 执行部署脚本

### 2. GitHub Secrets

仓库至少需要配置这些 secrets：

- `SSH_HOST`
- `SSH_PORT`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `SSH_KNOWN_HOSTS`
- `GHCR_USERNAME`
- `GHCR_TOKEN`

其中：

- GitHub Actions 推送 GHCR 镜像使用内置的 `GITHUB_TOKEN`，不需要额外配置 CI 专用 GHCR 凭据
- `GHCR_USERNAME` / `GHCR_TOKEN` 只用于服务器执行部署时的 `docker login ghcr.io`
- `GHCR_TOKEN` 需要至少具备 `read:packages` 权限；如果你希望复用它做本地推送，也可以额外给 `write:packages`

### 3. 服务器目录

服务器固定部署目录是：

```bash
/root/strava
```

把这些模板文件放到服务器该目录：

- `docker-compose.yml` -> `/root/strava/docker-compose.yml`
- `deploy/deploy.sh` -> `/root/strava/deploy.sh`
- `.env.example` -> `/root/strava/.env`

首次部署前建议执行：

```bash
mkdir -p /root/strava/pb_data
chmod +x /root/strava/deploy.sh
```

### 4. 生产环境变量

服务器 `.env` 至少需要确认这些值：

- `FRONTEND_IMAGE=ghcr.io/<owner>/<repo>-frontend`
- `POCKETBASE_IMAGE=ghcr.io/<owner>/<repo>-pocketbase`
- `IMAGE_TAG=master`
- `APP_URL=https://strava.lazegull.top`
- `STRAVA_REDIRECT_URI=https://strava.lazegull.top/api/integrations/strava/callback`
- `ART_ASSET_BASE_URL=https://strava.lazegull.top`

其他 Strava、PocketBase admin、渲染服务相关变量继续按你的生产实际填写。

### 5. Nginx 反向代理

服务器现有 Nginx 可参考：

- `deploy/strava.lazegull.top.conf`

核心反代规则：

- `/` -> `127.0.0.1:8080`
- `/api/` -> `127.0.0.1:8090`
- `/_/` -> `127.0.0.1:8090`
- `/realtime/` -> `127.0.0.1:8090`

这样前端可以继续走同源访问，不需要额外设置 `VITE_PB_URL`。

## 核心目录

```text
frontend/src/views/
frontend/src/stores/
frontend/src/lib/
pocketbase/pb_migrations/
pocketbase/pb_hooks/
docs/
```

当前最关键的几份文档：

- [docs/00-overview.md](./docs/00-overview.md)
- [docs/03-strava-integration.md](./docs/03-strava-integration.md)
- [docs/05-data-model.md](./docs/05-data-model.md)
- [docs/07-api-and-jobs.md](./docs/07-api-and-jobs.md)
- [docs/10-implementation-plan.md](./docs/10-implementation-plan.md)

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
│   ├── pb_hooks/
│   ├── pb_migrations/
│   ├── scripts/
│   └── seeds/
├── docs/
├── docker-compose.dev.yml
├── docker-compose.yml
└── README.md
```

## 下一步建议

当前最适合继续推进的是：

1. 用真实 Strava 应用做一次端到端联调
2. 补 webhook / 增量同步和同步退避
3. 继续打磨 Doubao 的 prompt、重试策略和错误恢复
4. 最后再补邮箱密码体系
