/** The URL is the only carrier of the active scope: `?scope=all|<code>`. */
export function withScope(path: string, scope: string | undefined): string {
  if (!scope || scope === "all") return path;
  return `${path}${path.includes("?") ? "&" : "?"}scope=${encodeURIComponent(scope)}`;
}
