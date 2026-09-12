import { createDefaultPanelRegistry } from './panel-registry'
import type { PanelRegistry } from './panel-registry'

/**
 * 应用级共享面板注册表：Sidebar（sidebar.primary）、ContextDock
 * （sidebar.secondary）、EditorMargin（editor.margin）和 StatusBar
 * （statusbar.end）默认消费同一实例，保证四个区域的顺序、scope 过滤和
 * 覆盖注册行为一致。测试或装配层可注入独立实例。
 */
export const sharedPanelRegistry: PanelRegistry = createDefaultPanelRegistry()
