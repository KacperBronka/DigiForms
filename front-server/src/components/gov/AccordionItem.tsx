"use client";
import { classes } from "./shared";
import type { Native, Element } from "./shared";

export function AccordionItem({ summary, children, className, ...props }: Native<"details"> & { summary: string }): Element {
  return <details {...props} className={classes("gp-details", className)}>
    <summary>{summary}</summary><div>{children}</div>
  </details>;
}

