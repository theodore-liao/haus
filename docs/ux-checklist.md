# UX checklist

The critic scores every changed page against this list, on top of `docs/haus-decisions.md`. Each failed line is a finding.

## First look (5 seconds, no scrolling)

- The page's main summary card is at the top, the same as other pages.
- Each card has one obvious answer: the number or chart the person came for. It is the largest thing in the card.
- A new user can say what the card is for without reading help text.
- Nothing looks unfinished: no raw numbers like `3207724.3131`, no empty boxes without a reason, no placeholder names.

## Hierarchy and look

- Results are louder than inputs. Inputs are quiet, grouped, and on a shared grid.
- Color carries meaning (progress, gain, loss, warning), not decoration, and it is used. A card of all-same-color text fails.
- Spacing is even. Labels sit the same distance from their fields, and fields in one row share a baseline.
- Cards side by side are the same height. Large empty areas beside a tall card fail.
- It matches the rest of Haus: the same card headers, kickers, buttons, chips, and switch styles as other pages. No one-off styling.
- A long form is broken into steps or sections with clear headings, with the less-used parts collapsed.

## Using it

- Every number box visibly changes something once you press Enter or leave it, and nothing changes mid-typing. No separate apply button. If an input only matters once another is filled, the page says so beside it.
- The answer to "what should I do next?" is on screen: a next step, a warning, or a clear "you're on track".
- Typing odd values (blank, 0, negative, huge, "7%", "$1,000") gives a sensible result or a short inline message, never NaN, a jump, or a silent reset.
- Buttons look and act like buttons: hand cursor, a clear label, and only the button itself is clickable.
- Toggles say what they switch, and switching one visibly changes the page.

## Sizes and states

- It holds up at 2560×1440, 1920×1080, and 412 wide. On a phone nothing scrolls sideways and nothing is cramped.
- The empty household (a brand-new user, no birthdates) and extreme numbers look intentional, as well as the full household.

## Words

- Labels are short and plain, and sentences end with punctuation.
- Help text says what to do, in one sentence.
