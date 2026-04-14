export interface ArtPromptTemplateSeed {
  templateKey: string
  provider: 'doubao-seedream'
  promptTemplate: string
  referenceImageUrl: string
  isActive: boolean
  notes?: string
}

const referenceImageUrl = 'https://todo-demo-744531146978-ap-east-1-an.s3.ap-east-1.amazonaws.com/template/openai_images_6Ksy3QUezrWe2tkrl7TZcA18ILw2_pWTkyPf1DSPoOKW1FCzD_generated_map.png'

export const artPromptTemplateSeeds: ArtPromptTemplateSeed[] = [
  {
    templateKey: 'doubao-seedream-default',
    provider: 'doubao-seedream',
    referenceImageUrl,
    isActive: true,
    notes: 'Default Doubao multi-image route generation prompt.',
    promptTemplate: [
      '以输入图片为基础进行图生图。',
      '多图输入说明：图片1是路线结构图，图片2是背景风格参考图。',
      '请执行组合与风格迁移：保留图片1中的路线主体，参考图片2生成背景风格与画面氛围。',
      '路线主体必须严格使用图片1的路线形状与走向，完整保留路线拓扑、弯折、拐点、闭环、往返关系和整体轮廓，不得改写、增删、拉直、平滑或重绘为另一条路线。',
      '把图片1当成路线描图模板或控制图，输出中的路线要与图片1逐形对应。',
      '图片2只提供背景风格、配色、纸张肌理、装饰元素和整体气质，不能替代、覆盖或主导图片1中的路线结构。',
      '如果图片2的风格与图片1的路线结构冲突，始终优先保留图片1的路线。',
      '背景地图纹理与风格元素必须铺满整个画面，做成全幅满版背景，不要只出现在中间区域，不要留下大面积空白边缘、白边或留白框。',
      '可以在背景中少量显示地名、地点标签或地图文字，帮助识别地点，但必须简洁克制，不要遮挡路线，不要变成真实地图截图。',
      '禁止人物、车辆、应用 UI、品牌标识、水印和多余文字。',
      '风格要求：以参考图中的地图海报风格、配色、纸张肌理和整体氛围为准，同时保持路线主体的高可读性。',
      '构图：{{ratio_prompt}}。',
      '{{title_instruction}}',
      '活动信息：{{title}}，{{sport_type}}，{{distance}}，{{start_date}}。',
      '再次强调：保留图片1的路线主体，参考图片2生成背景风格。',
    ].join(''),
  },
]
