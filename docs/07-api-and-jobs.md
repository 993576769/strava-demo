# API 与任务流

## 目标

梳理前后端的关键交互，以及同步任务、生成任务的状态流转方式，为后续接口定义和任务调度实现提供骨架。

## 当前结论

- 账号认证与业务授权分两层设计：
  - 产品账号层负责登录态、用户资料和身份恢复。
  - Strava 授权层负责第三方数据访问，不承担产品登录职责。
- 认证能力分阶段规划：
  - 当前 MVP：先支持 GitHub OAuth 登录。
  - 后续扩展：补充邮箱/账号密码注册、账号密码登录、找回密码、重置密码。
  - API 设计上从第一版就按“多认证方式并存”组织，避免后续推翻登录层。
- 初版至少需要四类接口域：
  - 账号认证接口。
  - Strava 连接与同步接口。
  - 活动查询接口。
  - 生成任务与结果接口。
- 初版至少需要三类后台任务：
  - Strava 首次同步任务。
  - Strava 增量同步任务。
  - 手绘轨迹图生成任务。
- 后续为账号密码体系预留一类异步任务：
  - 密码找回邮件发送或重置通知任务。

### 推荐接口分组

#### 1. 账号认证接口

- 当前 MVP 必需动作：
  - 发起 GitHub 登录。
  - 查询当前登录用户。
  - 退出登录。
- 后续预留动作：
  - 邮箱/账号注册。
  - 账号密码登录。
  - 发起找回密码。
  - 提交重置密码。
- 推荐边界：
  - 当前登录方式虽然只有 GitHub，但接口命名和前端状态管理不要写死成“仅社交登录”。
  - 用户对象统一落在 `users`，不同登录方式只是不同认证入口，不新增独立业务用户模型。

#### 2. Strava 连接与同步接口

- 必需动作：
  - 发起 Strava 连接。
  - 处理 Strava OAuth 回调。
  - 查询 Strava 连接状态。
  - 手动触发同步。
  - 断开 Strava 连接。
- 推荐说明：
  - 所有 Strava 动作都必须建立在“用户已登录产品账号”的前提下。
  - OAuth 回调成功后应立即创建首次同步任务，而不是阻塞等待同步完成。

#### 3. 活动查询接口

- 必需动作：
  - 查询活动列表。
  - 查询活动详情。
  - 查询活动是否可生成。
- 推荐说明：
  - 活动列表只读本地存储，不直接由前端实时请求 Strava。
  - 活动详情可包含同步状态、轨迹可用性、最近一次生成结果摘要。

#### 4. 生成任务与结果接口

- 必需动作：
  - 发起生成任务。
  - 查询单个生成任务状态。
  - 查询某活动的历史生成结果。
  - 查询单个结果详情。
- 后续可扩展动作：
  - 取消生成任务。
  - 再生成。
  - 修改结果可见性。
  - 创建分享链接。

### 推荐接口骨架

- 账号认证：
  - `GET /auth/providers`
    返回当前启用的登录方式，MVP 只返回 GitHub，后续可追加 password。
  - `POST /auth/github/start`
    发起 GitHub OAuth。
  - `GET /auth/session`
    返回当前登录用户和可用认证方式。
  - `POST /auth/logout`
    退出产品登录态。
  - `POST /auth/register`
    预留给后续账号密码注册。
  - `POST /auth/login`
    预留给后续账号密码登录。
  - `POST /auth/password/forgot`
    预留给后续发起找回密码。
  - `POST /auth/password/reset`
    预留给后续提交新密码。
- Strava：
  - `POST /integrations/strava/connect`
  - `GET /integrations/strava/callback`
  - `GET /integrations/strava/status`
  - `POST /integrations/strava/sync`
  - `POST /integrations/strava/disconnect`
- 活动：
  - `GET /activities`
  - `GET /activities/:id`
- 生成：
  - `POST /art/jobs`
  - `GET /art/jobs/:id`
  - `GET /activities/:id/results`
  - `GET /art/results/:id`

### 推荐任务流

#### GitHub 登录流

1. 前端请求 `POST /auth/github/start`。
2. 用户完成 GitHub OAuth。
3. 服务端建立产品会话并返回前端可识别的登录态。
4. 前端调用 `GET /auth/session` 获取当前用户资料。
5. 若用户尚未连接 Strava，则引导进入 Strava 连接流程。

#### 后续账号密码注册 / 登录流

1. 用户提交注册或登录表单。
2. 服务端校验邮箱、密码和用户状态。
3. 登录成功后建立与 GitHub 登录一致的产品会话结构。
4. 若用户触发找回密码，则创建一条密码恢复任务或通知任务。
5. 用户通过邮件中的恢复链接完成重置，再回到统一登录态体系。

#### Strava 首次同步流

1. 已登录用户发起 Strava 连接。
2. OAuth 回调成功后写入 `strava_connections`。
3. 系统创建 `initial_sync` 类型任务。
4. worker 拉取活动摘要、详情和 stream，并写入 `activities`、`activity_streams`。
5. 前端通过状态接口或订阅看到“已连接、同步中、同步完成”。

#### Strava 增量同步流

1. 由 webhook、定时任务或用户手动触发同步。
2. 系统按 `last_sync_cursor` 拉取新增或更新活动。
3. 对活动进行幂等 upsert。
4. 更新连接记录中的同步水位线与错误信息。

#### 图片生成流

1. 用户对某条活动调用 `POST /art/jobs`。
2. 服务端校验活动归属、可生成状态和必要轨迹数据。
3. 创建 `art_jobs` 记录，状态为 `pending`。
4. worker 拉取标准化轨迹，调用 AI 生成链路。
5. 成功时写入 `art_results` 并把任务标记为 `succeeded`。
6. 失败时更新 `art_jobs.error_code`、`error_message` 和 `attempt_count`。

### 推荐状态模型

- 产品登录态：
  - `anonymous`
  - `authenticated`
- Strava 连接状态：
  - `not_connected`
  - `connecting`
  - `connected`
  - `syncing`
  - `reauthorization_required`
  - `error`
- 同步任务状态：
  - `pending`
  - `processing`
  - `succeeded`
  - `failed`
- 生成任务状态：
  - `pending`
  - `processing`
  - `succeeded`
  - `failed`
  - `canceled`
- 密码恢复流程状态：
  - `requested`
  - `sent`
  - `consumed`
  - `expired`

### 幂等与错误处理原则

- GitHub 登录和后续账号密码登录都应汇聚到统一会话结构，前端不区分“用户实体”，只区分认证方式。
- Strava OAuth 回调必须具备幂等保护，避免用户重复点击或浏览器重复回调时创建多条连接记录。
- 手动同步接口要有防抖或冷却时间，避免用户连续触发耗尽 Strava 配额。
- `POST /art/jobs` 要校验同一活动在短时间内是否已有相同参数的进行中任务。
- 找回密码接口对外响应应尽量统一，避免泄露邮箱是否存在。
- 错误码分层建议：
  - 认证错误：未登录、登录方式未启用、凭证失效。
  - 授权错误：Strava scope 不足、token 失效、连接已撤销。
  - 业务错误：活动不可生成、任务重复提交、结果不存在。
  - 系统错误：第三方超时、队列阻塞、内部异常。

### 前端状态获取建议

- `GET /auth/session` 作为应用启动时的首个状态入口，决定用户是否已登录。
- `GET /integrations/strava/status` 用于判断是否需要引导用户连接 Strava。
- `GET /activities` 和 `GET /activities/:id` 只读取本地同步结果。
- `GET /art/jobs/:id` 可配合 PocketBase 实时订阅；若实时订阅不稳定，MVP 先用轮询实现。
- 找回密码等弱实时流程可纯走请求响应，不必引入实时机制。

## 待细化

- PocketBase 原生 auth 能否直接承接 GitHub 和后续账号密码登录，还是需要外包一层自定义 auth endpoint。
- `GET /auth/providers`、`POST /auth/register`、`POST /auth/login` 等接口是直接映射 PocketBase 能力，还是以 BFF 方式封装。
- 密码找回邮件是使用 PocketBase 内建能力，还是自定义邮件模板与发送任务。
- 任务触发方式是 PocketBase action、hook 还是外部 job endpoint。
- 状态字段、错误码和用户提示文案的最终枚举。
- 同步任务与生成任务的幂等策略、冷却时间与限流规则。
- 是否需要队列优先级、并发限制、取消机制和任务死信。

## 相关依赖

- 账号与用户模型见 [05-data-model](./05-data-model.md)。
- Strava 同步来源见 [03-strava-integration](./03-strava-integration.md)。
- AI 生成链路见 [04-ai-art-pipeline](./04-ai-art-pipeline.md)。
- 架构职责见 [06-system-architecture](./06-system-architecture.md)。
