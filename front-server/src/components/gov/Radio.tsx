"use client";
import * as React from "react";
import { classes, FieldLayout, Choice, noticeTitles } from "./shared";
import type { Native, Content, Element, Field, WithRef, Variant, ChoiceProps, Crumb, NoticeType, TabItem } from "./shared";

export const Radio: WithRef<ChoiceProps & { name: string; value: string }, HTMLInputElement> =
  React.forwardRef((props, ref) => <Choice {...props} ref={ref} type="radio" />);

