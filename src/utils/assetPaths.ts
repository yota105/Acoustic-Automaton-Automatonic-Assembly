export function resolveAssetUrl(assetPath: string): string {
  if (!assetPath) return assetPath;
  const normalized = assetPath.replace(/^\/+/, "");

  if (typeof window === "undefined") {
    return assetPath;
  }

  const rawBase = (import.meta as any)?.env?.BASE_URL ?? "/";
  try {
    const baseSource = window.location?.origin && window.location.origin !== "null"
      ? new URL(rawBase, window.location.origin)
      : new URL(rawBase, window.location.href);
    return new URL(normalized, baseSource).toString();
  } catch {
    const sanitizedBase = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
    return `${sanitizedBase}${normalized}`;
  }
}
