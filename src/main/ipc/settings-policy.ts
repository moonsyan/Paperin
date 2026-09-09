/**
 * 渲染层经通用 SETTINGS_GET 访问的设置键白名单外项。
 * 图床 token 只存主进程设置，渲染层不得读取其明文（写回由专用
 * IMAGE_HOST_SET_CONFIG 通道完成）。
 */
export const isRestrictedSettingsReadKey = (key: unknown): boolean => key === 'imageHost'

/**
 * 渲染层经通用 SETTINGS_SET 禁止写入的设置键：
 * - imageHost：token 必须经专用通道（主进程校验后写回），避免经通用写入
 *   绕过"仅切换 provider 保留已存 token"等语义；
 * - customCss：自定义主题 CSS 属"主进程选择/读取 → 校验体积 → 落盘"的
 *   受控来源，经通用写入会绕过大小与形状校验；未来若引入工作区共享主题
 *   等工作区来源，同样必须回到主进程白名单处理。
 * 读取 customCss 仍允许（启动恢复需要），写回统一走 SETTINGS_SET_CUSTOM_CSS。
 */
export const isRestrictedSettingsWriteKey = (key: unknown): boolean =>
  key === 'imageHost' || key === 'customCss' || key === 'exportCss'

/** 兼容别名：历史语义为"不可经通用接口访问"（读取与写入） */
export const isRestrictedSettingsKey = isRestrictedSettingsReadKey
