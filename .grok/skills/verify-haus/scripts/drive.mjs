import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ARTIFACTS, BASE_URL, ensureArtifacts, printJson, probe } from "./lib.mjs";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOGIN_PATH = "/api/auth/login";

function parseArgs(argv) {
  const out = {
    route: "/",
    expectH1: null,
    readyAny: [],
    out: "page",
    skipLogin: false,
    clickFirstSymbol: false,
    expectPath: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--route") {
      out.route = v;
      i++;
    } else if (k === "--expect-h1") {
      out.expectH1 = v;
      i++;
    } else if (k === "--ready-any") {
      out.readyAny = String(v)
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      i++;
    } else if (k === "--out") {
      out.out = v.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      i++;
    } else if (k === "--skip-login") {
      out.skipLogin = true;
    } else if (k === "--click-first-symbol") {
      out.clickFirstSymbol = true;
    } else if (k === "--expect-path") {
      out.expectPath = v;
      i++;
    }
  }
  if (!out.route.startsWith("/")) out.route = `/${out.route}`;
  return out;
}

async function launchBrowser() {
  const { chromium } = await import("playwright-core");
  const channels = ["msedge", "chrome"];
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* try next */
    }
  }
  return chromium.launch({ headless: true });
}

function fail(report, extra) {
  Object.assign(report, extra, { pass: false });
  return report;
}

async function visibleHaystack(page) {
  const body = await page.locator("body").innerText();
  const placeholders = await page.locator("[placeholder]").evaluateAll((els) =>
    els.map((el) => el.getAttribute("placeholder") || "").join("\n"),
  );
  return `${body}\n${placeholders}`;
}

function readyHit(hay, needles) {
  return needles.some((needle) => hay.includes(needle) || hay.includes(needle.toUpperCase()));
}

const args = parseArgs(process.argv.slice(2));
ensureArtifacts();
const dest = join(ARTIFACTS, args.out);
mkdirSync(dest, { recursive: true });

const report = {
  pass: false,
  route: args.route,
  url: `${BASE_URL}${args.route}`,
  heading: null,
  emptyLedger: false,
  errorOverlay: false,
  blockedMutations: 0,
  screenshot: join(dest, "page.png"),
};

const health = await probe();
if (!health.ok) {
  writeFileSync(join(dest, "report.json"), JSON.stringify(fail(report, { error: health.state }), null, 2));
  printJson(report);
  process.exit(1);
}

const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  baseURL: BASE_URL,
});
const page = await context.newPage();
let code = 1;

page.route("**/*", async (route) => {
  const req = route.request();
  const method = req.method().toUpperCase();
  if (!MUTATING.has(method)) return route.continue();
  let path = "";
  try {
    path = new URL(req.url()).pathname;
  } catch {
    report.blockedMutations += 1;
    return route.abort("blockedbyclient");
  }
  if (path === LOGIN_PATH && method === "POST") return route.continue();
  report.blockedMutations += 1;
  return route.abort("blockedbyclient");
});

try {
  if (!args.skipLogin) {
    await page.goto("/lock", { waitUntil: "domcontentloaded" });
    const lock = page.getByRole("heading", { name: "Household lock" });
    if (await lock.isVisible().catch(() => false)) {
      const password = process.env.HAUS_SITE_PASSWORD || "";
      if (!password) {
        fail(report, { error: "lock is up; set HAUS_SITE_PASSWORD in this shell (do not read .env)" });
        await page.screenshot({ path: report.screenshot, fullPage: false });
        writeFileSync(join(dest, "report.json"), JSON.stringify(report, null, 2));
        printJson(report);
        code = 2;
        throw new Error("STOP");
      }
      await page.getByPlaceholder("Passphrase").fill(password);
      const enter = page.getByRole("button", { name: "Enter" });
      await page.waitForFunction(() => {
        const b = document.querySelector("form button[type='submit']");
        return Boolean(b) && !b.disabled;
      });
      await enter.click();
      await page.getByRole("heading", { name: "Overview" }).waitFor({ timeout: 30_000 });
    }
  }

  await page.goto(args.route, { waitUntil: "domcontentloaded" });
  if (args.expectH1) {
    await page
      .getByRole("heading", { name: args.expectH1, exact: true })
      .waitFor({ timeout: 30_000 })
      .catch(() => {});
  } else {
    await page.waitForTimeout(400);
  }

  if (args.clickFirstSymbol) {
    const symbol = page.locator('a[href^="/investments/"]').first();
    if ((await symbol.count()) === 0) {
      fail(report, { error: "no symbol link on /investments" });
      await page.screenshot({ path: report.screenshot, fullPage: false });
      writeFileSync(join(dest, "report.json"), JSON.stringify(report, null, 2));
      printJson(report);
      throw new Error("STOP");
    }
    await symbol.click();
    await page.waitForTimeout(400);
  }

  const pathNow = new URL(page.url()).pathname;
  report.url = page.url();
  if (args.expectPath && pathNow !== args.expectPath) {
    fail(report, { error: "path mismatch" });
  }

  const errorHeading = page.getByRole("heading", { name: "This page could not be loaded" });
  const notFound = page.getByRole("heading", { name: "Not found" });
  const buildDialog = page.locator("[data-nextjs-dialog], [data-nextjs-error-overlay]");
  report.errorOverlay =
    (await errorHeading.count()) > 0 || (await notFound.count()) > 0 || (await buildDialog.count()) > 0;

  let ready = args.readyAny.length === 0;
  if (!ready) {
    const deadline = Date.now() + 15_000;
    let hay = await visibleHaystack(page);
    ready = readyHit(hay, args.readyAny);
    while (!ready && Date.now() < deadline) {
      await page.waitForTimeout(200);
      hay = await visibleHaystack(page);
      ready = readyHit(hay, args.readyAny);
    }
    if (!ready) fail(report, { error: "ready text missing" });
  }

  const h1 = page.locator("h1").first();
  if ((await h1.count()) > 0) report.heading = ((await h1.innerText()) || "").trim();
  if (args.expectH1 && report.heading !== args.expectH1) {
    fail(report, { error: report.error || "heading mismatch" });
  }

  report.emptyLedger = (await page.getByRole("heading", { name: /No |No wallets yet/ }).count()) > 0;

  if (!report.errorOverlay && !report.error && ready) report.pass = true;
  if (report.errorOverlay) fail(report, { error: report.error || "error overlay" });

  await page.screenshot({ path: report.screenshot, fullPage: false });
  writeFileSync(join(dest, "report.json"), JSON.stringify(report, null, 2));
  printJson(report);
  code = report.pass ? 0 : 1;
} catch (err) {
  if (err?.message !== "STOP") {
    try {
      await page.screenshot({ path: report.screenshot, fullPage: false });
    } catch {
      /* page may already be gone */
    }
    if (!report.error) fail(report, { error: "drive failed" });
    writeFileSync(join(dest, "report.json"), JSON.stringify(report, null, 2));
    printJson(report);
    code = 1;
  }
} finally {
  await browser.close();
}
process.exit(code);
