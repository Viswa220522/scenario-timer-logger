# Scenario Timer Logger

Mobile-first single-page app for fast manual test logging with a live countdown timer, dynamic duration changes, inline timestamp editing, undo for destructive actions, and strict copy-ready export formatting.

## Features

- single-tap `Start`
- double-tap `End` within 500ms
- live timer adjustments with `-1m`, `-10s`, `+10s`, `+1m`
- custom inline timer input for minutes and seconds
- total planned duration display that updates as the timer changes
- prefix and scenario selection with saved custom entries
- notes with optional current-time insertion
- hold-to-delete log entries for 500ms
- undo for delete and clear actions
- inline editing for start and end times
- localStorage persistence for logs, notes, timer state, custom options, and undo history

## Files

- `index.html` - app structure
- `style.css` - mobile-first UI and interaction styling
- `app.js` - timer, logging, persistence, undo, and editing logic

## How to Use

1. Open `index.html` in a browser or serve the folder locally.
2. Choose a prefix like `Person` or `No Person`, or add a custom prefix.
3. Type a scenario or tap a quick scenario chip.
4. Set the timer with the adjustment buttons or open `Custom` and enter minutes and seconds.
5. Tap `Start` to capture the start timestamp and begin countdown.
6. Adjust time while running if needed; the remaining timer and total duration update immediately.
7. Double-tap `End` within 500ms to save manually, or let the timer end automatically.
8. Edit timestamps inline from `Scenario History` if needed.
9. Hold `Hold Delete` for 500ms to delete an entry safely.
10. Use `UNDO` after delete or clear to restore the previous state.
11. Tap `Copy Logs` to copy export-ready output.

## Export Format

Copied logs use this exact format:

```text
Person – Standing (7 mins) → 16:36:00 - 16:43:00
```

Stored raw entries use this internal format:

```text
scenario_name | start_time | end_time | duration_minutes
```

## Persistence

The app stores the following in browser `localStorage`:

- notes
- scenario history
- current timer state
- total planned duration
- custom prefixes
- custom scenarios
- undo state

If the page refreshes during an active run, the timer restores from the saved end timestamp and continues automatically.

## Run Locally

```bash
python -m http.server 4173
```

Then open `http://localhost:4173` in a browser.
