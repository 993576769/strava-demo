# 项目概览

## 目标

把当前仓库定位为一个面向个人运动用户的产品：连接 Strava、同步活动轨迹，并生成可下载的手绘风格轨迹图。

这个文档作为 `docs/` 的入口，说明项目定位、推荐阅读顺序，以及各模块文档之间的关系。

## 当前结论

- 产品一句话说明：连接 Strava，把运动轨迹转成具有风格感的图片成品。
- 目标用户：有跑步、骑行等 GPS 轨迹运动习惯，愿意保存或分享运动可视化作品的个人用户。
- 当前 MVP 的最小闭环：
  1. 用户使用 GitHub 登录产品。
  2. 用户连接 Strava。
  3. 系统同步带轨迹的活动到 PostgreSQL。
  4. 用户选择活动并创建生成任务。
  5. 服务内任务执行器完成图片生成。
  6. 用户查看、下载和回看结果。
- 当前技术底座：
  - 前端：Vue 3 + TypeScript + Vite + Pinia
  - 后端：Bun + Hono + Zod
  - 数据层：Drizzle ORM + PostgreSQL
  - 文件：S3
  - 异步任务：单服务内轮询执行器
- 当前产品策略：
  - 产品账号与 Strava 数据授权分离。
  - 当前只支持 GitHub OAuth 登录。
  - Strava 是唯一活动来源，但接口和数据模型保留扩展空间。
  - 图片生成优先保证轨迹可读性和闭环稳定性。

## 推荐阅读顺序

- [01-user-flow](./01-user-flow.md)
- [02-features](./02-features.md)
- [03-strava-integration](./03-strava-integration.md)
- [04-ai-art-pipeline](./04-ai-art-pipeline.md)
- [05-data-model](./05-data-model.md)
- [06-system-architecture](./06-system-architecture.md)
- [07-api-and-jobs](./07-api-and-jobs.md)
- [08-mvp-roadmap](./08-mvp-roadmap.md)
- [09-risks-and-open-questions](./09-risks-and-open-questions.md)
- [10-implementation-plan](./10-implementation-plan.md)

## 待细化

- 品牌和视觉语气。
- 分享页和公开作品页是否进入下一阶段。
- 是否在后续阶段补充邮箱密码体系。
- 多平台活动来源是否要尽早设计。

## 相关依赖

- 根目录说明见 `README.md`
- 当前后端入口见 `server/src/index.ts`
- 数据结构见 [05-data-model](./05-data-model.md)
