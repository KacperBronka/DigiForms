"use client";
import * as React from "react";
import { classes, FieldLayout, Choice, noticeTitles } from "./shared";
import type { Native, Content, Element, Field, WithRef, Variant, ChoiceProps, Crumb, NoticeType, TabItem } from "./shared";
import { Link } from "./Link";

export function Breadcrumbs({ ancestors, current, label = "Ścieżka nawigacji" }: {
  ancestors: readonly Crumb[]; current: string; label?: string;
}): Element {
  return <nav className="gp-nav" aria-label={label}><ol>
    {ancestors.map(item => <li key={item.href}><Link href={item.href}>{item.label}</Link><span aria-hidden="true"> › </span></li>)}
    <li aria-current="page">{current}</li>
  </ol></nav>;
}

