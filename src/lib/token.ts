/**
 * Opaque access tokens for links that carry their own authorisation — the
 * candidate portal (spec §UC-3). The raw token lives only in the emailed/copied
 * link; the database stores its SHA-256 hash, so a leak of the table cannot be
 * replayed as a working link.
 */

/** A URL-safe random token (~32 bytes of entropy, base64url). */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function hashToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
