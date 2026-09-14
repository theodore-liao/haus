# Children

Children is `/children`: 529 / UTMA / Trump Account cards and manual child records.

## Sub-features

- `children-page` renders `/children`.
- `children-empty` shows `No child accounts`.

## How to get to it (user POV)

- Choose `Children` in the left rail (`data-nav-href="/children"`).
- Open `/children`.

## Driving it with verify-haus

Preconditions:

- Doctor reports `lock` or `office`.
- Logged in via the helper.

- **Page.** Open children. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /children --expect-h1 Children --ready-any "No child accounts|Add child" --out children`. Pass: heading `Children` and either the empty ledger or `Add child`.
- **Proof.** `artifacts/children/page.png`. Do not print child names from the page.

## Gotchas

- `Add child` and `Add account` POST. Do not open those dialogs.
- `Edit` on a manual record writes a balance.
