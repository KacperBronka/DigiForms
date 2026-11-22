"use client";
import { classes } from "./shared";
import type { Native, Element } from "./shared";

export function Link({ className, ...props }: Native<"a"> & { href: string }): Element {
  return <a {...props} className={classes("gp-link", className)} />;
}

