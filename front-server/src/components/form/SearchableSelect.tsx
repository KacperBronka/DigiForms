import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

type Item = { value: string; label: string }

type Props = { id: string; label: string; hint?: ReactNode; required?: boolean; disabled?: boolean; value: string; options: Item[]; onChange: (value: string) => void }

export function SearchableSelect({ id, label, hint, required, disabled, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [active, setActive] = useState(0)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const items = value && !options.some(option => option.value === value) ? [{ value, label: value }, ...options] : options
  const filtered = items.filter(option => option.label.toLocaleLowerCase('pl').includes(search.toLocaleLowerCase('pl')))
  const current = filtered.length ? Math.min(active, filtered.length - 1) : -1
  const close = (restoreFocus = false) => { setOpen(false); setSearch(''); setActive(0); if (restoreFocus) trigger.current?.focus() }
  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) close() }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  useEffect(() => { if (disabled) close() }, [disabled])
  useEffect(() => {
    if (open && current >= 0) document.getElementById(`${id}-option-${current}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, current, id])
  const select = (item: Item) => { onChange(item.value); close(true) }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); close(true) }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (filtered.length) setActive(previous => event.key === 'ArrowDown' ? Math.min(previous + 1, filtered.length - 1) : Math.max(previous - 1, 0)) }
    else if (event.key === 'Enter' && current >= 0) { event.preventDefault(); select(filtered[current]) }
  }
  return <div className="gp-field" ref={container} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close() }}>
    <label id={`${id}-label`} htmlFor={id}>{label}{required && <span className="gp-muted"> (wymagane)</span>}</label>
    {hint && <div className="gp-muted" id={`${id}-hint`}>{hint}</div>}
    <div className="searchable-select">
      <button id={id} ref={trigger} type="button" className="gp-control searchable-select-trigger" disabled={disabled} aria-labelledby={`${id}-label ${id}-value`} aria-describedby={hint ? `${id}-hint` : undefined} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} onClick={() => open ? close() : setOpen(true)} onKeyDown={event => { if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); setOpen(true) } }}><span id={`${id}-value`}>{items.find(item => item.value === value)?.label || 'Wybierz'}</span><span aria-hidden="true">▾</span></button>
      {open && <div className="searchable-select-popup"><input ref={input} className="gp-control" role="combobox" aria-label={`Wyszukaj: ${label}`} aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list" aria-required={required || undefined} aria-activedescendant={current >= 0 ? `${id}-option-${current}` : undefined} value={search} onChange={event => { event.stopPropagation(); setSearch(event.target.value); setActive(0) }} onKeyDown={onKeyDown} />
        <div id={`${id}-list`} role="listbox" aria-label={label} className="searchable-select-list">{filtered.map((item, index) => <div id={`${id}-option-${index}`} role="option" aria-selected={item.value === value} className={index === current ? 'searchable-select-option active' : 'searchable-select-option'} key={`${item.value}-${index}`} onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => select(item)}>{item.label}</div>)}</div>
        {!filtered.length && <p role="status" className="searchable-select-empty">Brak pasujących opcji.</p>}
      </div>}
    </div>
  </div>
}
