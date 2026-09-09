import { sameDesktopFilePath } from '../../lib/desktop-file-path'

/** win32 文件系统不区分大小写：同一文件的两种大小写路径是同一文件——
 * 不用它判重会打开两个指向同一磁盘文件的标签（内容互相覆盖、保存打架） */
export const sameFilePath = (a: string | undefined, b: string | undefined): boolean => {
  return sameDesktopFilePath(a, b, window.desktopAPI?.platform === 'win32')
}
