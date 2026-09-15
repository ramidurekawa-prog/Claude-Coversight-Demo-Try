import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand" style={{ padding: 0, marginBottom: 18 }}>
          <span className="glyph" aria-hidden="true">
            S
          </span>
          <span className="wm">
            Streamline
            <span className="by">by Coversight</span>
          </span>
        </div>
        <h1 className="login-h1">Sign in to the demo</h1>
        <p className="small" style={{ marginBottom: 16 }}>
          Every persona is synthetic. Pick one to see the product the way that person would; the numbers never change, only what you may do with them.
        </p>
        <LoginForm />
        <p className="xs" style={{ marginTop: 18 }}>
          Rosewood Group and Harbor House Group are fixtures generated from a fixed seed. Nothing here is connected to a live POS, scheduling, accounting or purchasing system.
        </p>
      </div>
    </main>
  );
}
