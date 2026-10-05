# Volleyball rally scouting implementation

> For agentic workers: execute the approved user plan using test-driven-development and dispatching-parallel-agents with disjoint ownership.

**Goal:** Record unlimited volleyball rally actions, score terminal outcomes, and connect court markers, detailed history, video timing, and WGP12S-compatible controls.

**Architecture:** Keep Zustand/Dexie and semantic controller intents. Persist actions, rally state and score atomically. Native video and YouTube share a playback adapter, exposed through an event timing provider to avoid coupling persistence to the player.

**Tech stack:** Existing React/TypeScript/Vite, Dexie, Zustand, Vitest, browser Gamepad/Web Audio/YouTube iframe APIs.

## Tasks and interfaces

- [x] Rally engine: schema v4, Rally and VideoSource tables; ScoutingEvent rallyId/rallyNumber/actionIndex/videoSourceId; store allEvents/rallies/currentRallyId, clearCurrentEvent/retrySave and setVideoTimingProvider. Serialize actions; Pass keeps rally open, ±1 closes and scores. Preserve legacy data, rebuild new rally topology after edits, persist drafts, and recover failure/reload.
- [x] Video/audio: ScoutVideoPanel(sessionId), AudioUnlockButton, videoPlayback.getEventTiming/togglePlayback/seekToEvent/pause; persist metadata/handles per session; recover blocked embeds and missing files. Audio unlock, volume and confirmation after successful commits.
- [x] Controller/settings: WGP12S-compatible ABXY layout and physical calibration separate from gameplayBindings. LT clear, RT Pass, View play/pause; persisted volume, wheel size, shortcuts and deadzone controls.
- [x] Scout UI: six-zone rectangular selector, court preview/markers, complete current rally and paged detailed history. Wire provider and intents, confirm incomplete rally at set/match end, unlock sound on start. Enlarge radial menus and responsive video/court workspace.
- [x] Review/export/locales: show Pass, rally order and video timestamps; authoritative derived point impact for new events; EN/TH strings; remove other-sport roadmap copy.
- [x] Integration QA: meaningful IndexedDB-compatible tests for 100+ actions, rapid inputs, failure/retry, undo/edit/delete, migration, reload, six-zone selection and timing. Run full tests/lint/build/diff check and inspect 943×892, desktop, mobile and landscape. The live browser had no connected controller, so hardware QA was not available.

## Accepted behavior

Pass retains the selected team. LB/RB switches teams and clears player selection. +1 awards the action team, -1 the opponent for any skill. Court map displays the selected team's six zones; positions are zone annotations rather than measured coordinates. Each action captures the video timestamp when its first action field is selected. A failed video source never prevents action recording. Files stay on the user's device; reload may require permission or reselection.
