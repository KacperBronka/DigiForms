"use client";
import { noticeTitles } from "./shared";
import type { Content, Element, NoticeType } from "./shared";

export function Notice({ kind = "info", children }: { kind?: NoticeType; children: Content }): Element {
  return <div className={'gp-notice gp-' + kind}><strong>{noticeTitles[kind]}</strong><div>{children}</div></div>;
}

