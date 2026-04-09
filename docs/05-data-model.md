# 数据模型

## 目标

定义项目的核心实体与关系，覆盖账号、第三方授权、活动数据、生成任务和作品结果，为 PocketBase collection 设计提供方向。

## 当前结论

- 首版继续以 PocketBase collection 作为主存储，目标是先支持：
  - Strava 授权绑定与 token 管理。
  - 活动同步去重与增量更新。
  - 可生成活动筛选。
  - 生成任务可追踪、可重试。
  - 历史作品可回看与重新生成。
- 推荐的首批核心 collection：
  - `users`
    继续使用 PocketBase 内建认证 collection，承载产品账户。
  - `strava_connections`
    保存用户与 Strava athlete 的绑定关系、授权状态和 token 元数据。
  - `activities`
    保存从 Strava 同步来的活动摘要和可查询字段。
  - `activity_streams`
    保存活动对应的轨迹或归一化 stream 数据。
  - `art_jobs`
    保存手绘图生成任务及其状态。
  - `art_results`
    保存最终图片资源、参数快照和失败结果摘要。
- 关系方向建议：
  - 一个 `users` 记录可关联零个或一个有效 `strava_connections` 记录。
  - 一个 `users` 记录可关联多条 `activities`。
  - 一条 `activities` 记录可关联零个或一个 `activity_streams` 记录。
  - 一条 `activities` 记录可触发多条 `art_jobs`。
  - 一条 `art_jobs` 记录最多对应一条 `art_results`。
- 设计原则：
  - 原始第三方字段和产品内部规范化字段同时保留，避免后续排错时丢失上下文。
  - 所有外部主键都单独落字段，并建立唯一约束或业务去重规则。
  - 任务状态与作品结果拆表，避免同一条记录承担“排队中”和“已完成产物”两种职责。
  - 长数组、原始 stream、完整参数快照这类大字段，与高频列表查询字段拆开存储。

### 推荐 collection 设计

#### `users`

- 继续沿用 PocketBase 默认用户集合。
- 认证方式暂时只支持 GitHub OAuth。
- 首版新增字段只保留产品内需要的轻量资料，例如：
  - `display_name`
  - `avatar_url`
  - `timezone`
  - `onboarding_state`
- 不把 Strava token 相关字段放进 `users`，避免用户表过度耦合第三方平台状态。
- `users` 表示产品账号主体；Strava 身份通过 `strava_connections` 关联，不直接混入登录体系。

#### `strava_connections`

- 作用：
  保存 OAuth 授权状态、Strava athlete 身份和同步水位线。
- 建议字段：
  - `user`：关联 `users`，必填。
  - `provider`：固定为 `strava`，为未来多平台接入留口。
  - `strava_athlete_id`：Strava athlete 主键，必填。
  - `strava_username`
  - `scope_granted`
  - `access_token_encrypted`
  - `refresh_token_encrypted`
  - `token_expires_at`
  - `status`
    建议值：`active`、`expired`、`revoked`、`reauthorization_required`
  - `last_sync_at`
  - `last_sync_cursor`
    用于记录最近一次成功增量同步的时间水位。
  - `last_webhook_at`
  - `last_error_code`
  - `last_error_message`
- 约束建议：
  - `user + provider` 在业务上唯一。
  - `provider + strava_athlete_id` 在业务上唯一。
- 说明：
  - token 字段应以加密后的形式存储。
  - scope 建议完整保存字符串原值，避免后续升级权限时丢失历史。

#### `activities`

- 作用：
  保存活动摘要、筛选字段和同步状态，支撑前端活动列表与详情页。
- 建议字段：
  - `user`：关联 `users`，必填。
  - `connection`：关联 `strava_connections`，必填。
  - `source`：固定为 `strava`。
  - `source_activity_id`：Strava activity id，必填。
  - `name`
  - `sport_type`
  - `start_date`
  - `timezone`
  - `distance_meters`
  - `moving_time_seconds`
  - `elapsed_time_seconds`
  - `elevation_gain_meters`
  - `average_speed`
  - `start_latlng`
  - `end_latlng`
  - `visibility`
    对应公开、关注者可见、仅自己可见等状态。
  - `has_polyline`
  - `has_streams`
  - `is_generatable`
  - `generatable_reason`
    用于标记不可生成的原因，如无轨迹、轨迹过短、权限不足。
  - `sync_status`
    建议值：`pending_detail`、`ready`、`partial`、`failed`
  - `synced_at`
  - `raw_summary_json`
    保存活动摘要原始快照。
  - `raw_detail_json`
    保存详情原始快照。
- 约束建议：
  - `source + source_activity_id` 在业务上唯一。
  - 常用排序索引优先考虑 `user + start_date`。

#### `activity_streams`

- 作用：
  把生成链路需要的大体积轨迹数据从 `activities` 拆出，降低列表查询压力。
- 建议字段：
  - `activity`：关联 `activities`，必填且唯一。
  - `stream_version`
  - `point_count`
  - `distance_stream_json`
  - `latlng_stream_json`
  - `altitude_stream_json`
  - `time_stream_json`
  - `normalized_path_json`
    用于保存产品内部统一格式的轨迹路径。
  - `bbox_json`
    便于后续计算画布和裁切。
  - `sampling_strategy`
  - `processed_at`
- 说明：
  - 如果原始 stream 太大，后续可迁移到对象存储或独立服务，但首版可以先放在独立 collection 中。
  - `normalized_path_json` 应作为后续 AI 生成的优先输入，减少每次生成都重复做清洗。

#### `art_jobs`

- 作用：
  表示一次生成请求，从排队到完成的整个生命周期都在这里追踪。
- 建议字段：
  - `user`：关联 `users`，必填。
  - `activity`：关联 `activities`，必填。
  - `stream`：关联 `activity_streams`，可选但建议落地。
  - `status`
    建议值：`pending`、`processing`、`succeeded`、`failed`、`canceled`
  - `style_preset`
  - `prompt_snapshot`
  - `render_options_json`
  - `attempt_count`
  - `error_code`
  - `error_message`
  - `queued_at`
  - `started_at`
  - `finished_at`
  - `worker_ref`
    用于记录执行该任务的 worker 或外部 job id。
- 约束建议：
  - 允许同一活动存在多次生成任务，不做唯一限制。
  - 如需防抖，可在业务层控制“同一用户、同一活动、同一风格、同一参数”的短时间重复提交。

#### `art_results`

- 作用：
  保存生成成功后的成品资源和可回显信息。
- 建议字段：
  - `job`：关联 `art_jobs`，必填且唯一。
  - `user`：关联 `users`，必填。
  - `activity`：关联 `activities`，必填。
  - `image`
    可先使用 PocketBase file 字段。
  - `thumbnail`
  - `width`
  - `height`
  - `file_size`
  - `mime_type`
  - `style_preset`
  - `title_snapshot`
  - `subtitle_snapshot`
  - `metadata_json`
    保存导出参数、调色信息、布局信息等。
  - `visibility`
    建议值：`private`、`unlisted`、`public`
- 说明：
  - `art_jobs` 记录过程，`art_results` 记录结果，避免任务失败时仍要在结果表造空记录。
  - 如果后续引入分享页或 CDN，可以在这里增加公开 URL、分享 slug 等字段。

### 推荐字段分层

- 账号与授权层：
  `users`、`strava_connections`
- 活动数据层：
  `activities`、`activity_streams`
- 生成执行层：
  `art_jobs`
- 成品资产层：
  `art_results`

### 默认索引和唯一性原则

- 必须唯一的外部标识：
  - `strava_connections.provider + strava_athlete_id`
  - `activities.source + source_activity_id`
- 高频查询优先索引：
  - `activities.user + start_date`
  - `art_jobs.user + created`
  - `art_results.user + created`
- 与状态流转强相关的字段应保持可过滤：
  - `strava_connections.status`
  - `activities.sync_status`
  - `activities.is_generatable`
  - `art_jobs.status`

### 推荐删除与保留策略

- 用户解绑 Strava：
  - `strava_connections` 变更为 `revoked`，不直接物理删除。
  - 历史 `activities` 和 `art_results` 默认保留，除非用户主动要求清除。
- 任务失败：
  - 保留 `art_jobs` 失败记录，便于排查与重试。
  - 不创建空的 `art_results`。
- 原始第三方快照：
  - 首版默认保留，后续可根据成本再决定归档或裁剪策略。

## 待细化

- 是否在 `users` 外另建 `profiles` collection，还是继续把轻量用户资料放在内建 `users` 中。
- PocketBase 对大 JSON 字段和文件字段的性能边界，需要结合真实轨迹样本验证。
- token 加密方案、密钥轮换策略和管理员可见性边界。
- `activity_streams` 是否需要进一步拆成“原始 stream”和“归一化 path”两张表。
- 作品分享能力上线后，`art_results.visibility` 与公开链接模型如何扩展。
- 如果后续支持多平台接入，`activities` 是继续单表多 source，还是按来源拆表。

## 相关依赖

- Strava 数据来源见 [03-strava-integration](./03-strava-integration.md)。
- 架构职责划分见 [06-system-architecture](./06-system-architecture.md)。
- API 与任务状态见 [07-api-and-jobs](./07-api-and-jobs.md)。
