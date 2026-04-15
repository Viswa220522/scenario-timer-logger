# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Scenario Timer Logger — a static, single-page, mobile-first web app for manual test logging with a live countdown, sequence of scenarios, inline-edit history, and copy-ready export. No build step, no framework, no dependencies. Three files: `index.html`, `style.css`, `app.js`.

## Run locally

```bash
python -m http.server 4173
```

Then open `http://localhost:4173`. Any static server works — the app is pure HTML/CSS/vanilla JS served as-is.

There is no build, no bundler, no test suite, no linter configured. "Testing" means loading the page and exercising the flows.

## Architecture

The entire runtime is driven by a single module in `app.js` that follows a tiny Elm-ish loop:

1. **Single `state` object** (top of `app.js`) — holds `sequence`, `activeSequenceIndex`, `logs`, `running`, `undoStack`, editing drafts, etc. Every mutation goes through a named function (e.g. `startScenario`, `adjustTimer`, `deleteLog`) that ends with `renderAll()` (or a targeted `renderX()`) and `persistState()`.
2. **`els` cache** — all DOM nodes are looked up once at module load into `els`. When adding a new element, it **must** exist in `index.html` before being referenced here, or `bindEvents()` throws and the entire app dies silently on load (there are no listeners bound beyond the crash point). This previously broke the app when a `resetTimerBtn` id was referenced but not present in markup.
3. **Rendering is full-innerHTML replacement** inside `renderSequence()` and `renderHistory()`. Consequence: **never call `renderSequence()` / `renderHistory()` from inside an `input` handler for a field inside those containers** — it destroys focus and cursor position mid-typing. The existing `handleSequenceListInput` deliberately calls only `renderActiveScenarioLabel()` / `renderTimer()` for this reason. The same applies to inline log edits (`handleLogListInput` only writes to `state.editDraft`, never re-renders).
4. **Ticker loop** — `startTicker()` runs `renderTimer()` every 250 ms. `renderTimer()` only touches the timer display, status pill, and Start/End button disabled state; it must **not** write back to any user-editable input (that pattern previously broke the custom-timer fields mid-typing — anything you add that updates focused inputs from the ticker is a bug).
5. **Persistence** — `persistState()` / `restoreState()` serialize the relevant slices of `state` to `localStorage` under `STORAGE_KEY` (currently `rayiot-logger-v6`). If you change the shape of persisted state in a breaking way, **bump the version suffix** so old saved state is ignored instead of corrupting the new shape. Sequence rows are normalized through `normalizeSequenceRow` on restore so older shapes (missing `scenarioPreset`/`completed`) upgrade cleanly. On restore, an active `running` object whose `endsAt` is in the past triggers the alert sound automatically (timer survives page refresh mid-run).
6. **Undo** — destructive actions (`deleteLog`, `clearLogs`, sequence row removal) push a snapshot onto `state.undoStack` via `pushUndoAction` before mutating. `MAX_UNDO_LEVELS` caps the stack. `undoLastAction` restores the snapshot and relies on per-action `type` to decide which fields to copy back — if you add a new undoable action, extend the `if (action.type === ...)` chain in `undoLastAction`.
7. **Hold-to-delete** — `beginHoldDelete` / `clearHoldDelete` use `pointerdown` + `setTimeout(HOLD_DELETE_MS)` plus a `requestAnimationFrame` loop that writes progress into `--hold-progress` on the button (consumed by a CSS `::after` scale transform). It must be cancelled on `pointerup`, `pointerleave`, and `pointercancel` — all three are wired in `bindEvents()`.
8. **Double-tap End** — two `click`s on the End button within `END_DOUBLE_TAP_MS` (500 ms) commit the scenario. Tracked via `state.lastEndTapAt`. A `setTimeout` resets the hint if the second tap never arrives.

## Export format (load-bearing)

Copied logs must match exactly:

```
Person – Standing (7 mins) → 16:36:00 - 16:43:00
```

Note the **en-dash** (`–`, U+2013) between prefix and scenario and the **arrow** (`→`) before the time range. These are hardcoded in `buildScenarioName` and `copyLogs`. Downstream consumers rely on this layout, so don't "fix" the punctuation.

## Gotchas when editing

- `renderTimer()` is called from a 250 ms interval. Anything expensive placed there compounds quickly.
- `state.activeSequenceIndex` can be `-1` (no selection), `>= sequence.length` (sequence empty or all done), or a valid index. Every consumer needs to handle all three.
- `startBtn.disabled` gates on `state.running || invalid activeSequenceIndex`. Keep both conditions when touching that line.
- Scenario rows carry `{ prefix, scenarioPreset, scenario, durationMinutes, completed }`. When `scenarioPreset !== "Custom"`, `scenario` is mirrored from the preset; when it is `"Custom"`, the free-text input drives `scenario`. `buildScenarioName` reads from the preset first and falls back to the text, so always go through it for display.
- Destructive UI (Clear Logs, seq row remove) uses a two-step in-place confirm (`state.pendingClear` / `state.pendingRemoveIndex`) with a `CONFIRM_WINDOW_MS` timeout. Do **not** reintroduce `window.confirm` — it violates the "no popups anywhere" rule.
- Undo snapshots must include every piece of state the action could mutate, including `state.running`. `undoLastAction` restores whatever keys are present on the snapshot object, so a missing key = silent state divergence.
