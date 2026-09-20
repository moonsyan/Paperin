/**
 * R11：开始页、示例树、README 与 package 描述共用的核心任务表述。
 * 不引入第二套产品文案，避免入口与文档各说各话。
 */
export const CORE_TASK_HEADLINE = '打开资料 → 用来源写一段技术说明'

export const CORE_TASK_TAGLINE =
  '本地 Markdown 知识工作台：收下资料，写出理解，带来源交付'

/** 首屏与示例树侧重的可发现动作（不弹导览、不强制账号） */
export const CORE_TASK_DISCOVER = {
  materials: '打开或继续资料：侧栏文件树、最近编辑，或下方「打开知识库文件夹」',
  template: '命令面板 →「新建技术文章模板」（六类项目模板均已内置）',
  citation: '工作区全文搜索或侧栏「关系」→ 结果/反链旁的「插入引用」',
} as const
