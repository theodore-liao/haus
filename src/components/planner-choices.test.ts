import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { launchTestBrowser } from "@/lib/test-browser";

const css = readFileSync("src/app/haus.css", "utf8");
const plan = readFileSync("src/app/(office)/retirement/plan.tsx", "utf8");
const choices = css.match(/\/\* planner-choices:start \*\/([\s\S]*?)\/\* planner-choices:end \*\//);
const segmented = css.match(/\/\* segmented:start \*\/([\s\S]*?)\/\* segmented:end \*\//);

// Seed 134795265 names the household this. The second name has no spaces, so it cannot wrap.
const LONG_NAME = "Morgan Morgan Morgan International Holdings & Subsidiaries Group";
const TIGHT_NAME = "JORDAN#12345*POS PURCHASE";

test("the retirement age choice keeps long household names inside a phone page", async () => {
  assert.ok(choices, "planner-choices rules missing");
  assert.ok(segmented, "segmented rules missing");
  assert.match(plan, /planner-choices/);
  assert.match(plan, /planner-ages/);
  assert.match(choices[1], /min-width:\s*0/);
  assert.match(choices[1], /max-width:\s*100%/);
  assert.match(segmented[1], /text-overflow:\s*ellipsis/);

  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    await page.setContent(`<!doctype html>
      <style>
        :root { --type-body: 0.875rem; --border: #333; --card: #111; --muted-foreground: #aaa; --foreground: #fff; --primary: #7eabd4; --secondary: #243044; }
        body { margin: 0; font-family: sans-serif; }
        main { width: 412px; box-sizing: border-box; padding: 16px; }
        .section-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; padding: 1.25rem; }
        .kicker { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
        ${segmented[1]}
        ${choices[1]}
      </style>
      <main>
        <div class="section-head">
          <span class="kicker">Retirement planner</span>
          <div class="planner-choices">
            <div class="planner-ages">
              <span class="kicker">Ages are</span>
              <div class="segmented" role="radiogroup">
                <button type="button"><span>${LONG_NAME}</span></button>
                <button type="button"><span>${TIGHT_NAME}</span></button>
              </div>
            </div>
            <div class="segmented" role="radiogroup">
              <button type="button"><span>Today's dollars</span></button>
              <button type="button"><span>Future dollars</span></button>
            </div>
          </div>
        </div>
      </main>`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const label = await page.evaluate(() => {
      const span = document.querySelector(".planner-ages button span");
      if (!span) return null;
      const style = getComputedStyle(span);
      const box = span.getBoundingClientRect();
      return { overflow: style.textOverflow, whiteSpace: style.whiteSpace, right: box.right, width: box.width };
    });
    assert.ok(label);
    assert.equal(label.overflow, "ellipsis");
    assert.equal(label.whiteSpace, "nowrap");
    assert.ok(label.right <= 412, `name ends at ${label.right}px`);
    assert.ok(overflow <= 1, `page scrolls sideways by ${overflow}px`);
  } finally {
    await browser.close();
  }
});
