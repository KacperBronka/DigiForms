"use client";
import * as React from "react";
import { classes, FieldLayout, Choice, noticeTitles } from "./shared";
import type { Native, Content, Element, Field, WithRef, Variant, ChoiceProps, Crumb, NoticeType, TabItem } from "./shared";

export function Status({ children }: { children?: Content }): Element {
  return <div className="gp-status" role="status" aria-atomic="true">{children}</div>;
}

