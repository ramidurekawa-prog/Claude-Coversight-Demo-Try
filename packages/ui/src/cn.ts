import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "h1", "h2", "h3", "stat"] }],
      h: [{ h: ["control", "row"] }],
      w: [{ w: ["control"] }],
      "min-h": [{ "min-h": ["control", "row"] }],
      p: [{ p: ["card"] }],
      gap: [{ gap: ["stack", "inline"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
export type { ClassValue };
