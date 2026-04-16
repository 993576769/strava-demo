# 系统架构

## 目标

说明前端、Bun 服务、数据库、对象存储和任务执行器之间的职责边界。

## 当前结论

- 当前系统可按五层理解：
  - 前端应用层：Vue 页面、Pinia store、REST client
  - API 层：Hono 路由、鉴权、中间件、输入校验
  - 数据层：PostgreSQL + Drizzle
  - 任务执行层：同一 Bun 服务内的轮询执行器
  - 外部服务层：GitHub、Strava、S3、Doubao

## 分层职责

### 1. 前端应用层

- 负责登录壳层、路由守卫、活动页、结果页、管理员模板页
- 不直接访问 Strava 或 Doubao
- 所有请求都走显式 REST client

### 2. API 层

- 负责 auth、Strava、activities、art、sync-events
- 使用 Zod 校验 params、query、body
- 统一返回 DTO，而不是数据库原始对象

### 3. 数据层

- PostgreSQL 负责核心实体持久化
- Drizzle schema 作为结构定义和查询入口

### 4. 任务执行层

- 与 API 服务同进程
- 轮询 `art_jobs`
- claim 可执行任务
- 执行 Doubao 生成
- 回写 `art_results`

### 5. 外部服务层

- GitHub：登录入口
- Strava：活动来源
- S3：文件与图片资产存储
- Doubao：图片生成 provider

## 当前关键数据流

### 登录到业务访问

1. 前端发起 GitHub 登录
2. 服务端处理 OAuth 回调
3. 服务端写入用户和 session
4. 前端调用 `GET /api/auth/session` 恢复当前用户

### Strava 连接到活动可见

1. 已登录用户发起 Strava 连接
2. 服务端完成 token 交换
3. 同步接口拉取活动并写库
4. 前端读取本地活动列表

### 生成任务到结果可见

1. 用户创建任务
2. 用户上传底稿
3. 用户触发 render
4. runner 处理任务
5. 结果写入 `art_results`
6. 前端轮询读取任务与结果

## 待细化

- 后续是否拆分独立 worker
- 是否引入消息队列
- 结果图 CDN 和缓存策略

## 相关依赖

- API 见 [07-api-and-jobs](./07-api-and-jobs.md)
- 数据结构见 [05-data-model](./05-data-model.md)
