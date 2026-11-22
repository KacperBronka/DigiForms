"use client";
import * as React from "react";
import { classes } from "./shared";
import type { Native, WithRef, Variant } from "./shared";

export const Button: WithRef<Native<"button"> & { variant?: Variant }, HTMLButtonElement> =
  React.forwardRef(({ variant = "primary", className, type = "button", ...props }, ref) =>
    <button {...props} ref={ref} type={type} className={classes("gp-button", "gp-" + variant, className)} />);

