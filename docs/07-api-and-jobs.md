# API 与任务流

## 目标

梳理当前前后端的关键接口，以及同步任务和生成任务的状态流。

## 当前接口分组

### 1. 认证

- `POST /api/auth/github/start`
- `GET /api/auth/github/callback`
- `GET /api/auth/session`
- `POST /api/auth/logout`

### 2. Strava

- `GET /api/integrations/strava/status`
- `POST /api/integrations/strava/connect`
- `GET /api/integrations/strava/callback`
- `POST /api/integrations/strava/sync`
- `POST /api/integrations/strava/sync-history`
- `POST /api/integrations/strava/disconnect`
- `GET /api/integrations/strava/webhook`
- `POST /api/integrations/strava/webhook`

### 3. 活动

- `GET /api/activities`
- `GET /api/activities/:id`
- `GET /api/activities/:id/stream`

### 4. 生成与结果

- `GET /api/art/jobs`
- `POST /api/art/jobs`
- `POST /api/art/jobs/:id/route-base`
- `POST /api/art/jobs/:id/render`
- `GET /api/art/results`
- `GET /api/art/results/:id`
- `GET /api/art/history/jobs`
- `GET /api/art/prompt-templates`
- `PATCH /api/art/prompt-templates/:id`
- `POST /api/art/admin/art-prompt-templates/:id/reference-image`

### 5. 调试事件

- `GET /api/sync-events`

## 当前任务模型

### 同步任务

- 当前没有独立同步队列表
- Strava 同步由接口直接触发
- 同步结果写入：
  - `activities`
  - `activity_streams`
  - `sync_events`

### 生成任务

- `art_jobs.status`：
  - `pending`
  - `processing`
  - `succeeded`
  - `failed`
  - `canceled`
- 当前 runner 扫描 `pending` 和超时 `processing` 任务
- 成功后创建 `art_results`

## 当前前端状态获取策略

- `GET /api/auth/session`：应用启动时恢复登录态
- `GET /api/integrations/strava/status`：读取连接状态
- `GET /api/activities` / `GET /api/activities/:id`：读取本地活动
- `GET /api/art/jobs`：读取活动下任务
- `GET /api/art/results` / `GET /api/art/results/:id`：读取结果
- `GET /api/sync-events`：读取最近同步事件

## 幂等与错误处理原则

- GitHub 登录复用已有用户
- Strava 活动同步以外部 activity id 去重
- 相同参数生成任务会优先复用进行中任务
- 所有接口统一返回 `{ code, message, details? }` 错误结构

## 待细化

- 取消任务接口
- 更细粒度的错误码
- 更稳定的任务重试与死信策略

## 相关依赖

- 架构见 [06-system-architecture](./06-system-architecture.md)
- 路线图见 [08-mvp-roadmap](./08-mvp-roadmap.md)
