"use client";
import * as React from "react";
import { classes, FieldLayout } from "./shared";
import type { Field, WithRef } from "./shared";

export const TextInput: WithRef<Field<"input">, HTMLInputElement> =
  React.forwardRef(({ label, hint, error, className, ...props }, ref) =>
    <FieldLayout {...{ id: props.id, label, hint, error, required: props.required }} externalDescription={props["aria-describedby"]}
      render={description => <input {...props} ref={ref} className={classes("gp-control", className)}
        aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={description} />} />);

