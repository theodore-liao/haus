# Nightly household check

The bug-finding automation should run this after it has a candidate fix, and also when it is scanning for breakage. Local feature chats should not.

```bash
npm run nightly-check
```

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
