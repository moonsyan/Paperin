/**
 * 右键菜单打开位置：按菜单的估算尺寸向视口内收拢。
 * 在窗口右/下边缘打开时菜单会溢出屏幕导致菜单项不可点；
 * 用估算尺寸在打开前钳制（而非渲染后测量回摆），无闪烁。
 * 估算值取菜单的可能最大高度（条目最多的菜单），宁可靠内一点的留白。
 */
export const clampMenuPosition = (
  x: number,
  y: number,
  estimatedWidth = 200,
  estimatedHeight = 300,
): { x: number; y: number } => ({
  x: Math.max(4, Math.min(x, window.innerWidth - estimatedWidth - 4)),
  y: Math.max(4, Math.min(y, window.innerHeight - estimatedHeight - 4)),
})
