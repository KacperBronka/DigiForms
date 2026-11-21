"use client";
import * as React from "react";
import { classes, FieldLayout, Choice, noticeTitles } from "./shared";
import type { Native, Content, Element, Field, WithRef, Variant, ChoiceProps, Crumb, NoticeType, TabItem } from "./shared";
import { Button } from "./Button";

export function Dialog({ trigger, title, children, closeLabel = "Zamknij" }: {
  trigger: string; title: string; children: Content; closeLabel?: string;
}): Element {
  const dialog = React.useRef<HTMLDialogElement>(null);
  return <><Button aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>{trigger}</Button>
    <dialog className="gp-dialog" ref={dialog} aria-label={title}>
      <h2>{title}</h2>{children}<Button variant="secondary" onClick={() => dialog.current?.close()}>{closeLabel}</Button>
    </dialog></>;
}

