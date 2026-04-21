# AI 手绘生成链路

## 目标

明确从活动轨迹到图片成品的生成流程、输入输出和当前实现边界。

## 当前结论

- 当前目标不是做通用文生图，而是围绕“运动轨迹可视化”做受约束生成。
- 生成链路的基本原则：
  - 轨迹可读
  - 同一活动在相同参数下可复用任务
  - 任务异步执行并可追踪
  - 图片和元数据都要落库
- 当前实现阶段：
  - 用户在前端生成路线底稿
  - 路线底稿上传到 S3
  - 服务端把任务写入 `art_jobs`
  - 服务内 runner 周期性 claim `pending` 任务
  - Doubao 调用远端生成接口并写入 `art_results`

## 输入

- 活动摘要：
  - 名称、类型、时间、距离
- 轨迹数据：
  - `activity_streams.normalized_path_json`
  - `activity_streams.latlng_stream_json`
- 生成参数：
  - `style_preset`
  - `render_options_json`
  - `prompt_snapshot`
- 视觉输入：
  - `route_base_image_url`

## 输出

- `art_results.image_data_uri`
- `art_results.thumbnail_data_uri`
- `art_results.width`
- `art_results.height`
- `art_results.metadata_json`
- `art_jobs.status / error_code / error_message`

## 当前执行策略

### 1. 任务创建

- `POST /api/art/jobs`
- 做活动归属校验和可生成校验
- 相同 activity + template + render options 会复用进行中任务

### 2. 底稿上传

- `POST /api/art/jobs/:id/route-base`
- 解析 data URL
- 上传到 S3
- 回写 `route_base_image_url`

### 3. 入队

- `POST /api/art/jobs/:id/render`
- 将任务标记为 `pending`

### 4. 后台执行

- runner 周期扫描可执行任务
- 标记 `processing`
- 执行 Doubao 生成
- 成功写入 `art_results`
- 失败回写错误和重试时间

## 待细化

- 结果图二次压缩和缩略图策略
- 轨迹预处理的抽稀、裁切和样式约束
- 更稳定的 provider 错误码分类

## 相关依赖

- 数据结构见 [05-data-model](./05-data-model.md)
- 路由与任务见 [07-api-and-jobs](./07-api-and-jobs.md)
