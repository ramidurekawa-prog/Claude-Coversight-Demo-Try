"use client";

import { Button } from "@streamline/ui";
import { useRouter } from "next/navigation";
import * as React from "react";

const PERSONAS = [
  { email: "rose@rosewood.example", name: "Rose Jorge", title: "Owner · Rosewood Group", question: "Is this business healthy, and is this worth keeping?", role: "owner" },
  { email: "maria@rosewood.example", name: "Maria Reyes", title: "General manager · Rosewood Oakland", question: "What changes this week, and what do I do tonight?", role: "gm" },
  { email: "dana@rosewood.example", name: "Dana Whitfield", title: "Group controller · Rosewood Group", question: "Can I reproduce, challenge and reconcile every dollar?", role: "finance" },
  { email: "elena@harborhouse.example", name: "Elena Marsh", title: "Owner · Harbor House Group (connected nine days ago)", question: "What does a brand-new account look like?", role: "owner" },
  { email: "admin@streamline.example", name: "Streamline admin", title: "Streamline (Coversight) operations", question: "Are the numbers safe to stand behind?", role: "admin" },
] as const;

const DEMO_PASSWORD = "streamline-demo-2026";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState<string>(PERSONAS[0].email);
  const [password, setPassword] = React.useState(DEMO_PASSWORD);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? `Sign-in failed (${res.status}).`);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" aria-label="Sign in">
      <div className="choices" role="radiogroup" aria-label="Persona">
        {PERSONAS.map((p) => (
          <label key={p.email} className={`choice ${email === p.email ? "on" : ""}`}>
            <input type="radio" name="persona" value={p.email} checked={email === p.email} onChange={() => setEmail(p.email)} />
            <span>
              <span className="choice-title">
                {p.name} <span className="muted">· {p.title}</span>
              </span>
              <span className="choice-desc">“{p.question}”</span>
            </span>
          </label>
        ))}
      </div>
      <label className="field">
        <span className="field-label">Demo password</span>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <span className="field-hint">Published with the fixture: {DEMO_PASSWORD}</span>
      </label>
      {error && <div className="note note-bad">{error}</div>}
      <Button type="submit" loading={busy} size="lg">
        Sign in
      </Button>
    </form>
  );
}
