const STORAGE_KEY = "rayiot-logger-v5";
const DEFAULT_DURATION_SECONDS = 5 * 60;
const END_DOUBLE_TAP_MS = 500;
const HOLD_DELETE_MS = 500;
const MAX_UNDO_LEVELS = 3;
const TOAST_DURATION_MS = 10000;

const state = {
  sequence: [],
  activeSequenceIndex: -1,
  notes: "",
  logs: [],
  baseDurationSeconds: DEFAULT_DURATION_SECONDS,
  running: null,
  soundEnabled: true,
  historyCollapsed: false,
  editingLogId: null,
  editDraft: { startTime: "", endTime: "" },
  lastEndTapAt: 0,
  undoStack: [],
  toast: null
};

const els = {
  liveClock: document.getElementById("liveClock"),
  activeScenarioLabel: document.getElementById("activeScenarioLabel"),
  timerStatus: document.getElementById("timerStatus"),
  timerDisplay: document.getElementById("timerDisplay"),
  totalDurationDisplay: document.getElementById("totalDurationDisplay"),
  startBtn: document.getElementById("startBtn"),
  endBtn: document.getElementById("endBtn"),
  doubleTapHint: document.getElementById("doubleTapHint"),
  soundToggle: document.getElementById("soundToggle"),
  resetTimerBtn: document.getElementById("resetTimerBtn"),
  addSequenceRowBtn: document.getElementById("addSequenceRowBtn"),
  sequenceList: document.getElementById("sequenceList"),
  sequenceHint: document.getElementById("sequenceHint"),
  notesInput: document.getElementById("notesInput"),
  insertTimeBtn: document.getElementById("insertTimeBtn"),
  copyLogsBtn: document.getElementById("copyLogsBtn"),
  clearLogsBtn: document.getElementById("clearLogsBtn"),
  copyStatus: document.getElementById("copyStatus"),
  historyToggleBtn: document.getElementById("historyToggleBtn"),
  historyCount: document.getElementById("historyCount"),
  historyBody: document.getElementById("historyBody"),
  logList: document.getElementById("logList"),
  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toastMessage"),
  toastUndoBtn: document.getElementById("toastUndoBtn"),
  adjustButtons: Array.from(document.querySelectorAll("[data-adjust]"))
};

let ticker = null;
let clockTicker = null;
let toastTimer = null;
let holdDelete = null;
let alertAudio = null;

init();

function init() {
  restoreState();
  bindEvents();
  renderAll();
  startTicker();
  startClockTicker();
}

function bindEvents() {
  els.startBtn.addEventListener("click", startScenario);
  els.endBtn.addEventListener("click", handleEndTap);

  els.soundToggle.addEventListener("change", () => {
    state.soundEnabled = els.soundToggle.checked;
    persistState();
  });

  els.adjustButtons.forEach((button) => {
    button.addEventListener("click", () => adjustTimer(Number(button.dataset.adjust)));
  });

  els.resetTimerBtn.addEventListener("click", resetTimer);

  els.addSequenceRowBtn.addEventListener("click", addSequenceRow);
  els.sequenceList.addEventListener("click", handleSequenceListClick);
  els.sequenceList.addEventListener("input", handleSequenceListInput);

  els.notesInput.addEventListener("input", () => {
    state.notes = els.notesInput.value;
    persistState();
  });
  els.insertTimeBtn.addEventListener("click", insertCurrentTimeIntoNotes);

  els.copyLogsBtn.addEventListener("click", copyLogs);
  els.clearLogsBtn.addEventListener("click", clearLogs);
  els.historyToggleBtn.addEventListener("click", toggleHistory);
  els.toastUndoBtn.addEventListener("click", undoLastAction);

  els.logList.addEventListener("click", handleLogListClick);
  els.logList.addEventListener("input", handleLogListInput);
  els.logList.addEventListener("pointerdown", beginHoldDelete);
  els.logList.addEventListener("pointerup", clearHoldDelete);
  els.logList.addEventListener("pointerleave", clearHoldDelete);
  els.logList.addEventListener("pointercancel", clearHoldDelete);
}

function renderAll() {
  renderClock();
  renderTimer();
  renderSequence();
  renderNotes();
  renderHistory();
  renderToast();
}

function renderClock() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  els.liveClock.textContent = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function renderTimer() {
  const remainingSeconds = state.running
    ? Math.max(0, Math.ceil((state.running.endsAt - Date.now()) / 1000))
    : state.baseDurationSeconds;
  const totalSeconds = state.running
    ? state.running.totalDurationSeconds
    : state.baseDurationSeconds;

  const isOvertime = state.running && Date.now() > state.running.endsAt;

  els.timerDisplay.textContent = formatCountdown(remainingSeconds);
  els.timerDisplay.classList.toggle("overtime", isOvertime);
  els.totalDurationDisplay.textContent = formatMinutesLabel(totalSeconds);

  if (state.running) {
    els.timerStatus.textContent = isOvertime
      ? `Overtime – started ${formatTime(state.running.startedAt)}`
      : `Started ${formatTime(state.running.startedAt)}`;
    els.timerStatus.classList.toggle("status-overtime", isOvertime);
    els.timerStatus.classList.toggle("status-running", !isOvertime);
    els.timerStatus.classList.remove("status-ready");
  } else {
    els.timerStatus.textContent = "Ready";
    els.timerStatus.classList.remove("status-overtime", "status-running");
    els.timerStatus.classList.add("status-ready");
  }

  els.soundToggle.checked = state.soundEnabled;
  els.startBtn.disabled = state.activeSequenceIndex < 0 || state.activeSequenceIndex >= state.sequence.length;
  els.endBtn.disabled = !state.running;
}

function renderSequence() {
  if (state.sequence.length === 0) {
    els.sequenceList.innerHTML = '<p class="hint-text seq-empty-hint">No scenarios. Tap + Add Row to build your sequence.</p>';
    els.sequenceHint.textContent = "";
    renderActiveScenarioLabel();
    return;
  }

  els.sequenceList.innerHTML = state.sequence.map((row, index) => {
    const isActive = index === state.activeSequenceIndex;
    const statusClass = isActive ? "seq-active" : "";
    const prefixOptions = ["Person", "No Person", "Environment", "Custom"]
      .map(p => `<option value="${p}" ${row.prefix === p ? "selected" : ""}>${p}</option>`)
      .join("");

    return `
      <div class="seq-row ${statusClass}" data-seq-index="${index}">
        <div class="seq-controls">
          <button type="button" class="seq-btn" data-seq-up="${index}" title="Move up" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="seq-btn" data-seq-down="${index}" title="Move down" ${index === state.sequence.length - 1 ? "disabled" : ""}>↓</button>
        </div>
        <div class="seq-fields">
          <select class="text-input seq-prefix-input" data-seq-prefix-select="${index}">
            ${prefixOptions}
          </select>
          <input class="text-input seq-scenario-input" type="text" value="${escapeAttribute(row.scenario)}" data-seq-scenario="${index}" placeholder="Scenario name">
          <div class="seq-dur-row">
            <input class="text-input seq-dur-input" type="number" min="1" max="240" value="${row.durationMinutes}" data-seq-duration="${index}" placeholder="mins">
            <span class="seq-dur-label">mins</span>
          </div>
        </div>
        <div class="seq-actions">
          <button type="button" class="seq-activate-btn ${isActive ? "active" : ""}" data-seq-activate="${index}">
            ${isActive ? "▶ Active" : "▶ Set Active"}
          </button>
          <button type="button" class="seq-remove-btn" data-seq-remove="${index}" title="Remove">×</button>
        </div>
      </div>
    `;
  }).join("");

  if (state.activeSequenceIndex < 0) {
    els.sequenceHint.textContent = `Tap "Set Active" on a row to enable Start`;
  } else if (state.activeSequenceIndex >= state.sequence.length) {
    els.sequenceHint.textContent = "All scenarios complete.";
  } else {
    const activeRow = state.sequence[state.activeSequenceIndex];
    els.sequenceHint.textContent = `Active: ${buildScenarioName(activeRow)} (${activeRow.durationMinutes} mins) – Tap Start to begin`;
  }

  renderActiveScenarioLabel();
}

function renderActiveScenarioLabel() {
  if (state.activeSequenceIndex >= 0 && state.activeSequenceIndex < state.sequence.length) {
    const row = state.sequence[state.activeSequenceIndex];
    els.activeScenarioLabel.textContent = buildScenarioName(row);
  } else {
    els.activeScenarioLabel.textContent = "No scenario selected";
  }
}

function renderNotes() {
  if (els.notesInput.value !== state.notes) {
    els.notesInput.value = state.notes;
  }
}

function renderHistory() {
  els.historyCount.textContent = String(state.logs.length);
  els.historyToggleBtn.setAttribute("aria-expanded", String(!state.historyCollapsed));
  els.historyBody.classList.toggle("collapsed", state.historyCollapsed);

  if (state.logs.length === 0) {
    els.logList.innerHTML = '<div class="log-item log-empty"><p class="log-title">No scenarios logged yet.</p></div>';
    return;
  }

  els.logList.innerHTML = state.logs.map((log) => {
    const isEditing = state.editingLogId === log.id;
    return `
      <article class="log-item" data-log-id="${log.id}">
        <p class="log-title">${escapeHtml(log.scenarioName)} (${log.durationMinutes} mins)</p>
        ${isEditing ? `
          <div class="inline-editor">
            <div class="editor-row">
              <input class="inline-time-input" type="text" value="${escapeAttribute(state.editDraft.startTime)}" data-edit-start="${log.id}" inputmode="numeric" placeholder="HH:MM:SS">
              <span class="log-arrow">→</span>
              <input class="inline-time-input" type="text" value="${escapeAttribute(state.editDraft.endTime)}" data-edit-end="${log.id}" inputmode="numeric" placeholder="HH:MM:SS">
              <button class="save-inline" type="button" data-save-log="${log.id}">✔</button>
            </div>
            <p class="hint-text">Format: HH:MM:SS</p>
          </div>
        ` : `
          <div class="log-times">
            <button class="text-button mono-time" type="button" data-begin-edit="${log.id}">${escapeHtml(log.startTime)}</button>
            <span class="log-arrow">→</span>
            <button class="text-button mono-time" type="button" data-begin-edit="${log.id}">${escapeHtml(log.endTime)}</button>
          </div>
        `}
        <div class="entry-actions">
          <button class="text-button" type="button" data-begin-edit="${log.id}">Edit times</button>
          <button class="delete-hold" type="button" data-delete-log="${log.id}">Hold to delete</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderToast() {
  if (!state.toast) {
    els.toast.classList.add("hidden");
    els.toast.removeAttribute("aria-live");
    return;
  }
  els.toast.classList.remove("hidden");
  els.toast.setAttribute("aria-live", "polite");
  els.toastMessage.textContent = state.toast.message;
}

function startScenario() {
  if (state.running || state.activeSequenceIndex < 0 || state.activeSequenceIndex >= state.sequence.length) {
    return;
  }

  const row = state.sequence[state.activeSequenceIndex];
  const durationSeconds = Math.max(10, (row.durationMinutes || 5) * 60);
  state.baseDurationSeconds = durationSeconds;

  const startedAt = Date.now();
  state.running = {
    scenarioName: buildScenarioName(row),
    sequenceIndex: state.activeSequenceIndex,
    startedAt,
    endsAt: startedAt + (durationSeconds * 1000),
    totalDurationSeconds: durationSeconds
  };

  els.copyStatus.textContent = "Scenario running.";
  renderAll();
  persistState();
}

function handleEndTap() {
  if (!state.running) {
    return;
  }

  const now = Date.now();
  if (now - state.lastEndTapAt <= END_DOUBLE_TAP_MS) {
    state.lastEndTapAt = 0;
    endScenario();
    return;
  }

  state.lastEndTapAt = now;
  els.doubleTapHint.textContent = "Tap End again now to confirm.";
  els.doubleTapHint.classList.add("hint-active");
  window.setTimeout(() => {
    if (state.lastEndTapAt !== 0 && Date.now() - state.lastEndTapAt >= END_DOUBLE_TAP_MS) {
      state.lastEndTapAt = 0;
      els.doubleTapHint.textContent = "End requires double-tap within 500ms.";
      els.doubleTapHint.classList.remove("hint-active");
    }
  }, END_DOUBLE_TAP_MS + 50);
}

function endScenario() {
  if (!state.running) {
    return;
  }

  stopAlertSound();

  const endedAt = Date.now();
  const durationMinutes = Math.max(1, Math.round(state.running.totalDurationSeconds / 60));
  const log = {
    id: crypto.randomUUID(),
    scenarioName: state.running.scenarioName,
    sequenceIndex: state.running.sequenceIndex,
    startTime: formatTime(state.running.startedAt),
    endTime: formatTime(endedAt),
    durationMinutes,
    startedAt: state.running.startedAt,
    endedAt
  };

  state.logs.push(log);
  state.running = null;
  state.lastEndTapAt = 0;
  els.doubleTapHint.textContent = "End requires double-tap within 500ms.";
  els.doubleTapHint.classList.remove("hint-active");
  els.copyStatus.textContent = "Scenario saved.";

  renderAll();
  persistState();
}

function adjustTimer(deltaSeconds) {
  if (state.running) {
    const now = Date.now();
    const remainingSeconds = Math.max(0, Math.ceil((state.running.endsAt - now) / 1000));
    const nextRemaining = Math.max(1, remainingSeconds + deltaSeconds);
    state.running.endsAt = now + (nextRemaining * 1000);
    state.running.totalDurationSeconds = Math.max(10, state.running.totalDurationSeconds + deltaSeconds);
    state.baseDurationSeconds = state.running.totalDurationSeconds;
  } else {
    state.baseDurationSeconds = Math.max(10, state.baseDurationSeconds + deltaSeconds);
  }
  renderTimer();
  persistState();
}

function applyCustomTimer() {
  const minutes = clampNumber(Number(els.customMinutesInput.value), 0, 120);
  const seconds = clampNumber(Number(els.customSecondsInput.value), 0, 59);
  const total = Math.max(10, (minutes * 60) + seconds);

  if (state.running) {
    const now = Date.now();
    state.running.endsAt = now + (total * 1000);
    state.running.totalDurationSeconds = total;
  }
  state.baseDurationSeconds = total;
  els.customTimerPanel.classList.add("hidden");
  renderTimer();
  persistState();
}

function resetTimer() {
  if (state.activeSequenceIndex >= 0 && state.activeSequenceIndex < state.sequence.length) {
    state.baseDurationSeconds = state.sequence[state.activeSequenceIndex].durationMinutes * 60;
  } else {
    state.baseDurationSeconds = DEFAULT_DURATION_SECONDS;
  }
  renderTimer();
  persistState();
}

function addSequenceRow() {
  state.sequence.push({ prefix: "Person", scenario: "Walking", durationMinutes: 7 });
  renderSequence();
  renderTimer();
  persistState();
}

function handleSequenceListClick(event) {
  const removeIndex = event.target.dataset.seqRemove;
  if (removeIndex !== undefined) {
    const idx = Number(removeIndex);
    pushUndoAction({
      type: "seq-remove",
      sequence: structuredClone(state.sequence),
      activeSequenceIndex: state.activeSequenceIndex,
      notes: state.notes,
      logs: structuredClone(state.logs)
    });
    state.sequence.splice(idx, 1);
    if (state.activeSequenceIndex >= state.sequence.length) {
      state.activeSequenceIndex = state.sequence.length - 1;
    }
    if (state.activeSequenceIndex < 0) {
      state.activeSequenceIndex = -1;
    }
    renderSequence();
    renderTimer();
    persistState();
    return;
  }

  const activateIndex = event.target.dataset.seqActivate;
  if (activateIndex !== undefined) {
    const idx = Number(activateIndex);
    state.activeSequenceIndex = idx;
    state.baseDurationSeconds = state.sequence[idx].durationMinutes * 60;
    renderSequence();
    renderTimer();
    persistState();
    return;
  }

  const upIndex = event.target.dataset.seqUp;
  if (upIndex !== undefined) {
    const idx = Number(upIndex);
    if (idx > 0) {
      const temp = state.sequence[idx - 1];
      state.sequence[idx - 1] = state.sequence[idx];
      state.sequence[idx] = temp;
      if (state.activeSequenceIndex === idx) state.activeSequenceIndex = idx - 1;
      else if (state.activeSequenceIndex === idx - 1) state.activeSequenceIndex = idx;
    }
    renderSequence();
    persistState();
    return;
  }

  const downIndex = event.target.dataset.seqDown;
  if (downIndex !== undefined) {
    const idx = Number(downIndex);
    if (idx < state.sequence.length - 1) {
      const temp = state.sequence[idx + 1];
      state.sequence[idx + 1] = state.sequence[idx];
      state.sequence[idx] = temp;
      if (state.activeSequenceIndex === idx) state.activeSequenceIndex = idx + 1;
      else if (state.activeSequenceIndex === idx + 1) state.activeSequenceIndex = idx;
    }
    renderSequence();
    persistState();
    return;
  }
}

function handleSequenceListInput(event) {
  const prefixIndex = event.target.dataset.seqPrefixSelect;
  if (prefixIndex !== undefined) {
    state.sequence[Number(prefixIndex)].prefix = event.target.value;
    renderActiveScenarioLabel();
    persistState();
    return;
  }

  const scenarioIndex = event.target.dataset.seqScenario;
  if (scenarioIndex !== undefined) {
    state.sequence[Number(scenarioIndex)].scenario = event.target.value;
    renderActiveScenarioLabel();
    persistState();
    return;
  }

  const durationIndex = event.target.dataset.seqDuration;
  if (durationIndex !== undefined) {
    const mins = Math.max(1, Math.min(240, Number(event.target.value) || 1));
    state.sequence[Number(durationIndex)].durationMinutes = mins;
    if (state.activeSequenceIndex === Number(durationIndex) && !state.running) {
      state.baseDurationSeconds = mins * 60;
    }
    renderTimer();
    persistState();
  }
}

function insertCurrentTimeIntoNotes() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const prefix = state.notes && !state.notes.endsWith("\n") ? "\n" : "";
  state.notes += `${prefix}${time}`;
  renderNotes();
  persistState();
}

function toggleHistory() {
  state.historyCollapsed = !state.historyCollapsed;
  renderHistory();
  persistState();
}

function handleLogListClick(event) {
  const beginEditId = event.target.dataset.beginEdit;
  if (beginEditId) {
    const log = state.logs.find((e) => e.id === beginEditId);
    if (!log) return;
    state.editingLogId = log.id;
    state.editDraft = { startTime: log.startTime, endTime: log.endTime };
    renderHistory();
    return;
  }

  const saveLogId = event.target.dataset.saveLog;
  if (saveLogId) {
    saveInlineEdit(saveLogId);
  }
}

function handleLogListInput(event) {
  if (event.target.dataset.editStart) {
    state.editDraft.startTime = event.target.value.trim();
  }
  if (event.target.dataset.editEnd) {
    state.editDraft.endTime = event.target.value.trim();
  }
}

function beginHoldDelete(event) {
  const button = event.target.closest("[data-delete-log]");
  if (!button) return;

  clearHoldDelete();
  const logId = button.dataset.deleteLog;
  const startedAt = performance.now();

  holdDelete = {
    button,
    timer: window.setTimeout(() => {
      deleteLog(logId);
      clearHoldDelete();
    }, HOLD_DELETE_MS),
    raf: 0,
    startedAt
  };

  const animate = () => {
    if (!holdDelete || holdDelete.button !== button) return;
    const progress = Math.min((performance.now() - startedAt) / HOLD_DELETE_MS, 1);
    button.style.setProperty("--hold-progress", progress);
    holdDelete.raf = requestAnimationFrame(animate);
  };
  animate();
}

function clearHoldDelete() {
  if (!holdDelete) return;
  clearTimeout(holdDelete.timer);
  cancelAnimationFrame(holdDelete.raf);
  if (holdDelete.button) {
    holdDelete.button.style.setProperty("--hold-progress", 0);
  }
  holdDelete = null;
}

function deleteLog(logId) {
  const index = state.logs.findIndex((e) => e.id === logId);
  if (index === -1) return;

  pushUndoAction({
    type: "delete",
    logs: structuredClone(state.logs),
    sequence: structuredClone(state.sequence),
    activeSequenceIndex: state.activeSequenceIndex,
    notes: state.notes,
    baseDurationSeconds: state.baseDurationSeconds
  });

  state.logs.splice(index, 1);
  if (state.editingLogId === logId) state.editingLogId = null;
  showToast("Entry deleted");
  renderHistory();
  persistState();
}

function saveInlineEdit(logId) {
  if (!isValidTime(state.editDraft.startTime) || !isValidTime(state.editDraft.endTime)) {
    els.copyStatus.textContent = "Use HH:MM:SS format for time edits.";
    return;
  }

  const log = state.logs.find((e) => e.id === logId);
  if (!log) return;

  log.startTime = state.editDraft.startTime;
  log.endTime = state.editDraft.endTime;
  state.editingLogId = null;
  els.copyStatus.textContent = "Entry updated.";
  renderHistory();
  persistState();
}

async function copyLogs() {
  const output = state.logs
    .map((log) => `${log.scenarioName} (${log.durationMinutes} mins) → ${log.startTime} - ${log.endTime}`)
    .join("\n");

  try {
    await navigator.clipboard.writeText(output);
    els.copyStatus.textContent = `${state.logs.length} log${state.logs.length !== 1 ? "s" : ""} copied.`;
  } catch {
    els.copyStatus.textContent = "Clipboard blocked in this browser.";
  }
}

function clearLogs() {
  if (!window.confirm("Clear all logs? This can be undone.")) return;

  pushUndoAction({
    type: "clear",
    logs: structuredClone(state.logs),
    sequence: structuredClone(state.sequence),
    activeSequenceIndex: state.activeSequenceIndex,
    notes: state.notes,
    baseDurationSeconds: state.baseDurationSeconds
  });

  state.logs = [];
  state.editingLogId = null;
  els.copyStatus.textContent = "Logs cleared.";
  showToast("Logs cleared");
  renderHistory();
  persistState();
}

function pushUndoAction(action) {
  state.undoStack.unshift(action);
  state.undoStack = state.undoStack.slice(0, MAX_UNDO_LEVELS);
}

function undoLastAction() {
  const action = state.undoStack.shift();
  if (!action) {
    hideToast();
    return;
  }

  if (action.type === "delete" || action.type === "clear") {
    state.logs = structuredClone(action.logs);
    if (action.sequence) state.sequence = structuredClone(action.sequence);
    if (action.activeSequenceIndex !== undefined) state.activeSequenceIndex = action.activeSequenceIndex;
    if (action.notes !== undefined) state.notes = action.notes;
    if (action.baseDurationSeconds !== undefined) state.baseDurationSeconds = action.baseDurationSeconds;
  }

  if (action.type === "seq-remove") {
    state.sequence = structuredClone(action.sequence);
    state.activeSequenceIndex = action.activeSequenceIndex;
  }

  hideToast();
  els.copyStatus.textContent = "Undo applied.";
  renderAll();
  persistState();
}

function showToast(message) {
  state.toast = { message };
  renderToast();
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    hideToast();
    persistState();
  }, TOAST_DURATION_MS);
}

function hideToast() {
  clearTimeout(toastTimer);
  state.toast = null;
  renderToast();
}

function startTicker() {
  clearInterval(ticker);
  ticker = setInterval(() => {
    if (state.running) {
      const now = Date.now();
      if (now >= state.running.endsAt) {
        if (state.soundEnabled && !alertAudio) {
          startAlertSound();
        }
      }
    }
    renderTimer();
  }, 250);
}

function startClockTicker() {
  clearInterval(clockTicker);
  clockTicker = setInterval(renderClock, 1000);
}

function startAlertSound() {
  if (alertAudio) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playBeep = () => {
      if (!alertAudio) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.02);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
      alertAudio._loop = window.setTimeout(playBeep, 900);
    };
    alertAudio = { ctx, _loop: null, stop: () => { clearTimeout(alertAudio._loop); ctx.close(); alertAudio = null; } };
    playBeep();
  } catch {
    alertAudio = null;
  }
}

function stopAlertSound() {
  if (alertAudio) {
    alertAudio.stop();
    alertAudio = null;
  }
}

function buildScenarioName(row) {
  const prefix = (row.prefix || "").trim() || "Person";
  const scenario = (row.scenario || "").trim() || "Unnamed";
  return `${prefix} – ${scenario}`;
}

function persistState() {
  const data = {
    sequence: state.sequence,
    activeSequenceIndex: state.activeSequenceIndex,
    notes: state.notes,
    logs: state.logs,
    baseDurationSeconds: state.baseDurationSeconds,
    running: state.running,
    soundEnabled: state.soundEnabled,
    historyCollapsed: state.historyCollapsed,
    undoStack: state.undoStack,
    toast: state.toast
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function restoreState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const saved = JSON.parse(raw);
    state.sequence = Array.isArray(saved.sequence) ? saved.sequence : [];
    state.activeSequenceIndex = typeof saved.activeSequenceIndex === "number" ? saved.activeSequenceIndex : -1;
    state.notes = saved.notes || "";
    state.logs = Array.isArray(saved.logs) ? saved.logs : [];
    state.baseDurationSeconds = Number(saved.baseDurationSeconds) || DEFAULT_DURATION_SECONDS;
    state.running = saved.running || null;
    state.soundEnabled = saved.soundEnabled !== undefined ? Boolean(saved.soundEnabled) : true;
    state.historyCollapsed = Boolean(saved.historyCollapsed);
    state.undoStack = Array.isArray(saved.undoStack) ? saved.undoStack.slice(0, MAX_UNDO_LEVELS) : [];
    state.toast = saved.toast || null;

    if (state.running && Date.now() >= state.running.endsAt) {
      if (state.soundEnabled) {
        startAlertSound();
      }
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function formatCountdown(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatMinutesLabel(totalSeconds) {
  return `${String(Math.max(1, Math.round(totalSeconds / 60))).padStart(2, "0")} mins`;
}

function secondsToParts(totalSeconds) {
  return { minutes: Math.floor(totalSeconds / 60), seconds: totalSeconds % 60 };
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}