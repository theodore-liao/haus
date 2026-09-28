// Opens Haus in a headless browser and either checks every page for breakage or takes screenshots to compare.
//
//   node scripts/haus-check.mjs check [--demo | --real] [--pages /,/spending]
//   node scripts/haus-check.mjs shots <label> [--demo | --real] [--pages ...]
//   node scripts/haus-check.mjs diff <before-label> <after-label>
//   node scripts/haus-check.mjs ux [--pages ...]      uses each page like a person and flags UX problems
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

const UX_SIZES = [
  { width: 2560, height: 1440 },
  { width: 1920, height: 1080 },
  { width: 412, height: 915 },
];
const CARD = '[class*="radius-card"], .hero-card, .chart-card';

/** Layout problems a picky user would notice, measured in the page. */
async function layoutProblems(page, phone) {
  return page.evaluate(
    ({ CARD, phone }) => {
      const out = [];
      const main = document.querySelector("main") ?? document.body;
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const title = (el) =>
        (el.querySelector("h1,h2,h3,.kicker")?.textContent ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);

      const cards = [...main.querySelectorAll(CARD)].filter(visible).filter((el) => !el.parentElement.closest(CARD));
      const hero = cards.find((el) => el.matches(".hero-card") || el.querySelector(".hero-card"));
      if (hero && cards[0] !== hero) {
        out.push(`The main summary card "${title(hero)}" is not at the top; "${title(cards[0])}" is above it`);
      }

      if (!phone) {
        const rows = [];
        for (const el of cards) {
          const r = el.getBoundingClientRect();
          const row = rows.find((x) => x.parent === el.parentElement && Math.abs(x.top - r.top) < 8);
          if (row) row.items.push({ el, h: r.height });
          else rows.push({ parent: el.parentElement, top: r.top, items: [{ el, h: r.height }] });
        }
        for (const { items: row } of rows) {
          if (row.length < 2) continue;
          const hs = row.map((x) => x.h);
          const max = Math.max(...hs);
          const min = Math.min(...hs);
          if (max - min > 120 && max / min > 1.35) {
            out.push(`Side-by-side cards differ in height (${row.map((x) => `"${title(x.el)}" ${Math.round(x.h)}px`).join(", ")})`);
          }
        }
      }

      for (const input of main.querySelectorAll("input")) {
        if (!visible(input) || ["hidden", "password", "checkbox", "radio", "file"].includes(input.type)) continue;
        const v = input.value.trim();
        if (/^-?\d{5,}(\.\d+)?$/.test(v) || /\.\d{3,}$/.test(v)) out.push(`Input shows a raw number "${v.slice(0, 24)}" (needs commas, at most two decimals)`);
      }

      const boxes = [...main.querySelectorAll("input, select, button[role=combobox]")]
        .filter(visible)
        .map((el) => ({ el, r: el.getBoundingClientRect() }));
      let misaligned = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].r;
          const b = boxes[j].r;
          const sameCard = boxes[i].el.closest(CARD) === boxes[j].el.closest(CARD);
          const dy = Math.abs(a.top - b.top);
          const overlapX = a.right > b.left - 400 && b.right > a.left - 400;
          if (sameCard && overlapX && dy >= 2 && dy <= 14) misaligned++;
        }
      }
      if (misaligned) out.push(`${misaligned} pair(s) of inputs sit a few pixels off the same line`);

      let noPointer = 0;
      for (const el of main.querySelectorAll("button, [role=button], a[href], [role=switch]")) {
        if (!visible(el) || el.disabled) continue;
        if (getComputedStyle(el).cursor !== "pointer") noPointer++;
      }
      if (noPointer) out.push(`${noPointer} button(s) or link(s) do not show the hand cursor`);

      let clipped = 0;
      for (const el of main.querySelectorAll("*")) {
        if (!visible(el) || el.children.length) continue;
        const s = getComputedStyle(el);
        if (s.overflow === "visible" || s.textOverflow === "ellipsis" || el.matches("input, textarea, svg *")) continue;
        if (el.scrollWidth > el.clientWidth + 2) clipped++;
      }
      if (clipped) out.push(`${clipped} piece(s) of text are cut off without "…"`);

      if (phone) {
        let small = 0;
        for (const el of main.querySelectorAll("button, [role=button], a[href], input, [role=switch]")) {
          if (!visible(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.height < 24 || r.width < 24) small++;
        }
        if (small) out.push(`${small} tap target(s) are smaller than 24px on a phone`);
      }
      return out;
    },
    { CARD, phone },
  );
}

/** Changes each input and switch the way a person would, and flags ones that change nothing, or that change the page mid-typing instead of on Enter or leaving the box. */
async function interactionProblems(page) {
  const out = [];
  // Page text, optionally without one box's own note and hint: while typing, "Enter to apply" shows inside that box,
  // which is the box talking, not the page reacting.
  const mainText = (quietBox) =>
    page.evaluate((box) => {
      // Hide the note itself rather than cutting its words, which another box's identical help line would match.
      const field = box?.closest(".field");
      const quiet = field ? [...field.querySelectorAll(".field-note, .field-hint")] : [];
      for (const el of quiet) el.style.display = "none";
      const text = document.body.innerText;
      for (const el of quiet) el.style.display = "";
      // Taking a note out leaves its line break behind, so compare words, not layout.
      return `${document.documentElement.className}
${text.replace(/\s+/g, " ").trim()}`;
    }, quietBox ?? null);
  const inputs = page.locator(
    'main input:visible:not([type=password]):not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=date]):not([type=range]):not([type=color])',
  );
  const count = await inputs.count();
  for (let i = 0; i < Math.min(count, 60); i++) {
    try {
      out.push(...(await probeInput(page, inputs.nth(i), mainText)));
    } catch (e) {
      out.push(`Could not use input #${i + 1}: ${e.message.split("\n")[0].slice(0, 120)}`);
    }
  }
  const switches = page.locator("main [role=switch]:visible");
  for (let i = 0; i < Math.min(await switches.count(), 20); i++) {
    const sw = switches.nth(i);
    const label = (await sw.getAttribute("aria-label")) ?? (await sw.getAttribute("id")) ?? `switch #${i + 1}`;
    try {
      const before = await mainText();
      await sw.click({ timeout: 5000 });
      await page.waitForTimeout(600);
      if ((await mainText()) === before) out.push(`Switch "${label}" changes nothing visible`);
      await sw.click({ timeout: 5000 });
      await page.waitForTimeout(400);
    } catch (e) {
      out.push(`Could not use switch "${label}": ${e.message.split("\n")[0].slice(0, 120)}`);
    }
  }
  return out;
}

async function probeInput(page, input, mainText) {
  const out = [];
  // Search boxes and name boxes update as you type on purpose (data-search, data-live), so they are not held to the Enter-or-leave rule.
  const skip = await input.evaluate(
    (el) => Boolean(el.closest("form, [role=dialog]")) || el.readOnly || el.disabled || el.hasAttribute("data-search") || el.hasAttribute("data-live"),
  );
  if (skip) return out;
  const label = await input.evaluate((el) => {
    const box = el.closest("div")?.parentElement;
    const text = el.getAttribute("aria-label") || el.placeholder || box?.querySelector("label")?.textContent || "";
    return text.trim().slice(0, 40) || `input #${[...document.querySelectorAll("main input")].indexOf(el) + 1}`;
  });
  const original = await input.inputValue();
  const numeric = original.replace(/[$,%\s]/g, "");
  const wantsNumber = await input.evaluate((el) => el.type === "number" || ["decimal", "numeric"].includes(el.inputMode));
  const next =
    numeric && Number.isFinite(Number(numeric))
      ? String(Math.round(Number(numeric) * 1.7 + 3))
      : wantsNumber
        ? "5"
        : `${original}zzqx`;
  const box = await input.elementHandle();
  const before = await mainText();
  const beforeQuiet = await mainText(box);
  await box.fill(next, { timeout: 5000 });
  await page.waitForTimeout(500);
  const live = (await mainText(box)) !== beforeQuiet;
  await box.press("Tab", { timeout: 5000 });
  await page.waitForTimeout(800);
  // After leaving the box, its note counts: an error message is a visible answer.
  const after = (await mainText()) !== before;
  if (live) out.push(`"${label}" changes the page while typing (should wait for Enter or leaving the box)`);
  if (!live && !after) out.push(`"${label}" changes nothing visible`);
  // Everything goes through the same element: a change can add or remove boxes above this one, so the locator's index
  // may point at a different box by the time it is used again.
  await box.fill(original, { timeout: 5000 });
  await box.press("Tab", { timeout: 5000 });
  // Let the restored value finish re-rendering, or the next box's "before" catches the page mid-update.
  await page.waitForTimeout(900);
  return out;
}

async function ux() {
  const t = target();
  const real = flag("--real");
  const dir = path.join(outRoot, "ux");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "shots"), { recursive: true });
  const browser = await launch();
  const findings = [];
  try {
    for (const size of UX_SIZES) {
      const { context, page } = await login(browser, t, size);
      const phone = size.width < 800;
      for (const p of pages()) {
        const res = await settle(page, p, t);
        if (res && res.status() === 404) continue;
        await page.screenshot({
          path: path.join(dir, "shots", `${pageName(p)}@${size.width}.png`),
          fullPage: true,
          animations: "disabled",
          ...(real ? { mask: [page.locator(".money")] } : {}),
        });
        for (const problem of await layoutProblems(page, phone)) findings.push({ page: p, size: size.width, problem });
        // Typing saves inputs, so only the throwaway test household gets typed into. Settings inputs save preferences rather than show results.
        if (!real && size.width === 2560 && p !== "/settings") {
          for (const problem of await interactionProblems(page)) findings.push({ page: p, size: size.width, problem });
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const minor = /tap target|hand cursor|few pixels off|cut off/;
  for (const f of findings) f.severity = minor.test(f.problem) ? "minor" : "major";
  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "major" ? -1 : 1));
  writeFileSync(path.join(dir, "report.json"), JSON.stringify({ base: t.base, when: new Date().toISOString(), findings }, null, 2));
  if (!findings.length) console.log(`No UX problems found on ${pages().length} pages.`);
  for (const f of findings) console.log(`UX ${f.severity.toUpperCase()} ${f.page} @${f.size}px: ${f.problem}`);
  console.log(`Screenshots for review: .grok/ux/shots${real ? " (dollar amounts masked)" : ""}`);
  process.exitCode = findings.some((f) => f.severity === "major") ? 1 : 0;
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
  else if (mode === "ux") await ux();
  else {
    console.error("Use: check, shots <label>, diff <before> <after>, or ux.");
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
