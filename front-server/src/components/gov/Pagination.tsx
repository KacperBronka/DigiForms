"use client";
import type { Element } from "./shared";

export function Pagination({ pages, current, label = "Strony wyników" }: {
  pages: readonly { page: number; href: string }[]; current: number; label?: string;
}): Element {
  return <nav aria-label={label} className="gp-nav gp-pages"><ul>{pages.map(({ page, href }) =>
    <li key={page}><a href={href} aria-current={page === current ? "page" : undefined}
      aria-label={'Strona ' + page}>{page}</a></li>)}</ul></nav>;
}

