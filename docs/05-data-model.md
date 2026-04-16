# 数据模型

## 目标

定义项目当前使用的核心实体与关系，覆盖账号、授权、活动、任务和结果。

## 当前结论

- 当前主数据库是 PostgreSQL。
- ORM 使用 Drizzle，schema 位于 `server/src/db/schema.ts`。
- 当前核心表：
  - `users`
  - `oauth_accounts`
  - `sessions`
  - `strava_connections`
  - `activities`
  - `activity_streams`
  - `art_prompt_templates`
  - `art_jobs`
  - `art_results`
  - `sync_events`

## 核心关系

- 一个 `users` 记录可关联多个 `sessions`
- 一个 `users` 记录可关联多个 `oauth_accounts`
- 一个 `users` 记录可关联零个或一个有效 `strava_connections`
- 一个 `users` 记录可关联多条 `activities`
- 一条 `activities` 记录可关联零个或一个 `activity_streams`
- 一条 `activities` 记录可触发多条 `art_jobs`
- 一条 `art_jobs` 最多对应一条 `art_results`

## 关键约束

- `oauth_accounts(provider, provider_account_id)` 唯一
- `strava_connections(user_id, provider)` 唯一
- `activities(source, source_activity_id)` 唯一
- `art_results(job_id)` 唯一

## 字段分层

### 账号与认证层

- `users`
- `oauth_accounts`
- `sessions`

### Strava 授权与同步层

- `strava_connections`
- `sync_events`

### 活动数据层

- `activities`
- `activity_streams`

### 生成执行层

- `art_jobs`
- `art_results`
- `art_prompt_templates`

## 当前设计原则

- 原始第三方字段和规范化字段并存
- 大字段从高频列表字段拆开
- 任务与结果拆表
- 文件 URL 直接落表，不依赖 BaaS 文件字段

## 待细化

- 是否引入 `profiles` 或更多用户偏好字段
- 轨迹 bbox 和采样策略是否需要更强约束
- 结果分享模型是否需要单独表

## 相关依赖

- 当前 schema 见 `server/src/db/schema.ts`
- 系统分层见 [06-system-architecture](./06-system-architecture.md)
