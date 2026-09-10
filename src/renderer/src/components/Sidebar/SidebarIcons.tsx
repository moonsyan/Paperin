export function ChevronIcon({ open }: { open: boolean }): JSX.Element {
  return <svg className={`tree-chevron ${open ? 'open' : ''}`} viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18" /></svg>
}

export function FolderIcon(): JSX.Element {
  return <svg className="tree-icon tree-icon-folder" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4.2a1 1 0 0 1 .8.4L11.6 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
}

export function FileIcon(): JSX.Element {
  return <svg className="tree-icon tree-icon-file" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
}
