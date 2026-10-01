@AGENTS.md

# Working on Haus with Claude Code

These mirror `.cursor/rules/*.mdc`. Keep the two in step when one changes. Hooks live in `.claude/settings.json`.

## Haus decisions

`docs/haus-decisions.md` lists how Haus is supposed to look and behave.

- Before changing any page, read the whole-app section, the design-system section, and the sections for the pages you touch.
- Before reporting a change as done, check the result against those lines. If a line no longer holds, fix the change, not the line.
- For a feature change, take `npm run shots -- before --real` first when the real server is up (port 3000 or 80), then `after` and `shots:diff`. Look at every page the diff lists.
- If Aurin asks for something that contradicts a line, do what Aurin asked and rewrite that line.
- When Aurin corrects something, add or update one plain line in the same change.

## Design skills

When a `design:*` skill (critique, accessibility review, design system audit, copy review) runs on Haus, judge it against `docs/haus-decisions.md`, not generic guidance. Run `design:accessibility-review` on changed pages with forms or charts as part of the UX review gate, alongside `npm run ux`.

## UX review gate

Any change to how a page looks or behaves goes through this before you tell Aurin it is done. Fixes that do not touch the page are exempt.

Size the review to the change. Say which tier you picked, and why, when you report.

- **Small**: wording, help text, spacing, one control moved or restyled. No critic. Run `npm run ux -- --pages <page>`, fix its majors, and look at a screenshot of the changed area at 1920 and 412 yourself.
- **Medium**: a new control, or a layout change on one page. One critic round, told to check only the changed area, at 1920 and 412, on the full household (3001). Fix its blockers and majors and check the fixes yourself; no second round.
- **Large**: a new screen or a redesign. Up to two critic rounds across both test households. If round two still fails, stop and tell Aurin what is left and why.

For every tier:

1. Build the change. For a new screen, start from the closest existing Haus page's layout and say which one.
2. Start only the test households the tier needs: `npm run demo -- full 3001`, plus `npm run demo -- empty 3002` for large changes or changes that touch a first-run or no-birthdate state. Reseed only when a check needs fresh data.
3. Run `npm run ux -- --pages <changed pages>` and fix every major finding. The critic reuses its screenshots in `.grok/ux/shots` instead of taking its own.
4. When the tier calls for the critic, launch the `ux-critic` subagent with the changed pages, the changed area, one line on what the change is for, on Opus 5.5, or the strongest Claude model available (the critic always runs on it, whatever the tier). Run it in the foreground. If it runs in the background (a resumed critic always does), first `touch .grok/keep-servers` so the Stop hook leaves the test servers up, and delete that file when the loop ends.
5. Fix every blocker and major it reports. If it says "rethink the layout", do that instead of patching.
6. While iterating, run only the related test files (`npx tsx --test <file>`); run the full `npm test` once before reporting done.
7. Report to Aurin: the tier, the critic's verdict if it ran, and any minors you chose not to fix, in a few lines.

The critic only reads and reports. The screenshot diff against the real household still runs for feature changes.

## Looking at pages

- Screenshots from `npm run shots` and `npm run ux` land in `.grok/`. Open them with the Read tool. Phone shots are tall and get scaled down, so check small details in the browser.
- The built-in browser (`mcp__Claude_Browser__*`) drives the app directly. On the test household (port 3001) log in with `demo-household`. On the real household (port 3000 under `npm run dev`, port 80 under `npm start`) Aurin logs in in the browser pane; do not type the real password. The `--real` scripts read it from `.env` themselves.
- Aurin is fine with you inspecting the real household on port 3000 or 80. Look, do not type into its inputs (they save), and never restart or stop it.
- Use `resize_window` for phone width and set it back to `desktop` after.

## Console errors

Development builds record browser console errors and warnings to `.grok/console.jsonl`. The dev server log is `.next/dev/logs/next-development.log`. Read both before finishing a change, fix every error and warning there (including ones already firing), and mention what they showed. The Stop hook sends you back once if new entries appear. Ignore `The destination stream closed early` and errors from `chrome-extension://` scripts.

## Dev server

Aurin runs Haus in their own PowerShell: `npm run dev` on port 3000 while changing code, or the built app (`npm start`) on port 80 day to day. Do not run `npm run dev`, `next dev`, or `npm start`; a hook blocks the first two. Use whichever of port 3000 or 80 is up, and never touch either. If neither is up, ask Aurin to start one. Test households run on ports 3001–3009, and a Stop hook kills anything left there at the end of each turn.

## Sync wip with master

Aurin works on the local branch `wip`. Nightly bug-fix pull requests land on `master`. The SessionStart hook prints a sync note. If `origin/master` has commits that `wip` does not, bring them in before other work.

- Sync only when the working tree is clean. If it is dirty, say so in one sentence and continue.
- `git merge origin/master` on `wip`.
- Keep both sides when a conflict is mechanical (imports, adjacent lines, formatting).
- When both sides change the same behavior, decide and finish the merge. Keep the nightly bug fix, and keep Aurin's in-progress work except where it would undo that fix. If only one side can survive, keep the version that preserves balances, categories, notes, history, and saved inputs.
- After you edit a conflict, run `npm run build`. If the build fails, abort the merge and say so. A clean merge needs no build.
- Tell Aurin one sentence about any behavior you chose. Do not wait for an answer.
- Do not run a browser pass for this sync.
- If `wip` is already current, say nothing about sync.

## Windows shell

- In the Bash tool (Git Bash), prefix commands that take a `/page` argument with `MSYS_NO_PATHCONV=1`, for example `MSYS_NO_PATHCONV=1 npm run ux -- --pages /retirement`. Otherwise `/retirement` becomes `C:/Program Files/Git/retirement`.
