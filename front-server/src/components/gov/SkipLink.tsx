"use client";
import * as React from "react";
import { classes, FieldLayout, Choice, noticeTitles } from "./shared";
import type { Native, Content, Element, Field, WithRef, Variant, ChoiceProps, Crumb, NoticeType, TabItem } from "./shared";

export function SkipLink({ targetId, children = "Przejdź do treści" }: { targetId: string; children?: Content }): Element {
  return <a className="gp-skip" href={'#' + targetId}>{children}</a>;
}

