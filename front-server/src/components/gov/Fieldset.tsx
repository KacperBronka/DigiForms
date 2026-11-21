"use client";
import * as React from "react";
import { classes, FieldLayout, Choice, noticeTitles } from "./shared";
import type { Native, Content, Element, Field, WithRef, Variant, ChoiceProps, Crumb, NoticeType, TabItem } from "./shared";

export function Fieldset({ legend, className, children, ...props }: Native<"fieldset"> & { legend: string }): Element {
  return <fieldset {...props} className={classes("gp-group", className)}><legend>{legend}</legend>{children}</fieldset>;
}

