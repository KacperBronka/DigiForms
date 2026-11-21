"use client";
import * as React from "react";
import { classes, FieldLayout, Choice, noticeTitles } from "./shared";
import type { Native, Content, Element, Field, WithRef, Variant, ChoiceProps, Crumb, NoticeType, TabItem } from "./shared";

export function Notice({ kind = "info", children }: { kind?: NoticeType; children: Content }): Element {
  return <div className={'gp-notice gp-' + kind}><strong>{noticeTitles[kind]}</strong><div>{children}</div></div>;
}

