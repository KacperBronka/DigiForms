"use client";
import type { Element, Crumb } from "./shared";
import { Link } from "./Link";

export function Breadcrumbs({ ancestors, current, label = "Ścieżka nawigacji" }: {
  ancestors: readonly Crumb[]; current: string; label?: string;
}): Element {
  return <nav className="gp-nav" aria-label={label}><ol>
    {ancestors.map(item => <li key={item.href}><Link href={item.href}>{item.label}</Link><span aria-hidden="true"> › </span></li>)}
    <li aria-current="page">{current}</li>
  </ol></nav>;
}

