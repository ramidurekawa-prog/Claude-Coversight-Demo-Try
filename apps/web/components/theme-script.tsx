export const THEME_STORAGE_KEY = "streamline-theme";

/** No-flash theme bootstrap: apply the saved preference ("light" | "dark" | "system", default light) before first paint. */
export const THEME_BOOTSTRAP_SCRIPT = `(function () {
  try {
    var pref = localStorage.getItem("streamline-theme") || "light";
    var sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var resolved = pref === "system" ? (sysDark ? "dark" : "light") : pref;
    document.documentElement.setAttribute("data-theme", resolved);
  } catch (e) { document.documentElement.setAttribute("data-theme", "light"); }
})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />;
}
