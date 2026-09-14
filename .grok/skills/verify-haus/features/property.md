# Property

Property is `/property`: real estate equity, vehicle equity, and the add dialogs. `/real-estate` and `/vehicles` redirect here.

## Sub-features

- `property-page` renders `/property`.
- `property-real-estate-redirect` sends `/real-estate` to `/property`.
- `property-vehicles-redirect` sends `/vehicles` to `/property`.
- `property-empty` shows `No property on the ledger`.

## How to get to it (user POV)

- Choose `Property` in the left rail (`data-nav-href="/property"`).
- Open `/property`, `/real-estate`, or `/vehicles`.

## Driving it with verify-haus

Preconditions:

- Doctor reports `lock` or `office`.
- Logged in via the helper.

- **Page.** Open property. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /property --expect-h1 Property --ready-any "Real estate equity|No property on the ledger" --out property`. Pass: heading `Property` and either the equity totals or the empty ledger.
- **Real estate alias.** Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /real-estate --expect-h1 Property --expect-path /property --ready-any "Real estate equity|No property on the ledger" --out property-real-estate`.
- **Vehicles alias.** Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /vehicles --expect-h1 Property --expect-path /property --ready-any "Real estate equity|No property on the ledger" --out property-vehicles`.
- **Proof.** `artifacts/property/page.png`.

## Gotchas

- `Add property` and `Add vehicle` POST to the ledger. Do not open those dialogs.
- `Edit` / `Remove` on an existing card writes or deletes. Look only.
- Insurance copy still says "Vehicles page". The route is `/property`.
