/**
 * An id for something made in the browser. `crypto.randomUUID` only exists on HTTPS or localhost, and Haus is
 * also opened over plain HTTP from other computers at home, where calling it throws.
 */
export function clientId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
