# 项目概览

## 目标

把当前仓库从 `Vue + PocketBase` 通用模板，推进为一个面向个人运动用户的产品：同步 Strava 运动记录，并基于轨迹数据生成可分享的手绘风格轨迹图。

这个文档作为 `docs/` 的入口页，负责说明项目定位、推荐阅读顺序，以及各模块文档之间的关系。

## 当前结论

- 产品一句话说明：连接 Strava，自动同步运动轨迹，生成带审美风格的手绘轨迹图。
- 目标用户：有跑步、骑行等 GPS 轨迹运动习惯，并愿意保存、分享运动可视化作品的个人用户。
- 核心价值：减少用户从运动记录到视觉化成品之间的操作成本，让运动数据变成具有纪念感和分享价值的图片。
- 当前已经明确的产品策略：
  - 产品账号与运动数据授权分离：
    用户先登录产品，再连接 Strava。
  - 当前 MVP 先只支持 GitHub 授权登录。
  - 邮箱/账号密码注册、登录、找回密码、重置密码放到后续阶段。
  - Strava 当前是唯一活动来源，但数据模型与接口预留多平台扩展空间。
- 当前 MVP 的最小闭环：
  1. 用户使用 GitHub 登录产品。
  2. 用户连接 Strava。
  3. 系统同步带 GPS 轨迹的活动。
  4. 用户选择活动并发起手绘风格生成。
  5. 用户查看、下载和后续再次生成结果。
- 当前技术底座延续现有仓库：
  - 前端继续使用 Vue 3 + TypeScript + Vite。
  - 后端数据层继续使用 PocketBase。
  - 产品账号体系暂时只支持 GitHub 授权登录。
  - Strava 同步、生成任务、AI 图像能力作为新增模块逐步接入。
- 当前推荐的核心模块：
  - 账号模块：
    负责统一产品会话、GitHub 登录，以及后续账号密码扩展。
  - Strava 集成模块：
    负责 OAuth、活动同步、增量更新和授权状态维护。
  - 活动数据模块：
    负责活动摘要、轨迹数据、可生成判定和本地查询。
  - 生成任务模块：
    负责参数校验、异步任务创建、状态跟踪和失败恢复。
  - AI 手绘模块：
    负责轨迹预处理、版式构造、风格生成和图片后处理。
  - 作品模块：
    负责结果展示、下载、历史记录和后续分享扩展。
- 当前推荐的系统思路：
  - 前端只读本地同步结果，不直接实时请求 Strava。
  - 所有重任务都异步执行，包括首次同步、增量同步和图片生成。
  - `users`、`strava_connections`、`activities`、`activity_streams`、`art_jobs`、`art_results` 作为首批核心数据结构。
  - AI 生成优先走“可控模板 + 风格化处理”的路线，优先保证轨迹可读性和结果稳定性。
- 当前建议的实现顺序：
  1. 落地产品登录和会话结构。
  2. 跑通 Strava 连接与活动同步。
  3. 建立活动详情与可生成判定。
  4. 跑通首个异步生成任务闭环。
  5. 再补账号密码体系、分享能力和更多模板。
- 推荐阅读顺序：
  - [01-user-flow](./01-user-flow.md)
  - [02-features](./02-features.md)
  - [03-strava-integration](./03-strava-integration.md)
  - [04-ai-art-pipeline](./04-ai-art-pipeline.md)
  - [05-data-model](./05-data-model.md)
  - [06-system-architecture](./06-system-architecture.md)
  - [07-api-and-jobs](./07-api-and-jobs.md)
  - [08-mvp-roadmap](./08-mvp-roadmap.md)
  - [09-risks-and-open-questions](./09-risks-and-open-questions.md)

### 推荐阅读说明

- 如果你先看产品体验：
  - 先读 [01-user-flow](./01-user-flow.md) 和 [02-features](./02-features.md)。
- 如果你先看技术实现：
  - 先读 [05-data-model](./05-data-model.md)、[06-system-architecture](./06-system-architecture.md)、[07-api-and-jobs](./07-api-and-jobs.md)。
- 如果你先看第三方接入和生成链路：
  - 先读 [03-strava-integration](./03-strava-integration.md) 和 [04-ai-art-pipeline](./04-ai-art-pipeline.md)。
- 如果你先看推进顺序和风险：
  - 先读 [08-mvp-roadmap](./08-mvp-roadmap.md) 和 [09-risks-and-open-questions](./09-risks-and-open-questions.md)。

## 待细化

- 品牌方向、产品命名和视觉语气。
- 面向 C 端用户还是先从个人项目 / 小范围内测起步。
- GitHub 登录与后续账号密码体系是否允许绑定到同一用户账号。
- 是否支持作品公开展示页、分享页和导出打印场景。
- 是否需要引入地图主题、配色模版、文案生成等周边创作能力。
- AI 生成首版是先追求“稳定可用”，还是尽快尝试更强艺术风格。

## 相关依赖

- 仓库现有基础说明见根目录 `README.md`。
- 功能范围见 [02-features](./02-features.md)。
- Strava 集成设计见 [03-strava-integration](./03-strava-integration.md)。
- AI 生成链路见 [04-ai-art-pipeline](./04-ai-art-pipeline.md)。
- 数据模型见 [05-data-model](./05-data-model.md)。
- 技术实现边界见 [06-system-architecture](./06-system-architecture.md)。
- 接口与任务流见 [07-api-and-jobs](./07-api-and-jobs.md)。
- 路线图见 [08-mvp-roadmap](./08-mvp-roadmap.md)。
