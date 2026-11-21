"use client";
import * as React from "react";
import { classes, FieldLayout, Choice, noticeTitles } from "./shared";
import type { Native, Content, Element, Field, WithRef, Variant, ChoiceProps, Crumb, NoticeType, TabItem } from "./shared";

export function DataTable({ caption, children }: { caption: string; children: Content }): Element {
  return <div className="gp-scroll" role="region" aria-label={caption} tabIndex={0}>
    <table className="gp-table"><caption>{caption}</caption>{children}</table>
  </div>;
}

