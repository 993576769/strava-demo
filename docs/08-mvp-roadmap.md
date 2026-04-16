# MVP 路线图

## 目标

给项目提供从当前实现到下一阶段的推进顺序。

## 当前阶段拆分

### 阶段一：基础后端替换

- 从旧 BaaS 迁移到 Bun + Hono + Drizzle + Postgres
- 完成前端 REST client 改造
- 清理旧运行时和旧脚本

### 阶段二：闭环稳定化

- 补数据库迁移文件或初始化脚本
- 跑通真实 GitHub OAuth
- 跑通真实 Strava 同步
- 跑通真实 S3 上传与 Doubao 生成

### 阶段三：体验打磨

- 优化登录、空状态、错误态文案
- 优化任务轮询和结果展示
- 完善管理员模板管理

### 阶段四：能力增强

- 邮箱密码体系
- 分享页
- 再生成与风格增强
- 更独立的任务执行层

## 当前 MVP 验收口径

- 新用户能完成 GitHub 登录
- 用户能完成 Strava 连接
- 至少一条带轨迹活动能同步成功
- 用户能创建生成任务并查看结果
- 图片可下载

## 待细化

- 每阶段时间预估
- 是否需要灰度环境
- 是否需要生产级数据库迁移策略

## 相关依赖

- 实现清单见 [10-implementation-plan](./10-implementation-plan.md)
- 风险见 [09-risks-and-open-questions](./09-risks-and-open-questions.md)
