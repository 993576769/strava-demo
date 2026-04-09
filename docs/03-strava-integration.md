# Strava 集成

## 目标

定义产品与 Strava 的授权、数据获取、同步更新和异常处理方式，为账户关联、活动同步和后台任务提供基础约束。

## 当前结论

- 产品账号登录与 Strava 数据授权是两条独立链路：
  - 用户先通过 GitHub 登录产品账号。
  - 登录完成后，再单独连接 Strava 作为数据来源。
  - Strava 不承担产品登录职责，只负责授权读取运动数据。
- 初版采用 Strava OAuth 2.0 作为唯一官方接入方式，不考虑抓取网页或使用非官方 SDK 绕过授权。
- 首批同步对象聚焦于具备 GPS 轨迹价值的个人活动记录，优先支持跑步、骑行等活动，不追求一次覆盖全部 Strava 资源。
- Scope 默认策略：
  - `read`：读取基础 athlete 信息。
  - `activity:read_all`：读取活动记录，并覆盖用户设为 `Only Me` 的活动。
  - 首版不申请 `activity:write`，因为当前产品只读用户活动，不回写 Strava。
- Token 策略默认按官方机制设计：
  - access token 是短期凭证，官方文档当前写明有效期约为 6 小时。
  - refresh token 需要服务端保存，并在 access token 临近失效或失效后刷新。
  - token、client secret 和 authorization code 都不能落到前端持久化存储中。
- 推荐授权与接入流程：
  1. 用户已通过 GitHub 登录产品账号。
  2. 前端引导用户点击“连接 Strava”。
  3. 后端生成授权地址，并带上 `client_id`、`redirect_uri`、`response_type=code`、所需 `scope`。
  4. 用户在 Strava 完成授权后，Strava 回跳到服务端回调地址。
  5. 服务端使用 `code` 交换 access token、refresh token 和 athlete 基础信息。
  6. 服务端保存授权记录，并将 athlete id 与当前 GitHub 登录用户关联。
  7. 服务端创建首次同步任务，不在 OAuth 回调请求中直接完成全部同步。
  8. 前端轮询或订阅授权状态，直到用户进入“已连接、等待同步完成”的状态。
- 推荐同步链路：
  1. 首次同步任务读取近一段时间的活动列表。
  2. 对候选活动进行过滤，只保留有轨迹生成价值的活动。
  3. 拉取活动详情和必要的 stream 数据。
  4. 将活动摘要、详情、标准化轨迹、同步元数据写入本地存储。
  5. 记录最后一次成功同步时间和游标信息。
  6. 后续通过增量任务和用户手动触发任务持续更新。
- 同步对象默认筛选规则：
  - 必须属于当前授权用户。
  - 必须是可读活动；若用户存在 `Only Me` 活动，需要 `activity:read_all` 才能读取。
  - 必须具备足够的轨迹数据。
  - 默认排除明显不适合首版生成的活动，例如手动录入且没有轨迹的活动。
- 首次同步策略默认值：
  - 首次拉取最近 180 天活动，兼顾成品价值和 API 成本。
  - 使用 `/athlete/activities` 分页拉取活动摘要。
  - 仅对通过筛选的活动，再请求详情或 stream，避免把预算浪费在无效活动上。
- 增量同步策略默认值：
  - 以“最后一次成功同步时间”为水位线，使用 `after` 参数抓取新增活动。
  - 用户手动触发“重新同步”时，允许补拉近 30 天数据，处理迟到写入、活动修改和权限变化。
  - 同一活动以 Strava activity id 做幂等去重，更新本地副本而不是重复创建。
- Webhook 策略：
  - 推荐尽早接入 Strava webhook，而不是长期依赖高频轮询。
  - webhook 主要用于感知新活动、活动更新、活动可见性变化和用户取消授权。
  - 即使有 webhook，仍保留低频兜底增量同步，防止漏事件。
- 速率限制与调度策略：
  - 官方文档当前给出的默认配额是每 15 分钟 200 次、每天 2000 次，按应用维度计数。
  - 首次同步、增量同步、详情拉取、stream 拉取都要共享同一预算。
  - 调度上优先保证授权成功后的首次可见结果，其次才是后台批量补同步。
- 失败处理默认原则：
  - `401/403`：优先判断 token 失效、scope 不足或用户取消授权。
  - `429`：进入退避重试，并暂停该时间窗口内的主动批量同步。
  - `5xx` 或网络错误：有限次数重试，超过阈值后转人工可见失败状态。
  - 数据不完整：记录原因，允许活动保留在列表里但标记为“暂不可生成”。
- 风险重点：
  - OAuth token 轮换和刷新失败。
  - Strava API 速率限制对首次同步体验的影响。
  - 部分活动无 GPS、轨迹过短或精度不足。
  - webhook 漏事件、用户取消授权或活动从公开改为私密。

### 建议使用的 Strava 端点

- `GET /api/v3/athlete`
  用于获取当前 athlete 基础信息，建立本地授权绑定。
- `GET /api/v3/athlete/activities`
  用于分页拉取活动摘要，支持 `before` / `after` 过滤。
- `GET /api/v3/activities/{id}`
  用于补足单条活动详情。
- `GET /api/v3/activities/{id}/streams`
  用于获取轨迹相关 stream，作为生成链路的主要输入之一。

### 推荐实现边界

- 前端只负责发起连接、展示授权状态、展示同步结果，不直接持有 client secret 或 refresh token。
- PocketBase 或独立后端服务负责 OAuth 回调、token 持久化和同步任务创建。
- 同步任务层负责 API 调用、分页、重试、幂等更新和 webhook 消费。
- 本地数据存储保留“Strava 原始字段快照 + 规范化字段”，便于后续重算和排错。

## 待细化

- OAuth 回调路径、前后端跳转 URL 和本地开发环境配置。
- 活动可生成性的精确判定规则，例如最短距离、最少 GPS 点数、允许的 sport type。
- stream 需要读取哪些 key，以及原始 stream 如何归一化保存。
- refresh token 刷新时机，是“请求前懒刷新”还是“后台定时预刷新”。
- webhook 验签、重放保护和事件幂等处理策略。
- 失败重试次数、退避规则、任务死信和告警方式。
- 用户解绑 Strava 后，本地历史活动和生成作品的保留策略。
- Strava 应用审核、品牌使用要求和隐私披露文案。

## 相关依赖

- 数据实体设计见 [05-data-model](./05-data-model.md)。
- 系统任务编排见 [07-api-and-jobs](./07-api-and-jobs.md)。
- 技术与合规风险见 [09-risks-and-open-questions](./09-risks-and-open-questions.md)。
- Strava 官方文档：
  - [Getting Started](https://developers.strava.com/docs/getting-started/)
  - [Authentication](https://developers.strava.com/docs/authentication)
  - [Webhooks](https://developers.strava.com/docs/webhooks)
  - [API Reference](https://developers.strava.com/docs/reference/)
