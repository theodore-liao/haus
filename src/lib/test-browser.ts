import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

/**
 * A headless browser for layout tests. Uses CHROME_PATH or an installed Chrome, the same lookup as
 * scripts/haus-check.mjs, and falls back to Playwright's own download when neither is there.
 */
export function launchTestBrowser() {
  const executablePath = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((p): p is string => Boolean(p) && existsSync(p!));
  return chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
}
