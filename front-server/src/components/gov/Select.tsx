"use client";
import * as React from "react";
import { classes, FieldLayout } from "./shared";
import type { Field, WithRef } from "./shared";

export const Select: WithRef<Field<"select">, HTMLSelectElement> =
  React.forwardRef(({ label, hint, error, className, ...props }, ref) =>
    <FieldLayout {...{ id: props.id, label, hint, error, required: props.required }} externalDescription={props["aria-describedby"]}
      render={description => <select {...props} ref={ref} className={classes("gp-control", className)}
        aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={description} />} />);

