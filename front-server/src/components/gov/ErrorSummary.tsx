"use client";
import * as React from "react";
import type { WithRef } from "./shared";
import { Link } from "./Link";

export const ErrorSummary: WithRef<{ errors: readonly { fieldId: string; message: string }[]; title?: string }, HTMLDivElement> =
  React.forwardRef(({ errors, title = "Popraw błędy w formularzu" }, ref) =>
    <div ref={ref} role="group" aria-label={title} tabIndex={-1} className="gp-summary gp-notice gp-error">
      <strong>{title}</strong><ul>{errors.map(({ fieldId, message }) =>
        <li key={fieldId}><Link href={'#' + fieldId}>{message}</Link></li>)}</ul>
    </div>);

