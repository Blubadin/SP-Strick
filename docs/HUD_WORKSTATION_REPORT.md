# SP Stick HUD / Video / Gamepad workstation report

Implemented on `codex/hud-video-workstation`, based on `09fe758`.
Preview: http://localhost:5174/scout

## A. Files changed

| Files | Change |
| --- | --- |
| `src/core/controller/ControllerIntent.ts`, `GameplayBindings.ts` | Semantic video modifier intents and VIEW guidance. |
| `src/core/controller/GamepadPoller.ts`, `GamepadPoller.test.ts` | Context eligibility, tap/chord handling, calibrated mappings, release/disconnect cleanup and regressions. |
| `src/core/video/VideoPlayback.ts`, `VideoPlayback.test.ts` | Shared transport, duration, time, speed and subscriptions; event timing/source activation retained. |
| `src/core/video/videoAdapters.ts`, `videoAdapters.test.ts` | Native/YouTube timing, playing state and playback-rate capabilities. |
| `src/features/video/HudVideoControls.tsx`, `.module.css`, `.test.tsx` | Custom timeline, pointer capture, keyboard scrubbing, transport, speed and seek-error feedback. |
| `src/features/video/ScoutVideoPanel.tsx`, `.module.css`, `.test.tsx` | Compact source selection, overflow menu, custom controls, focused video surface and source restoration. |
| `src/features/radial/RadialMenu.tsx`, `.module.css`, `.test.tsx` | Responsive glass wheel, small hub, subtle dimming, bottom-right placement, mobile viewport anchoring and reduced motion. |
| `src/features/scout/LiveScout.tsx`, `.module.css`, `LiveScout.focus.test.tsx` | Focus mode, active score/team/player/action overlays, idle hiding, input reveal and layout regressions. |
| `src/features/scout/LiveScoutInput.ts`, `LiveScout.test.ts` | VIDEO_CONTROL routing and modal/scouting isolation. |
| `src/pages/ScoutPage.module.css` | Disconnect notice stays clear of focused controls and active wheels. |
| `src/i18n/en.json`, `th.json` | Focus and video-control labels, accessibility text and errors. |
| `docs/HUD_WORKSTATION_REPORT.md` | This report. |

## B. Default controller mapping

Physical calibration remains separate from semantic actions. A customized VIEW gameplay binding keeps its configured action.

| Control | Live scouting |
| --- | --- |
| A / X / B / Y held | Skill / zone grid / result / team-player selection |
| Left stick + release original opener | Select and confirm; return to center to cancel |
| LB / RB | Team A / Team B |
| D-pad up / right / down / left | +1 / Pass / -1 / Undo |
| LT / RT | Clear draft / Pass |
| VIEW short tap under 250 ms, no chord | Play/pause once after release |
| VIEW held | Enter video controls |
| Menu | Match menu; leave Focus first |
| L3 / R3 | Quick edit / bookmark |

| While VIEW is held | Video action |
| --- | --- |
| D-pad left / right | Seek -3 / +3 seconds |
| X / B | Seek -1 / +1 second |
| A | Play/pause |
| Y | Cycle 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2x |
| Release VIEW | Return to scouting without an extra toggle after a chord |

Video commands are isolated from scouting and modal input. Modifier eligibility is disabled when LiveScout unmounts; disabling it clears any active modifier.

## C. Video behavior

- Shared playback service drives native video and YouTube, precise time/duration, timeline click/drag/keyboard seek, +/-1 and +/-3 second buttons, and speed selection.
- Loaded source controls collapse to source information and an overflow menu. Local-file restoration and session-scoped YouTube selection remain supported.
- Focus makes video primary and keeps active score, team/player, current action, exit and scouting feedback visible. Escape or the match-menu action exits Focus. It also works without a video.
- Noncritical chrome hides after three seconds of playback inactivity. Pointer, touch, keyboard, buttons and stick movement reveal it and restart the timer.
- Failed transport seeks show feedback; controller seek failures do not interrupt scouting.

## D. Radial behavior

| Viewport | Normal / Large / Extra large diameter |
| --- | --- |
| Desktop | 280 / 300 / 320 px |
| Tablet | 250 / 265 / 280 px |
| Small screen | 210 / 225 / 240 px |

The wheel uses a 0.12 backdrop, translucent ring and bottom-right placement. Mobile wheels stay fixed inside the viewport when the workstation scrolls. Hold-open, angular hysteresis, haptics, neutral cancel, release-to-confirm and click/touch selection remain in the existing input flow. Zone selection remains a six-cell grid.

## E. Validation

**PASS**

- `npm test`: 26 test files, 188 tests, zero failures on the final source changes.
- `npm run lint`: no errors.
- `npm run build`: TypeScript and production Vite/PWA build succeeded.
- `git diff --check`: clean.
- Focus attribution, analog reveal, modifier lifecycle and rejected-seek regressions were observed failing before their fixes and passing afterward.
- Final read-only code review: no remaining blockers.
- Browser checks at 1920x1080, 1366x768, 943x892, 390x844 and 844x390. Mobile wheel measured 225 px and fully inside the viewport. Checked viewports had no horizontal overflow.
- Browser workflow: Pass saved and continued Rally 1 at 0-0; Team B Block +1 completed the rally at 0-1; Undo returned the score to 0-0 and reopened the rally.
- Actual YouTube demo playback, pause, speed, keyboard seek and pointer timeline dragging worked. Dragging to 25% changed time to approximately 05:35.6 of 22:24.0.
- Focus idle hiding, keyboard reveal, clear score/action overlays and working exit were observed. No error-level browser console messages were captured during the final smoke check.

**FAIL**

- None in the executed checks.

**NOT TESTED / LIMITATIONS**

- Physical REVOLVER III/WGP12S hardware, physical haptics and audible sound output were unavailable for verification. Controller and audio behavior have automated coverage.
- Native local-file selection could not be completed through the current browser automation's OS picker. The standard hidden file-input path also could not be driven. Actual local playback/permission recovery remains a manual acceptance check; adapter and file-source behavior have automated coverage.
- A restored local source without permission showed an actionable retry/reselect message and left scouting usable.
- Browser handling of a YouTube video that forbids embedding was not exercised; the actual demo used for the smoke check allowed embedding.
- Browser fullscreen was optional in the spec and was not added.

## F. Remaining risks

Vite reports the existing main-chunk size advisory: the final minified JavaScript chunk is about 715 kB (214 kB gzip). Hardware and native-picker acceptance checks listed above remain necessary. The preview contains a public YouTube demo source and a small QA rally for inspection.
