/** Commands intentionally stay renderer-local; the adapter never exposes ProseMirror. */
export type EditorCommand =
  | 'undo'
  | 'redo'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'

export interface EditorAdapter {
  focus(): void
  getMarkdown(): string | null
  setMarkdown(markdown: string): void
  runCommand(command: EditorCommand): boolean
  subscribe(listener: (markdown: string) => void): () => void
}

export interface MutableEditorAdapter extends EditorAdapter {
  notify(markdown: string): void
}

export const createEditorAdapter = (
  read: () => string | null,
  write: (markdown: string) => void,
  focusEditor: () => void,
  dispatch: (command: EditorCommand) => boolean,
): MutableEditorAdapter => {
  const listeners = new Set<(markdown: string) => void>()
  return {
    focus: focusEditor,
    getMarkdown: read,
    setMarkdown: write,
    runCommand: dispatch,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    notify: (markdown) => {
      listeners.forEach((listener) => listener(markdown))
    },
  }
}
