import { AppComposition } from './app/AppComposition'

/**
 * Renderer entry point. The application controller lives in `app/` so this
 * boundary remains stable while its domain hooks are split out incrementally.
 */
export default function App(): JSX.Element {
  return <AppComposition />
}
