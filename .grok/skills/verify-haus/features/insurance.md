# Insurance

Insurance is `/insurance`: Health, Vehicle, and Home tabs with card slots. Uploads write files under `/data`.

## Sub-features

- `insurance-health` shows the Health tab (default) with Medical / Vision / Dental slots.
- `insurance-vehicle` switches to Vehicle.
- `insurance-home` switches to Home.

## How to get to it (user POV)

- Choose `Insurance` in the left rail (`data-nav-href="/insurance"`).
- Open `/insurance`.

## Driving it with verify-haus

Preconditions:

- Doctor reports `lock` or `office`.
- Logged in via the helper.

- **Health.** Open insurance. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /insurance --expect-h1 Insurance --ready-any "Health|Medical" --out insurance`. Pass: heading `Insurance` and the Health tab.
- **Vehicle / Home.** Click tabs named `Vehicle` or `Home` only to look. Do not choose a file.
- **Proof.** `artifacts/insurance/page.png`. Do not describe ID cards.

## Gotchas

- File inputs POST `/api/insurance/parse` and `/api/insurance/policies`. Do not upload.
- Member tabs under Health are household given names. Do not print them.
- Vehicle copy may say "Add vehicles on the Vehicles page". That is `/property`.
