# Strava 集成

## 目标

定义产品与 Strava 的授权、同步、更新和异常处理方式。

## 当前结论

- 产品账号登录与 Strava 数据授权分离：
  - GitHub 用于产品登录。
  - Strava 只用于读取活动数据。
- 当前采用 Strava OAuth 2.0 官方接入方式。
- 默认 scope：
  - `read`
  - `activity:read_all`
- 当前后端已实现的关键路由：
  - `POST /api/integrations/strava/connect`
  - `GET /api/integrations/strava/callback`
  - `GET /api/integrations/strava/status`
  - `POST /api/integrations/strava/sync`
  - `POST /api/integrations/strava/sync-history`
  - `POST /api/integrations/strava/disconnect`
  - `GET /api/integrations/strava/webhook`
  - `POST /api/integrations/strava/webhook`

## 推荐同步链路

1. 用户已登录产品账号。
2. 前端发起 Strava 连接。
3. Strava 回调到服务端。
4. 服务端交换 token，并写入 `strava_connections`。
5. 同步流程读取活动摘要、详情和 streams。
6. 数据写入 `activities` 与 `activity_streams`。
7. 前端只读取本地数据，不直接请求 Strava。

## 当前实现策略

- token 持久化：
  - access token、refresh token 以加密形式存储
  - token 到期前按需刷新
- 幂等策略：
  - 活动以 `source + source_activity_id` 唯一
  - 同步时对活动做 upsert
- 失败处理：
  - token 失效或撤销时更新连接状态
  - webhook 到达时写入 `sync_events`
- 当前实现不是异步队列式同步，而是接口触发后直接完成同步逻辑
  - 对 MVP 足够
  - 后续可拆到独立任务层

## 待细化

- webhook 事件的增量消费策略
- Strava 配额接近上限时的退避策略
- 首次同步的数据窗口和调度节奏

## 相关依赖

- 数据表见 [05-data-model](./05-data-model.md)
- API 契约见 [07-api-and-jobs](./07-api-and-jobs.md)
