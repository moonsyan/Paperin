import './favorite-button.css'

interface FavoriteButtonProps {
  name: string
  path: string
  favorite: boolean
  onToggle: (path: string) => void
}

export function FavoriteButton({ name, path, favorite, onToggle }: FavoriteButtonProps): JSX.Element {
  const label = `${favorite ? '取消收藏' : '收藏'} ${name}`
  return (
    <button
      type="button"
      className="file-favorite-button"
      aria-label={label}
      title={label}
      aria-pressed={favorite}
      onClick={(event) => { event.stopPropagation(); onToggle(path) }}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.9l5.4-.8z" />
      </svg>
    </button>
  )
}
