import type { Element } from './shared'

/** An indeterminate loading indicator. Render only while an operation is pending. */
export function Loader({ label = 'Ładowanie…' }: { label?: string }): Element {
  return <div className="gp-loader" role="status" aria-live="polite">
    <span className="gp-loader-spinner" aria-hidden="true" />
    <span>{label}</span>
  </div>
}
