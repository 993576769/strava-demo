# 实现清单

## 目标

把当前已经确定的产品、架构、数据模型和任务流，收敛成一份可直接执行的实现清单。这个文档面向实际开发，强调开发顺序、交付物、依赖关系和阶段验收，不替代需求文档，而是把需求转成工程任务。

## 当前结论

- 当前实现目标聚焦于 MVP 最小闭环：
  1. 用户使用 GitHub 登录产品。
  2. 用户连接 Strava。
  3. 系统同步可生成的运动活动。
  4. 用户选择活动并发起手绘风格生成。
  5. 用户查看与下载结果。
- 当前仓库基础可复用：
  - `frontend/` 继续承载 Vue 3 前端。
  - `pocketbase/` 继续承载用户认证、collection 和基础数据存储。
  - 现有 `todos` 示例业务需要逐步替换为活动与生成业务。
- 当前实现策略：
  - 先保证 GitHub 登录、Strava 同步、异步生成三条主链路跑通。
  - 先做最少模板和最少页面，优先形成完整闭环。
  - 账号密码注册、登录、找回密码是后续阶段，不阻塞 MVP 主线。

### 阶段 0：项目重定位与基础清理

- 目标：
  把模板仓库从 `todos` 示例迁移到“Strava 手绘轨迹图”产品语义。
- 主要任务：
  - 更新根目录 `README.md` 和基础项目描述。
  - 替换前端页面中的模板文案、导航命名和空状态文案。
  - 标记或删除与 `todos` 强耦合的示例视图、store、组件和类型别名。
  - 确认环境变量命名，预留 GitHub OAuth、Strava OAuth、AI 服务配置项。
- 交付物：
  - 项目名称、页面文案和目录语义与新产品一致。
  - 本地开发环境能正常启动，不再以 `todos` 作为主业务。

### 阶段 1：认证与会话基础

- 目标：
  先跑通 GitHub 登录，建立统一产品会话，为后续 Strava 连接和业务接口提供身份前提。
- 主要任务：
  - 在 PocketBase 或外包认证层接入 GitHub OAuth。
  - 实现统一的当前会话读取能力，对应 `GET /auth/session` 的语义。
  - 在前端实现：
    - 未登录页
    - GitHub 登录入口
    - 登录成功后的会话恢复
    - 退出登录
  - 在 `users` 中补齐 MVP 需要的轻量资料字段，例如展示名、头像、时区、onboarding 状态。
- 页面清单：
  - 登录入口页或首页登录区域
  - 登录成功后的应用壳层
- 接口 / 数据清单：
  - GitHub 登录开始与回调
  - 当前会话接口
  - `users` 字段扩展
- 验收标准：
  - 新用户能通过 GitHub 登录进入产品。
  - 刷新页面后能恢复登录态。
  - 未登录用户不能访问活动和生成相关页面。

### 阶段 2：Strava 连接与活动同步

- 目标：
  让已登录用户能够连接 Strava，并在产品内看到本地同步后的活动列表。
- 主要任务：
  - 实现 Strava OAuth 接入。
  - 新增 `strava_connections` collection 和对应状态字段。
  - 新增 `activities`、`activity_streams` collection。
  - 实现首次同步任务：
    - 拉取活动摘要
    - 筛选可用活动
    - 拉取详情与 stream
    - 写入本地数据
  - 实现基本的增量同步能力：
    - 支持手动同步
    - 保存同步水位线
  - 在前端实现：
    - 未连接 Strava 的引导状态
    - 连接中 / 同步中状态
    - 活动列表页
    - 活动详情页
- 页面清单：
  - Strava 连接引导
  - 活动列表
  - 活动详情
- 接口 / 数据清单：
  - `POST /integrations/strava/connect`
  - `GET /integrations/strava/callback`
  - `GET /integrations/strava/status`
  - `POST /integrations/strava/sync`
  - `GET /activities`
  - `GET /activities/:id`
- 验收标准：
  - 已登录用户能完成 Strava 授权。
  - 至少一条带轨迹活动能同步到本地。
  - 前端只通过本地数据展示活动，不直接请求 Strava。

### 阶段 3：可生成判定与任务创建

- 目标：
  在活动详情中明确展示“是否可生成”，并把用户行为落成可追踪的生成任务。
- 主要任务：
  - 在活动同步过程中完成 `is_generatable` 与 `generatable_reason` 判定。
  - 新增 `art_jobs` collection。
  - 定义 `style_preset`、`prompt_snapshot`、`render_options_json` 的结构。
  - 实现生成任务创建接口和幂等检查。
  - 在前端活动详情页增加：
    - 风格模板选择
    - 画布比例或基础参数选择
    - 发起生成按钮
    - 任务处理中状态
- 页面清单：
  - 活动详情中的生成面板
  - 任务状态反馈区
- 接口 / 数据清单：
  - `POST /art/jobs`
  - `GET /art/jobs/:id`
  - `art_jobs` 状态流转
- 验收标准：
  - 不可生成活动会明确提示原因。
  - 可生成活动能成功创建任务并进入 `pending` 或 `processing`。
  - 同一活动、同一参数的短时间重复提交有防抖保护。

### 阶段 4：AI 手绘生成闭环

- 目标：
  跑通从轨迹输入到图片输出的第一版异步生成链路。
- 主要任务：
  - 实现轨迹预处理：
    - 读取 `activity_streams`
    - 归一化路径
    - 计算边界框
    - 做必要的降采样
  - 实现基础版式构造：
    - 默认风格模板 `sketch`
    - 默认画布比例
    - 标题 / 副标题的基础信息排布
  - 实现第一版风格化生成策略：
    - 优先采用“底稿 + 风格化处理”
  - 新增 `art_results` collection。
  - 生成后回写：
    - 主图
    - 缩略图
    - 图片元数据
    - 任务结束时间与状态
  - 在前端实现：
    - 结果页
    - 历史结果列表入口
    - 下载入口
- 页面清单：
  - 结果详情页
  - 活动下的历史生成结果列表
- 接口 / 数据清单：
  - `GET /activities/:id/results`
  - `GET /art/results/:id`
  - `art_results` 落地
- 验收标准：
  - 生成成功后可以查看图片和下载图片。
  - 生成失败时能展示失败状态和重试入口。
  - `art_jobs` 和 `art_results` 的关系可追踪。

### 阶段 5：MVP 打磨与稳定性补强

- 目标：
  补齐 MVP 使用体验和必要的稳定性，不在这一阶段引入过多新能力。
- 主要任务：
  - 完善任务轮询或实时订阅。
  - 完善 Strava 连接失效、同步失败、生成失败的提示与恢复路径。
  - 完善空状态、加载态和错误态文案。
  - 增加最小化的运营观察能力：
    - 同步失败日志
    - 生成失败日志
    - 关键错误码
  - 复查 GitHub 登录到 Strava 连接再到生成的全链路体验。
- 验收标准：
  - 新用户首次使用流程顺畅。
  - 核心失败场景有可恢复路径。
  - 页面和数据状态基本一致，不出现“任务完成但页面无感知”的明显断层。

### 后续阶段：账号密码体系

- 目标：
  在不推翻当前用户模型和业务数据结构的前提下，补齐账号密码能力。
- 主要任务：
  - 接入注册、登录、找回密码、重置密码。
  - 保持与 GitHub 登录一致的产品会话结构。
  - 确认 GitHub 与邮箱密码是否允许绑定到同一用户。
  - 增加密码恢复通知或邮件发送能力。
- 验收标准：
  - 账号密码用户与 GitHub 用户进入同一套产品用户体系。
  - 找回密码链路可独立完成。

### 推荐代码落地顺序

1. `users` 相关认证与前端登录壳层
2. `strava_connections` 与 Strava OAuth
3. `activities` / `activity_streams` 与活动同步
4. 活动列表页与活动详情页
5. `art_jobs` 与生成任务创建
6. 第一版 AI 生成 worker
7. `art_results` 与结果展示页
8. 稳定性和异常流补强

### 推荐验收清单

- 认证：
  - GitHub 登录、退出、刷新恢复可用。
- Strava：
  - 连接成功、同步成功、同步失败提示可用。
- 活动：
  - 活动列表、活动详情、不可生成原因展示可用。
- 生成：
  - 创建任务、任务处理中、任务成功、任务失败可用。
- 结果：
  - 结果查看、缩略图展示、图片下载可用。

## 待细化

- GitHub 登录是直接用 PocketBase 原生 OAuth，还是加一层自定义 BFF。
- Strava 同步任务和图片生成任务具体运行在 PocketBase hooks、脚本进程还是独立 worker。
- 风格模板首版是只做 `sketch`，还是同时交付 `watercolor` / `poster`。
- 结果图片先存 PocketBase file 字段，还是直接接对象存储。
- 前端是否需要单独的作品页，还是先以内嵌在活动详情中的结果列表实现。
- 各阶段的预计工期、负责人和里程碑日期。

## 相关依赖

- 总览见 [00-overview](./00-overview.md)。
- 用户路径见 [01-user-flow](./01-user-flow.md)。
- 功能范围见 [02-features](./02-features.md)。
- Strava 集成见 [03-strava-integration](./03-strava-integration.md)。
- AI 生成链路见 [04-ai-art-pipeline](./04-ai-art-pipeline.md)。
- 数据模型见 [05-data-model](./05-data-model.md)。
- 系统架构见 [06-system-architecture](./06-system-architecture.md)。
- 接口与任务流见 [07-api-and-jobs](./07-api-and-jobs.md)。
- 路线图见 [08-mvp-roadmap](./08-mvp-roadmap.md)。
