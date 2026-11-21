"use client";
import * as React from "react";
import { classes, FieldLayout, Choice, noticeTitles } from "./shared";
import type { Native, Content, Element, Field, WithRef, Variant, ChoiceProps, Crumb, NoticeType, TabItem } from "./shared";

export function Tabs({ id, label, items }: { id: string; label: string; items: readonly TabItem[] }): Element | null {
  const [chosen, setChosen] = React.useState(items[0]?.key);
  const active = items.find(item => item.key === chosen)?.key ?? items[0]?.key;
  if (!items.length) return null;
  function navigate(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = items.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = index === last ? 0 : index + 1; break;
      case "ArrowLeft": next = index === 0 ? last : index - 1; break;
      case "Home": next = 0; break;
      case "End": next = last; break;
      default: return;
    }
    event.preventDefault();
    setChosen(items[next].key);
    event.currentTarget.ownerDocument.getElementById(id + "-tab-" + items[next].key)?.focus();
  }
  return <div className="gp-tabs"><div role="tablist" aria-label={label}>
    {items.map(({ key, label: tabLabel }, index) =>
      <button type="button" key={key} id={id + "-tab-" + key} role="tab"
        aria-selected={active === key} aria-controls={id + "-panel-" + key} tabIndex={active === key ? 0 : -1}
        onClick={() => setChosen(key)} onKeyDown={event => navigate(event, index)}>{tabLabel}</button>)}
  </div>{items.map(({ key, content }) =>
    <div key={key} role="tabpanel" id={id + "-panel-" + key} aria-labelledby={id + "-tab-" + key}
      hidden={active !== key} tabIndex={0}>{content}</div>)}</div>;
}
