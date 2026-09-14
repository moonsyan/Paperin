/** 主窗口初始尺寸与层级策略：居中显示，不置顶，也不作为桌面层窗口。 */
export const getMainWindowPlacement = () => ({
  width: 1200,
  height: 800,
  minWidth: 680,
  minHeight: 480,
  center: true,
  alwaysOnTop: false,
  skipTaskbar: false,
})
