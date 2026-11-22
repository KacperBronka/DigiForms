"use client";
import type { Content, Element } from "./shared";

export function SkipLink({ targetId, children = "Przejdź do treści" }: { targetId: string; children?: Content }): Element {
  return <a className="gp-skip" href={'#' + targetId}>{children}</a>;
}

