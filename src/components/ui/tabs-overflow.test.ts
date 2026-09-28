import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chromium } from "playwright-core";

const css = readFileSync("src/app/haus.css", "utf8");
const tabs = readFileSync("src/components/ui/tabs.tsx", "utf8");
const fit = css.match(/\/\* tab-fit:start \*\/([\s\S]*?)\/\* tab-fit:end \*\//);

// Seed 45312541 names the household this, which is wider than a phone when the tab cannot shrink.
const LONG_NAME = "Morgan Morgan Morgan International Holdings & Subsidiaries Group";

test("tab rows keep a long household name inside the page", async () => {
  assert.ok(fit, "tab-fit rules missing");
  assert.match(tabs, /tabs-fit/);
  assert.match(tabs, /<span>\{children\}<\/span>/);
  assert.match(fit[1], /min-width:\s*0/);
  assert.match(fit[1], /max-width:\s*100%/);
  assert.match(fit[1], /text-overflow:\s*ellipsis/);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    await page.setContent(`<!doctype html>
      <style>
        body { margin: 0; font-family: sans-serif; }
        main { width: 412px; box-sizing: border-box; padding: 16px; }
        .section-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; }
        .kicker { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
        .list { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 4px; }
        button { display: inline-flex; white-space: nowrap; padding: 4px 12px; font-size: 18px; }
        ${fit[1]}
      </style>
      <main>
        <div class="section-head">
          <span class="kicker">Covered member</span>
          <div class="tabs-fit list" role="tablist">
            <button role="tab"><span>${LONG_NAME}</span></button>
            <button role="tab"><span>Two</span></button>
          </div>
        </div>
      </main>`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const label = await page.evaluate(() => {
      const span = document.querySelector("[role='tab'] span");
      if (!span) return null;
      const style = getComputedStyle(span);
      return { overflow: style.textOverflow, text: span.textContent, width: span.getBoundingClientRect().width };
    });
    assert.ok(label);
    assert.equal(label.text, LONG_NAME);
    assert.equal(label.overflow, "ellipsis");
    assert.ok(label.width < 412, `label is ${label.width}px wide`);
    assert.ok(overflow <= 1, `page scrolls sideways by ${overflow}px`);
  } finally {
    await browser.close();
  }
});
