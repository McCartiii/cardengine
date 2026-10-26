/** What to call someone: their chosen name, or their email's first part, capitalized. */
export function friendlyName(displayName: string | null | undefined, email: string | null | undefined): string | null {
  const chosen = displayName?.trim();
  if (chosen) return chosen;
  const local = email?.split("@")[0]?.split(/[._+-]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : null;
}
