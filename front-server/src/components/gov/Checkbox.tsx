"use client";
import * as React from "react";
import { classes, FieldLayout, Choice, noticeTitles } from "./shared";
import type { Native, Content, Element, Field, WithRef, Variant, ChoiceProps, Crumb, NoticeType, TabItem } from "./shared";

export const Checkbox: WithRef<ChoiceProps, HTMLInputElement> =
  React.forwardRef((props, ref) => <Choice {...props} ref={ref} type="checkbox" />);
