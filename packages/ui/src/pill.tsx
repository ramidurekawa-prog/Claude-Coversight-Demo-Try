import * as React from "react";
import { cn } from "./cn";

export type PillTone = "est" | "mod" | "cau" | "book" | "bad" | "neu" | "ghost";

/**
 * A pill carries a word AND a tone. Tone is claim strength (estimated amber,
 * modelled blue, causal purple, bookable green, failure red) or neutral; it is
 * never decorative. Every coloured pill has its word beside it by construction.
 */
export function Pill({ tone = "neu", className, title, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: PillTone }) {
  return <span className={cn("pill", `pill-${tone}`, className)} title={title} {...props} />;
}
