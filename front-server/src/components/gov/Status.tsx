"use client";
import type { Content, Element } from "./shared";

export function Status({ children }: { children?: Content }): Element {
  return <div className="gp-status" role="status" aria-atomic="true">{children}</div>;
}

