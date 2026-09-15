"use client";

import { X } from "lucide-react";
import * as React from "react";

/** One right-hand drawer: focus trapped, Escape closes, body locked. Record-level interactions never navigate away. */
export function Drawer({ title, sub, onClose, children, footer }: { title: React.ReactNode; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    document.body.classList.add("locked");
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, [href], input, select, textarea")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("locked");
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} ref={ref}>
        <div className="drawer-hd">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{title}</h2>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-bd">{children}</div>
        {footer && <div className="drawer-ft">{footer}</div>}
      </div>
    </>
  );
}
