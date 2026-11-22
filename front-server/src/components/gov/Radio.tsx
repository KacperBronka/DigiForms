"use client";
import * as React from "react";
import { Choice } from "./shared";
import type { WithRef, ChoiceProps } from "./shared";

export const Radio: WithRef<ChoiceProps & { name: string; value: string }, HTMLInputElement> =
  React.forwardRef((props, ref) => <Choice {...props} ref={ref} type="radio" />);

