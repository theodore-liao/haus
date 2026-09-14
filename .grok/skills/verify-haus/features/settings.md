# Settings

Settings is `/settings`: household display names, UI scale, privacy copy, and log out.

## Sub-features

- `settings-page` renders `/settings`.
- `settings-privacy` shows the Privacy card.

## How to get to it (user POV)

- Choose `Settings` in the left rail (`data-nav-href="/settings"`).
- Open `/settings`.

## Driving it with verify-haus

Preconditions:

- Doctor reports `lock` or `office`.
- Logged in via the helper.

- **Page.** Open settings. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /settings --expect-h1 Settings --ready-any "Household|Privacy" --out settings`. Pass: heading `Settings` and cards `Household` and `Privacy`.
- **Proof.** `artifacts/settings/page.png`. Do not print the values in Primary / Spouse.

## Gotchas

- `Save names` PATCHes `/api/household`. Do not click it. Do not type in those fields.
- `Log out` POSTs `/api/auth/logout` and would only affect this Playwright session, but skip it. Office proof needs the session.
- UI scale writes `localStorage`. Leave it.
