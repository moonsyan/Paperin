import { productIconSrc } from '../../lib/product-icon'

export interface ProductIconProps {
  /** 当前生效主题 id；决定明/暗品牌图 */
  theme: string
  className?: string
  alt?: string
}

/**
 * 应用内产品品牌图：明亮主题用 light，暗色主题用 dark。
 * 窗口 / Dock / 任务栏图标不走此组件，固定为 resources 下的明亮图标。
 */
export function ProductIcon({ theme, className, alt = '' }: ProductIconProps): JSX.Element {
  return <img className={className} src={productIconSrc(theme)} alt={alt} />
}
