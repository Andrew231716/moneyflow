/** Accept only same-origin app paths, including a bank callback after login. */
export function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return "/";
  const url = new URL(value, "https://moneyflow.invalid");
  if (url.origin !== "https://moneyflow.invalid" || /^\/(login|register)(\/|$)/.test(url.pathname)) return "/";
  return url.pathname + url.search + url.hash;
}
