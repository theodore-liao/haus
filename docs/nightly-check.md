# Nightly household check

The bug-finding automation should run this after it has a candidate fix, and also when it is scanning for breakage. Local feature chats should not.

```bash
npx playwright-core install --with-deps chromium   # once per machine without Chrome
npm test
npm run nightly-check
```

`npm test` runs the unit tests in `src/**/*.test.ts`. Add a test there for any bug you fix.

That builds a new extreme household, starts Haus on port 3009, opens every page, and checks:

- the page loaded
- no `NaN`, `undefined`, or `Infinity` on the page
- no sideways page or legend scroll
- Overview pills add up to net worth
- no same-site console or HTTP errors

Then it stops the server. A failed run prints the seed number. Rebuild that household with:

```bash
node scripts/demo-seed.mjs random <seed>
npm run demo -- random 3009
```
