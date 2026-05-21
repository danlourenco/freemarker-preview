# Mobile-client fidelity: iOS Mail vs Gmail mobile in preview

**Status:** approved
**Date:** 2026-05-21
**Author:** Dan Lourenco (with Claude)
**Closes:** #44
**Related:** #24 (umbrella PRD for client simulation), 9f0ce49 (prior abandoned attempt — informs design)

## Motivation

The dev preview today shows truncation at the 375px breakpoint when the email is wider than 375px. That matches **no real mobile mail client** for non-responsive emails — every dominant client either auto-zooms to fit or has different breakpoint behavior. The current 375 preview answers "what does this look like in Gmail mobile with viewport meta set + responsive CSS firing?" — a narrow case. The user typically wants the broader question: "what does this look like in Apple Mail iOS?" — the most common iOS client, which auto-zooms.

The user filed #44 specifically about this gap. A prior attempt at auto-detection (commit 9f0ce49, "Remove applyPhoneZoom — wasn't working reliably") was reverted because the heuristic was unpredictable — the rendering changed based on template content without the user explicitly asking. The fix: make client behavior an explicit, user-picked mode.

## Non-goals

- Auto-link detection, image blocking, 102KB clip warning, Outlook CSS stripping, Gmail forced-dark inversion, tap-target warnings (all separate sub-features under #24 umbrella PRD).
- Per-project default mode in the user registry (defer to a future enhancement).
- Multi-mode side-by-side comparison.
- Auto-detecting a starting mode based on template content (explicitly rejected per 9f0ce49 — "Doing it as an always-on autodetect was the wrong shape").
- Custom-width input (existing input is dropped — it's unused and the named modes cover the legitimate widths).

## Design

### §1 — Header picker

Replace the four width controls (`375` / `600` / `Full` / custom px input) with three mode buttons:

```text
[iOS Mail]  [Gmail mobile]  [Full]
```

Mutually exclusive. Selected button uses the existing `aria-pressed="true"` pattern. No custom-width input.

### §2 — Mode semantics

| Mode | Container width | iframe render | Chrome |
| --- | --- | --- | --- |
| **iOS Mail** | 375px | iframe internals at 980px CSS width + `transform: scale(0.382653)` (`375 / 980`); `transform-origin: top left`; outer container clips overflow | iOS phone chrome on |
| **Gmail mobile** | 375px | 1:1 (iframe.style.width = `100%`, no transform) | no chrome |
| **Full** | 100% of container | 1:1 | no chrome |

Originally the picker also had a **Desktop** mode (600px container, 1:1, no chrome). Dropped 2026-05-21 because typical email containers use either fixed-600 or `max-width: 600px`, which cap themselves at 600 in any container ≥ 600 wide — meaning Full and Desktop produce visually identical output for the dominant case. Full subsumes Desktop with no loss.

**Why 980px for iOS Mail:** Mobile browsers render pages at a 980px virtual viewport and shrink to fit when no viewport meta tag is set ([MDN: `<meta name="viewport">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport), reaffirmed in MDN's April 2026 revision). Apple Mail uses WebKit and inherits this default — the introduction of `<meta name="x-apple-disable-message-reformatting">` in iOS 10 ([HTeuMeuLeu](https://www.hteumeuleu.com/2016/what-you-need-to-know-about-apple-mail-in-ios-10/)) is itself evidence that auto-scaling is the default behavior to opt out of. The simulation always uses 980px regardless of viewport meta in the template, because that's the "worst case" rendering the user is most likely debugging — a non-responsive marketing email landing in iOS Mail.

**Why chrome only in iOS Mail mode:** The chrome's visual styling (subject row, sender avatar, iOS status bar) is iOS Mail-specific. Showing it in Gmail mobile mode would be a small visual lie — Gmail's UI looks materially different. The chrome-on-375 binding from today is rewritten: chrome ties to mode, not width.

### §3 — Default mode

**iOS Mail.** First-time users (no `?mode=` in URL, no saved state) land in iOS Mail mode. Existing users will see a different preview on first open after upgrading, which is the intended outcome — they were getting a misleading preview before.

### §4 — URL state

Replace the `?width=` query param with `?mode=`. Valid values: `ios-mail`, `gmail-mobile`, `full`.

**Legacy URL migration** on shell bootstrap: if `?width=` is present and `?mode=` is absent, translate and replace:

| Legacy `?width=` | New `?mode=` |
| --- | --- |
| `375` | `gmail-mobile` |
| `600` | `full` |
| `full` | `full` |
| any numeric value | `gmail-mobile` (closest behavior; arbitrary widths are no longer supported) |

After migration, rewrite the URL with `history.replaceState` so subsequent share/bookmark uses the new param.

### §5 — Auto-detection

**None.** No parsing the template for `<meta viewport>` to choose a mode. The user explicitly picks; the picker is sticky in URL state.

## Implementation surface

### Files modified

- `src/server/public/index.html` — replace three width buttons + custom-width input with three mode buttons (iOS Mail, Gmail mobile, Full).
- `src/server/public/shell.js` — replace `applyWidth()` with `applyMode()`. Switch on `?mode=` to set container CSS width, set iframe transform (only in iOS Mail mode), slot iframe into chrome container or plain container. Includes the legacy `?width=` → `?mode=` migration.
- `src/server/public/shell.css` — add styles for the iOS Mail mode's 980-then-scale layout. A new outer wrapper around the iframe-container with `overflow: hidden` clips the scaled-down content.
- `src/vscode/preview-panel.ts` — same picker HTML + same `applyMode` logic in the webview script string. The two surfaces (web shell and VS Code webview) share the same picker behavior.

No new modules. No `src/core/` changes — this is purely a UI-shell concern.

### Code shape for `applyMode`

The function is pure-ish: input is the URL `?mode=` value (string), output is a series of DOM mutations (set iframe transform, set container width CSS var, set the `data-mode` attribute that the chrome-display CSS keys off of). Factor the mode → config struct conversion as a separately-testable pure function:

```js
function modeConfig(mode) {
  switch (mode) {
    case 'ios-mail':     return { containerWidth: '375px', iframeWidth: '980px', scale: 375 / 980, chrome: true };
    case 'gmail-mobile': return { containerWidth: '375px', iframeWidth: '100%', scale: 1, chrome: false };
    case 'full':         return { containerWidth: '100%', iframeWidth: '100%', scale: 1, chrome: false };
    default:             return modeConfig('ios-mail');
  }
}
```

`applyMode(mode)` calls `modeConfig`, then applies each field to the DOM. Tests assert on `modeConfig`'s return value, no DOM needed.

## Migration / breaking changes

- The CLI's `dev` server URL state changes (`?width=` → `?mode=`). Legacy URLs auto-migrate on load with `history.replaceState`, so bookmarks survive but get rewritten silently on first visit.
- Anyone who scripted against `?width=` query strings will need to update. Likely nobody does this.
- Default rendering at narrow viewport changes (current "raw 375" → iOS Mail auto-zoom). Most users will see different output on first open. The Gmail mobile mode preserves the prior behavior for users who explicitly want it.
- Custom-width input is gone. The four named modes are the entire surface.
- Bump version per Conventional Commits: this is a `feat!` (breaking change for users with `?width=` URL conventions or custom widths). Drives a minor version bump (0.1.0 → 0.2.0) via changelogen.

## Testing approach

- **Unit test for `modeConfig`** — assert on the returned config struct for each of the three modes plus the unknown-mode fallback.
- **Unit test for the legacy URL migrator** — given URL inputs (`?width=375`, `?width=600`, `?width=full`, `?width=420`, `?mode=ios-mail` + `?width=375`, no params), assert on the expected migrated URL.
- **DOM-level smoke** — a single JSDOM-based test that calls `applyMode('ios-mail')` and asserts the iframe got the expected `transform` inline style and the container the expected width.
- **Manual smoke** — load the dev server with each of the three modes selected; verify visually that:
  - iOS Mail mode shows the phone chrome around an iframe whose content is scaled-down
  - Gmail mobile shows the same 375 container with no chrome and unscaled content
  - Full fills the available container width
  - The legacy `?width=375` URL redirects to `?mode=gmail-mobile`; `?width=600` redirects to `?mode=full`

VS Code panel testing: the preview-panel.test.ts suite already covers shell rendering; extend it to assert that the three mode buttons render and that clicking each posts the right message-or-state.

## Commit sequence

| # | Type | Subject |
| --- | --- | --- |
| 1 | `feat!` | `(server,vscode)` add mode picker (iOS Mail / Gmail mobile / Full) |
| 2 | `feat` | `(server)` iOS Mail mode 980px virtual viewport + scale-to-fit |
| 3 | `chore` | `(server)` drop custom-width input |
| 4 | `feat` | `(server)` legacy `?width=` → `?mode=` URL migrator |
| 5 | `test` | unit tests for modeConfig + URL migrator |
| 6 | `docs` | README: document the three modes and viewport simulation |
| 7 | — | `npm run release` (bumps 0.1.0 → 0.2.0) |

(Granularity may compress in practice — e.g., commits 1 and 2 could land together if they're easier reviewed as one unit. Plan time will refine.)

## Sources

- [`<meta name="viewport">` — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport) — 980px virtual viewport for mobile browsers when no viewport meta is set; last modified Apr 22, 2026. **Primary citation.**
- [What you need to know about Apple Mail in iOS 10 — HTeuMeuLeu](https://www.hteumeuleu.com/2016/what-you-need-to-know-about-apple-mail-in-ios-10/) — `x-apple-disable-message-reformatting` introduction, auto-scaling default behavior
- [Apple Mail in iOS 10 incorrectly scales email — hteumeuleu/email-bugs#27](https://github.com/hteumeuleu/email-bugs/issues/27) — CSS bug edge cases
- [Can I email — Apple Mail](https://www.caniemail.com/clients/apple-mail/) — general support matrix
- [Configuring the Viewport — Apple Developer (archived)](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/UsingtheViewport/UsingtheViewport.html) — original Apple documentation for the 980px default. Archived (Apple hasn't migrated this doc to their modern docs system), but the behavior described still persists in WebKit per MDN.
