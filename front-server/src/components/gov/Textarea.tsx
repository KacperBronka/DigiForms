"use client";
import * as React from "react";
import { classes, FieldLayout, Choice, noticeTitles } from "./shared";
import type { Native, Content, Element, Field, WithRef, Variant, ChoiceProps, Crumb, NoticeType, TabItem } from "./shared";

export const Textarea: WithRef<Field<"textarea">, HTMLTextAreaElement> =
  React.forwardRef(({ label, hint, error, className, ...props }, ref) =>
    <FieldLayout {...{ id: props.id, label, hint, error, required: props.required }} externalDescription={props["aria-describedby"]}
      render={description => <textarea rows={4} {...props} ref={ref} className={classes("gp-control", className)}
        aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={description} />} />);

