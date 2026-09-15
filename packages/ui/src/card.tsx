import * as React from "react";
import { cn } from "./cn";

/** Surface container. `accent` paints a 3px left strip in a claim tone. */
export function Card({ className, accent, ...props }: React.HTMLAttributes<HTMLDivElement> & { accent?: "est" | "mod" | "cau" | "book" | "bad" | "neu" | "brand" }) {
  return <div className={cn("card", accent && `card-accent card-accent-${accent}`, className)} {...props} />;
}

export function CardHead({ title, sub, right, className }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("card-hd", className)}>
      <div>
        <h3 className="card-title">{title}</h3>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
      {right && <div className="card-right">{right}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card-bd", className)} {...props} />;
}
