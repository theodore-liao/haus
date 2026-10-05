/** Plaid's exit error, as Link hands it over. Any field can be missing. */
export type LinkExitError = {
  error_type?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  display_message?: string | null;
};

/**
 * The line shown when Plaid Link closes on an error, or null when the person closed it themselves.
 * Plaid's own wording comes first, then its code, so a household can pass the exact error on.
 */
export function linkExitMessage(error: LinkExitError | null | undefined, institution?: string | null): string | null {
  if (!error) return null;
  const code = error.error_code?.trim();
  const said = (error.display_message || error.error_message || "").trim() || "Plaid couldn’t finish connecting.";
  const where = institution?.trim() ? `${institution.trim()}: ` : "";
  return `${where}${said}${code ? ` (${code})` : ""}`;
}

/** One line for the server log. Keeps only Plaid's own identifiers and wording, trimmed. */
export function linkExitLogLine(body: {
  error?: LinkExitError | null;
  institution?: string | null;
  institutionId?: string | null;
  status?: string | null;
  linkSessionId?: string | null;
  requestId?: string | null;
  relink?: boolean;
}): string {
  const clip = (v: unknown, n = 300) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
  const parts = [
    ["code", clip(body.error?.error_code, 80)],
    ["type", clip(body.error?.error_type, 80)],
    ["institution", clip(body.institution, 120)],
    ["institution_id", clip(body.institutionId, 80)],
    ["status", clip(body.status, 80)],
    ["relink", body.relink ? "yes" : ""],
    ["link_session_id", clip(body.linkSessionId, 80)],
    ["request_id", clip(body.requestId, 80)],
    ["message", clip(body.error?.error_message || body.error?.display_message)],
  ].filter(([, v]) => v);
  return `[plaid link] ${parts.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ")}`;
}
