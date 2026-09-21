/** 自动更新策略：开发环境永不联网；生产环境由单一可见开关同时控制检查、下载和退出安装。 */

export const shouldCheckForUpdates = (isDev: boolean, enabled: boolean): boolean =>
  !isDev && enabled

export const shouldInstallUpdateOnQuit = (isDev: boolean, enabled: boolean): boolean =>
  !isDev && enabled
