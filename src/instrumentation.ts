// Runs once when the Haus server starts.
export async function register() {
  // Bank connections refresh on their own on the Node server (lib/auto-sync.ts); the proxy's edge runtime has no database.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoSync } = await import("./lib/auto-sync");
    startAutoSync();
  }
}
