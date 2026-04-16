# 实现清单

## 目标

把当前已经确定的产品、架构、数据模型和任务流转成可执行的工程清单。

## 当前实现基础

- 前端保留在 `frontend/`
- 后端位于 `server/src/`
- 数据结构位于 `server/src/db/schema.ts`
- 环境配置位于 `.env.example`
- 本地开发编排位于 `scripts/dev-all.mjs`

## 阶段 0：环境与基础设施

- 完善 `.env` 配置
- 启动 PostgreSQL
- 执行 `bun run db:push`
- 确认本地 `bun run typecheck` 通过

## 阶段 1：认证与会话

- 配置 GitHub OAuth
- 验证登录、回调、session 恢复、登出
- 验证前端登录页和路由守卫

## 阶段 2：Strava 同步

- 配置 Strava 应用和回调地址
- 跑通 connect / callback / sync / status / disconnect
- 验证 `activities`、`activity_streams`、`sync_events` 写入

## 阶段 3：生成链路

- 配置 S3
- 配置 Doubao provider
- 跑通任务创建、底稿上传、render 入队
- 验证 runner 能生成 `art_results`

## 阶段 4：管理与体验

- 跑通 prompt template 管理页
- 检查历史记录页、结果页、webhook 状态页
- 清理和统一所有错误提示文案

## 阶段 5：后续增强

- 数据库迁移策略
- 独立 worker
- 邮箱密码体系
- 分享页和公开结果链接

## 当前推荐验收清单

- GitHub 登录可用
- Strava 连接和同步可用
- 活动详情和轨迹读取可用
- 任务创建和结果查看可用
- 类型检查持续通过

## 相关依赖

- 架构见 [06-system-architecture](./06-system-architecture.md)
- API 与任务见 [07-api-and-jobs](./07-api-and-jobs.md)
