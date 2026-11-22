"use client";
import { classes } from "./shared";
import type { Native, Element } from "./shared";

export function Fieldset({ legend, className, children, ...props }: Native<"fieldset"> & { legend: string }): Element {
  return <fieldset {...props} className={classes("gp-group", className)}><legend>{legend}</legend>{children}</fieldset>;
}

