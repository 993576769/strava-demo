# Strava Art Lab

一个基于 `Vue 3 + Pinia + PocketBase` 的运动轨迹作品生成项目。

当前主线已经接通到这一步：
- GitHub 登录产品账号
- 连接 Strava 并读取授权状态
- 手动同步 Strava 活动到本地 `activities` / `activity_streams`
- 从活动创建 `art_jobs`
- 通过统一渲染入口生成 `art_results`
- 已支持接入即梦 4.6，未配置时自动回退到 mock SVG 渲染器
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
  - 即梦 4.6 渲染接入
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
  可选 `mock` 或 `jimeng46`；不填时会自动判断，如果即梦参数齐全则优先走 `jimeng46`
- `VOLCENGINE_ACCESS_KEY`
- `VOLCENGINE_SECRET_KEY`
- `JIMENG_REQ_KEY`
  请按即梦 4.6 官方接口文档填写对应模型的 `req_key`

如果要启用即梦 4.6，建议同时补这些可选字段：

- `JIMENG_API_HOST`
  默认 `visual.volcengineapi.com`
- `JIMENG_API_REGION`
  默认 `cn-north-1`
- `JIMENG_API_SERVICE`
  默认 `cv`
- `JIMENG_API_VERSION`
  默认 `2022-08-31`
- `JIMENG_SUBMIT_ACTION`
  默认 `CVSync2AsyncSubmitTask`
- `JIMENG_QUERY_ACTION`
  默认 `CVSync2AsyncGetResult`
- `JIMENG_NEGATIVE_PROMPT`
- `JIMENG_POLL_INTERVAL_MS`
- `JIMENG_POLL_MAX_ATTEMPTS`

前端 `frontend/.env` 通常只需要保留：

- `VITE_PB_URL=`
  本地开发留空即可，默认走同源 / 代理访问

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
6. 如果已配置即梦 4.6，等待远端生成完成；否则会自动回退到 mock。
7. 查看结果页并下载成品。

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
├── docker-compose.yml
└── README.md
```

## 下一步建议

当前最适合继续推进的是：

1. 用真实 Strava 应用做一次端到端联调
2. 补 webhook / 增量同步和同步退避
3. 打磨即梦 4.6 的 prompt、轮询和错误恢复
4. 最后再补邮箱密码体系
