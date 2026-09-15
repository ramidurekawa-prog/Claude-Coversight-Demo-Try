"use client";

import type { MeResponse } from "@streamline/contracts";
import { LogOut, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { isActive, NAV_SECTIONS, NAV_TOP, type NavItem } from "../../lib/nav";
import { withScope } from "../../lib/scope";

const ROLE_LABEL: Record<MeResponse["persona"]["role"], string> = { owner: "Owner", gm: "General manager", finance: "Finance", admin: "Streamline admin" };

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Sidebar({ me }: { me: MeResponse }) {
  const pathname = usePathname();
  const router = useRouter();
  const scope = useSearchParams().get("scope") ?? undefined;
  const close = () => document.body.classList.remove("nav-open");

  React.useEffect(() => {
    close();
  }, [pathname]);

  async function signOut() {
    await fetch("/api/v1/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    router.push("/login");
    router.refresh();
  }

  const item = (n: NavItem) => {
    const active = isActive(n.href, pathname);
    return (
      <Link key={n.id} href={withScope(n.href, scope)} className={`navitem ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} title={n.question}>
        <span className="ico">
          <n.icon size={18} />
        </span>
        {n.label}
      </Link>
    );
  };

  return (
    <>
      <div className="nav-scrim" onClick={close} aria-hidden="true" />
      <aside className="sidebar" aria-label="Navigation">
        <div className="sb-head">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Link href={withScope("/", scope)} className="brand" aria-label="Streamline home">
              <span className="glyph" aria-hidden="true">
                S
              </span>
              <span className="wm">
                Streamline
                <span className="by">by Coversight</span>
              </span>
            </Link>
            <button type="button" className="iconbtn burger" aria-label="Close navigation" onClick={close}>
              <X size={18} />
            </button>
          </div>
          <nav className="navsec-top" aria-label="Primary">
            {NAV_TOP.map(item)}
          </nav>
        </div>
        <div className="sb-scroll">
          {NAV_SECTIONS.map((s) => (
            <nav key={s.key} className="navsec" aria-label={s.label}>
              <div className="seclbl">{s.label}</div>
              {s.items.map(item)}
            </nav>
          ))}
        </div>
        <div className="foot">
          <div className="userchip">
            <span className="avatar" aria-hidden="true">
              {initialsOf(me.user.name)}
            </span>
            <span className="who">
              <span className="name">{me.user.name}</span>
              <span className="role">
                {ROLE_LABEL[me.persona.role]} · {me.org.name}
              </span>
            </span>
          </div>
          <Link href="/login" className="footlink">
            <RotateCcw size={15} /> Switch persona
          </Link>
          <button type="button" className="footlink" onClick={signOut}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
