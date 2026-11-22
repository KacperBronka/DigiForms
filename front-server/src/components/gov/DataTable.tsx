"use client";
import type { Content, Element } from "./shared";

export function DataTable({ caption, children }: { caption: string; children: Content }): Element {
  return <div className="gp-scroll" role="region" aria-label={caption} tabIndex={0}>
    <table className="gp-table"><caption>{caption}</caption>{children}</table>
  </div>;
}

