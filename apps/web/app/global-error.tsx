"use client";

/**
 * The last resort: a failure in the root layout itself, which replaces the
 * document rather than rendering inside it.
 *
 * Next's own page for this case is an unstyled "A server error occurred", and
 * its global styles and fonts do not reach this component, so everything here
 * is inline and depends on nothing. It still asks the deployment what is wrong,
 * because that is the whole value of the page.
 */
import { failureCopy, useDeploymentDiagnosis } from "../components/failure";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const diagnosis = useDeploymentDiagnosis();
  const { title, description } = failureCopy(error, diagnosis);
  return (
    // global-error must render its own html and body.
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f6f5", color: "#12211d", font: '400 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
        <title>Streamline</title>
        <main style={{ maxWidth: 560, padding: 32, margin: 16, background: "#fff", border: "1px solid #dbe5e2", borderRadius: 14 }}>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5b706a" }}>Streamline · by Coversight</p>
          <h1 style={{ margin: "12px 0 8px", fontSize: 21, fontWeight: 600 }}>{title}</h1>
          <p style={{ margin: "0 0 20px", color: "#3c4f4a" }}>{description}</p>
          <button type="button" onClick={() => reset()} style={{ font: "inherit", fontWeight: 500, padding: "9px 16px", borderRadius: 9, border: "1px solid #dbe5e2", background: "#f7faf9", cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
