// Opens Haus in a headless browser and either checks every page for breakage or takes screenshots to compare.
//
//   node scripts/haus-check.mjs check [--demo | --real] [--pages /,/spending]
//   node scripts/haus-check.mjs shots <label> [--demo | --real] [--pages ...]
//   node scripts/haus-check.mjs diff <before-label> <after-label>
//
// --real uses localhost:3000 and the password in .env. --demo uses localhost:3001 and the test password.
// Output goes to .grok/, which git ignores: screenshots of the real household never leave this machine.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const root = path.resolve(import.meta.dirname, "..");
const outRoot = path.join(root, ".grok");
const ALL_PAGES = ["/", "/spending", "/transactions", "/investments", "/crypto", "/retirement", "/property", "/insurance", "/insights", "/connections", "/settings"];
const SHOT_SIZES = [
  { width: 2560, height: 1440 },
  { width: 1920, height: 1080 },
];
const CHECK_SIZES = [
  { width: 2560, height: 1440 },
  { width: 412, height: 915 },
];

const [mode, ...rest] = process.argv.slice(2);
const flag = (name) => rest.includes(name);
const option = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};

function target() {
  if (flag("--real")) {
    return { base: option("--base") ?? "http://localhost:3000", password: envPassword() };
  }
  return { base: option("--base") ?? "http://localhost:3001", password: "demo-household" };
}

function envPassword() {
  if (process.env.HAUS_SITE_PASSWORD) return process.env.HAUS_SITE_PASSWORD;
  const file = path.join(root, ".env");
  if (!existsSync(file)) throw new Error("No .env file with HAUS_SITE_PASSWORD.");
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("HAUS_SITE_PASSWORD="));
  if (!line) throw new Error("HAUS_SITE_PASSWORD is not set in .env.");
  return line.slice("HAUS_SITE_PASSWORD=".length).trim().replace(/^"(.*)"$/, "$1");
}

function pages() {
  const list = option("--pages");
  return list ? list.split(",") : ALL_PAGES;
}

function pageName(p) {
  return p === "/" ? "overview" : p.slice(1).replaceAll("/", "-");
}

async function launch() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const executablePath = candidates.find((p) => existsSync(p));
  try {
    return await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  } catch (e) {
    throw new Error(`Could not start a browser. Install Chrome, or run "npx playwright-core install chromium". ${e.message}`);
  }
}

async function login(browser, t, size) {
  const context = await browser.newContext({ viewport: size, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${t.base}/lock`, { waitUntil: "domcontentloaded", timeout: 120000 });
  if (page.url().includes("/lock")) {
    await page.fill("input[type=password]", t.password);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.includes("/lock"), { timeout: 60000 });
  }
  return { context, page };
}

async function settle(page, p, t) {
  const res = await page.goto(`${t.base}${p}`, { waitUntil: "networkidle", timeout: 120000 });
  // Charts animate in with JavaScript, which reducedMotion does not stop.
  await page.waitForTimeout(1500);
  return res;
}

function parseMoney(text) {
  const n = Number(String(text).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function check() {
  const t = target();
  const browser = await launch();
  const failures = [];
  const external = new Set();
  try {
    for (const size of CHECK_SIZES) {
      const { context, page } = await login(browser, t, size);
      let current = "";
      page.on("pageerror", (e) => failures.push({ page: current, size: size.width, problem: `Page crashed: ${e.message}` }));
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        if (/Failed to load resource/.test(m.text())) return;
        failures.push({ page: current, size: size.width, problem: `Console error: ${m.text().slice(0, 300)}` });
      });
      page.on("response", (r) => {
        if (r.status() < 400) return;
        const sameSite = r.url().startsWith(t.base);
        if (!sameSite) {
          external.add(new URL(r.url()).host);
          return;
        }
        if (r.request().resourceType() === "document" && r.status() === 404) return;
        failures.push({ page: current, size: size.width, problem: `${r.status()} from ${r.url().slice(t.base.length, t.base.length + 120)}` });
      });

      for (const p of pages()) {
        current = p;
        const res = await settle(page, p, t);
        if (res && res.status() === 404) continue;
        const found = await page.evaluate(() => {
          const main = document.querySelector("main");
          const text = main ? main.innerText : document.body.innerText;
          const bad = text.match(/\bNaN\b|\bundefined\b|\bInfinity\b|\[object Object\]/g) ?? [];
          const doc = document.documentElement;
          const pageOverflow = doc.scrollWidth - doc.clientWidth;
          const legendBars = [...document.querySelectorAll(".legend")].filter((el) => el.scrollWidth > el.clientWidth + 1).length;
          const hero = document.querySelector(".hero-card .display-number");
          const pills = [...document.querySelectorAll(".pill")].map((el) => ({
            label: el.querySelector(".kicker")?.textContent?.trim() ?? "",
            value: el.querySelector(".money")?.textContent ?? el.querySelector(".display-number")?.textContent ?? "",
          }));
          return { bad: [...new Set(bad)], pageOverflow, legendBars, hero: hero?.textContent ?? null, pills };
        });
        const where = { page: p, size: size.width };
        if (found.bad.length) failures.push({ ...where, problem: `Shows ${found.bad.join(", ")} as text` });
        if (found.pageOverflow > 1) failures.push({ ...where, problem: `Page scrolls sideways by ${found.pageOverflow}px` });
        if (found.legendBars) failures.push({ ...where, problem: `${found.legendBars} chart legend(s) scroll sideways` });
        if (p === "/" && found.hero && found.pills.length === 4) {
          const netWorth = parseMoney(found.hero);
          const values = found.pills.map((x) => parseMoney(x.value));
          if (netWorth != null && values.every((v) => v != null)) {
            const sum = values.reduce((s, v) => s + v, 0);
            if (Math.abs(sum - netWorth) > 1) {
              failures.push({ ...where, problem: `Overview pills add up to ${sum.toFixed(2)}, but net worth is ${netWorth.toFixed(2)}` });
            }
          }
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const seen = new Set();
  const unique = failures.filter((f) => {
    const key = `${f.page}|${f.problem}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  mkdirSync(path.join(outRoot, "check"), { recursive: true });
  const report = { base: t.base, when: new Date().toISOString(), failures: unique, externalFailures: [...external] };
  writeFileSync(path.join(outRoot, "check", "report.json"), JSON.stringify(report, null, 2));
  if (!unique.length) console.log(`No problems on ${pages().length} pages.`);
  for (const f of unique) console.log(`FAIL ${f.page} @${f.size}px: ${f.problem}`);
  if (external.size) console.log(`Outside requests that failed (not counted): ${[...external].join(", ")}`);
  process.exitCode = unique.length ? 1 : 0;
}

async function shots(label) {
  if (!label) throw new Error("Give the screenshots a label, such as before or after.");
  const t = target();
  const dir = path.join(outRoot, "shots", label);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const browser = await launch();
  try {
    for (const size of SHOT_SIZES) {
      const { context, page } = await login(browser, t, size);
      for (const p of pages()) {
        await settle(page, p, t);
        // Dollar amounts move with live prices; mask them so only layout changes count.
        await page.screenshot({
          path: path.join(dir, `${pageName(p)}@${size.width}.png`),
          fullPage: true,
          animations: "disabled",
          mask: [page.locator(".money")],
        });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`Saved ${pages().length * SHOT_SIZES.length} screenshots to .grok/shots/${label}`);
}

function diff(beforeLabel, afterLabel) {
  if (!beforeLabel || !afterLabel) throw new Error("Give two labels to compare, such as before after.");
  const a = path.join(outRoot, "shots", beforeLabel);
  const b = path.join(outRoot, "shots", afterLabel);
  const out = path.join(outRoot, "shots", `diff-${beforeLabel}-${afterLabel}`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const changed = [];
  for (const file of readdirSync(a).filter((f) => f.endsWith(".png"))) {
    if (!existsSync(path.join(b, file))) {
      changed.push({ file, note: `missing from ${afterLabel}` });
      continue;
    }
    const x = PNG.sync.read(readFileSync(path.join(a, file)));
    const y = PNG.sync.read(readFileSync(path.join(b, file)));
    if (x.width !== y.width || x.height !== y.height) {
      changed.push({ file, note: `page size changed from ${x.width}x${x.height} to ${y.width}x${y.height}`, after: path.join(b, file) });
      continue;
    }
    const d = new PNG({ width: x.width, height: x.height });
    const pixels = pixelmatch(x.data, y.data, d.data, x.width, x.height, { threshold: 0.1 });
    const share = pixels / (x.width * x.height);
    if (share > 0.001) {
      const diffFile = path.join(out, file);
      writeFileSync(diffFile, PNG.sync.write(d));
      changed.push({ file, note: `${(share * 100).toFixed(2)}% of pixels changed`, diff: diffFile, after: path.join(b, file) });
    }
  }
  writeFileSync(path.join(out, "changed.json"), JSON.stringify(changed, null, 2));
  if (!changed.length) console.log("No screenshots changed.");
  for (const c of changed) console.log(`CHANGED ${c.file}: ${c.note}`);
}

function positional(n) {
  const skip = new Set(["--pages", "--base"]);
  const values = [];
  for (let i = 0; i < rest.length; i++) {
    if (skip.has(rest[i])) {
      i += 1;
      continue;
    }
    if (rest[i].startsWith("--")) continue;
    values.push(rest[i]);
  }
  return values[n];
}

try {
  if (mode === "check") await check();
  else if (mode === "shots") await shots(positional(0));
  else if (mode === "diff") diff(positional(0), positional(1));
  else {
    console.error("Use: check, shots <label>, or diff <before> <after>.");
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
