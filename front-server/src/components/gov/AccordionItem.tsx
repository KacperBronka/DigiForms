"use client";
import * as React from "react";
import { classes, FieldLayout, Choice, noticeTitles } from "./shared";
import type { Native, Content, Element, Field, WithRef, Variant, ChoiceProps, Crumb, NoticeType, TabItem } from "./shared";

export function AccordionItem({ summary, children, className, ...props }: Native<"details"> & { summary: string }): Element {
  return <details {...props} className={classes("gp-details", className)}>
    <summary>{summary}</summary><div>{children}</div>
  </details>;
}

