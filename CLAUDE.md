@AGENTS.md

# Working on Haus with Claude Code

These mirror `.cursor/rules/*.mdc`. Keep the two in step when one changes. Hooks live in `.claude/settings.json`.

## Haus decisions

`docs/haus-decisions.md` lists how Haus is supposed to look and behave.

- Before changing any page, read the whole-app section, the design-system section, and the sections for the pages you touch.
- Before reporting a change as done, check the result against those lines. If a line no longer holds, fix the change, not the line.
- For a feature change, take `npm run shots -- before --real` first when port 3000 is up, then `after` and `shots:diff`. Look at every page the diff lists.
- If Aurin asks for something that contradicts a line, do what Aurin asked and rewrite that line.
- When Aurin corrects something, add or update one plain line in the same change.

## Design skills

When a `design:*` skill (critique, accessibility review, design system audit, copy review) runs on Haus, judge it against `docs/haus-decisions.md`, not generic guidance. Run `design:accessibility-review` on changed pages with forms or charts as part of the UX review gate, alongside `npm run ux`.

## UX review gate

Any change to how a page looks or behaves goes through this loop before you tell Aurin it is done. Fixes that do not touch the page are exempt.

1. Build the change. For a new screen, start from the closest existing Haus page's layout and say which one.
2. Start the two test households if they are down: `npm run demo -- full 3001` and `npm run demo -- empty 3002`, each with the Bash tool in the background, then poll `/lock` on both until they answer. Only these two: full covers the usual case, empty covers a brand-new user and no birthdates.
3. Run `npm run ux -- --pages <changed pages>` and fix every major finding.
4. Launch the `ux-critic` subagent with the changed pages and one line on what the change is for. Run it in the foreground. If it runs in the background (a resumed critic always does), first `touch .grok/keep-servers` so the Stop hook leaves the test servers up, and delete that file when the loop ends.
5. Fix every blocker and major it reports. If it says "rethink the layout", do that instead of patching.
6. Run the critic once more. Two rounds at most, to save time and tokens. If it still fails, stop and tell Aurin what is left and why.
7. Only then report to Aurin: the critic's final verdict and any minors you chose not to fix, in a few lines.

The critic only reads and reports. The screenshot diff against the real household still runs.

## Looking at pages

- Screenshots from `npm run shots` and `npm run ux` land in `.grok/`. Open them with the Read tool. Phone shots are tall and get scaled down, so check small details in the browser.
- The built-in browser (`mcp__Claude_Browser__*`) drives the app directly. On the test household (port 3001) log in with `demo-household`. On the real household (port 3000) Aurin logs in in the browser pane; do not type the real password. The `--real` scripts read it from `.env` themselves.
- Aurin is fine with you inspecting the real household on port 3000. Look, do not type into its inputs (they save), and never restart or stop it.
- Use `resize_window` for phone width and set it back to `desktop` after.

## Console errors

Development builds record browser console errors and warnings to `.grok/console.jsonl`. The dev server log is `.next/dev/logs/next-development.log`. Read both before finishing a change, fix every error and warning there (including ones already firing), and mention what they showed. The Stop hook sends you back once if new entries appear. Ignore `The destination stream closed early` and errors from `chrome-extension://` scripts.

## Dev server

Aurin runs `npm run dev` in their own PowerShell on port 3000. Do not run `npm run dev` or `next dev`; a hook blocks them. If port 3000 is down, ask Aurin to start it. Test households run on ports 3001–3009, and a Stop hook kills anything left there at the end of each turn.

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
