const STORAGE_KEY = "rayiot-logger-v6";
const DEFAULT_DURATION_SECONDS = 5 * 60;
const END_DOUBLE_TAP_MS = 500;
const HOLD_DELETE_MS = 500;
const HOLD_ACTIVATE_MS = 500;
const MAX_UNDO_LEVELS = 3;
const TOAST_DURATION_MS = 10000;
const CONFIRM_WINDOW_MS = 3000;

const SCENARIO_PRESETS = ["Walking", "Standing", "Sitting", "Running", "Idle", "Custom"];
const PREFIX_OPTIONS = ["Person", "No Person", "Environment", "Custom"];

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
  editDraft: { scenarioName: "", startTime: "", endTime: "" },
  lastEndTapAt: 0,
  undoStack: [],
  toast: null,
  pendingClear: false,
  pendingRemoveIndex: -1,
  timerMode: "sequence"
};

let pendingClearTimer = null;
let pendingRemoveTimer = null;

const els = {
  liveClock: document.getElementById("liveClock"),
  timerPanel: document.getElementById("timerPanel"),
  activeScenarioLabel: document.getElementById("activeScenarioLabel"),
  timerStatus: document.getElementById("timerStatus"),
  timerDisplay: document.getElementById("timerDisplay"),
  totalDurationDisplay: document.getElementById("totalDurationDisplay"),
  modeSequenceBtn: document.getElementById("modeSequenceBtn"),
  modeTimerBtn: document.getElementById("modeTimerBtn"),
  startBtn: document.getElementById("startBtn"),
  endBtn: document.getElementById("endBtn"),
  doubleTapHint: document.getElementById("doubleTapHint"),
  soundToggle: document.getElementById("soundToggle"),
  resetTimerBtn: document.getElementById("resetTimerBtn"),
  stopSoundBtn: document.getElementById("stopSoundBtn"),
  addSequenceRowBtn: document.getElementById("addSequenceRowBtn"),
  sequenceList: document.getElementById("sequenceList"),
  sequenceHint: document.getElementById("sequenceHint"),
  notesInput: document.getElementById("notesInput"),
  insertTimeBtn: document.getElementById("insertTimeBtn"),
  copyNotesBtn: document.getElementById("copyNotesBtn"),
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
let holdActivate = null;
let alertAudio = null;
let soundMutedForRun = false;
let holdReset = null;
const HOLD_RESET_MS = 500;

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

  els.resetTimerBtn.addEventListener("pointerdown", beginHoldReset);
  els.resetTimerBtn.addEventListener("pointerup", clearHoldReset);
  els.resetTimerBtn.addEventListener("pointerleave", clearHoldReset);
  els.resetTimerBtn.addEventListener("pointercancel", clearHoldReset);
  els.stopSoundBtn.addEventListener("click", () => {
    stopAlertSound();
    soundMutedForRun = true;
    renderTimer();
  });

  els.modeSequenceBtn.addEventListener("click", () => setTimerMode("sequence"));
  els.modeTimerBtn.addEventListener("click", () => setTimerMode("standalone"));

  els.addSequenceRowBtn.addEventListener("click", addSequenceRow);
  els.sequenceList.addEventListener("click", handleSequenceListClick);
  els.sequenceList.addEventListener("input", handleSequenceListInput);

  els.sequenceList.addEventListener("pointerdown", beginHoldActivate);
  els.sequenceList.addEventListener("pointerup", clearHoldActivate);
  els.sequenceList.addEventListener("pointerleave", clearHoldActivate);
  els.sequenceList.addEventListener("pointercancel", clearHoldActivate);
  els.sequenceList.addEventListener("pointermove", handleHoldActivateMove);

  els.notesInput.addEventListener("input", () => {
    state.notes = els.notesInput.value;
    persistState();
  });
  els.insertTimeBtn.addEventListener("click", insertCurrentTimeIntoNotes);
  els.copyNotesBtn.addEventListener("click", copyNotes);

  els.copyLogsBtn.addEventListener("click", copyLogs);
  els.clearLogsBtn.addEventListener("click", handleClearLogsTap);
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
    ? Math.ceil((state.running.endsAt - Date.now()) / 1000)
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
      ? `Overtime \u2013 started ${formatTime(state.running.startedAt)}`
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

  if (state.timerMode === "standalone") {
    els.startBtn.disabled = Boolean(state.running);
  } else {
    els.startBtn.disabled = Boolean(state.running) || state.activeSequenceIndex < 0 || state.activeSequenceIndex >= state.sequence.length;
  }
  els.endBtn.disabled = !state.running;
  els.stopSoundBtn.classList.toggle("hidden", !alertAudio);

  els.modeSequenceBtn.classList.toggle("mode-active", state.timerMode === "sequence");
  els.modeTimerBtn.classList.toggle("mode-active", state.timerMode === "standalone");
  els.timerPanel.classList.toggle("mode-standalone", state.timerMode === "standalone");
  els.resetTimerBtn.classList.toggle("hidden", state.timerMode === "sequence");

  renderActiveScenarioLabel();
}

function renderActiveScenarioLabel() {
  const eyebrow = els.timerPanel.querySelector(".eyebrow");

  if (state.timerMode === "standalone") {
    if (eyebrow) eyebrow.textContent = "Timer";
    els.activeScenarioLabel.textContent = "Standalone Timer";
    return;
  }

  if (eyebrow) eyebrow.textContent = "Active Scenario";
  if (state.activeSequenceIndex >= 0 && state.activeSequenceIndex < state.sequence.length) {
    const row = state.sequence[state.activeSequenceIndex];
    els.activeScenarioLabel.textContent = buildScenarioName(row);
  } else {
    els.activeScenarioLabel.textContent = "No scenario selected";
  }
}

function renderSequence() {
  if (state.sequence.length === 0) {
    els.sequenceList.innerHTML = '<p class="hint-text seq-empty-hint">No scenarios. Tap + Add Row to build your sequence.</p>';
    els.sequenceHint.textContent = "";
    renderActiveScenarioLabel();
    return;
  }

  const indices = [];
  for (let i = state.sequence.length - 1; i >= 0; i--) indices.push(i);

  els.sequenceList.innerHTML = indices.map((index) => {
    const row = state.sequence[index];
    const isActive = index === state.activeSequenceIndex;
    const isCompleted = Boolean(row.completed);
    const isPendingRemove = state.pendingRemoveIndex === index;
    const rowClasses = ["seq-row"];
    if (isActive) rowClasses.push("seq-active");
    if (isCompleted) rowClasses.push("seq-completed");

    const prefixOptions = PREFIX_OPTIONS
      .map(p => `<option value="${p}" ${row.prefix === p ? "selected" : ""}>${p}</option>`)
      .join("");
    const presetOptions = SCENARIO_PRESETS
      .map(s => `<option value="${s}" ${row.scenarioPreset === s ? "selected" : ""}>${s}</option>`)
      .join("");
    const showCustom = row.scenarioPreset === "Custom";

    const canMoveUp = index < state.sequence.length - 1;
    const canMoveDown = index > 0;

    return `
      <div class="${rowClasses.join(" ")}" data-seq-index="${index}">
        <div class="seq-index-number">${index + 1}</div>
        <div class="seq-controls">
          <button type="button" class="seq-btn" data-seq-up="${index}" title="Move up" ${!canMoveUp ? "disabled" : ""}>\u2191</button>
          <button type="button" class="seq-btn" data-seq-down="${index}" title="Move down" ${!canMoveDown ? "disabled" : ""}>\u2193</button>
        </div>
        <div class="seq-fields">
          <select class="text-input seq-prefix-input" data-seq-prefix-select="${index}">
            ${prefixOptions}
          </select>
          <select class="text-input seq-scenario-select" data-seq-scenario-select="${index}">
            ${presetOptions}
          </select>
          ${showCustom ? `<input class="text-input seq-scenario-input" type="text" value="${escapeAttribute(row.scenario)}" data-seq-scenario-text="${index}" placeholder="Type scenario name">` : ""}
          <div class="seq-dur-row">
            <button type="button" class="seq-dur-btn" data-seq-dur-minus="${index}" title="-1 min">\u2212</button>
            <input class="text-input seq-dur-input" type="number" min="1" max="240" value="${row.durationMinutes}" data-seq-duration="${index}" placeholder="mins">
            <button type="button" class="seq-dur-btn" data-seq-dur-plus="${index}" title="+1 min">+</button>
            <span class="seq-dur-label">mins</span>
          </div>
        </div>
        <div class="seq-actions">
          <button type="button" class="seq-activate-btn ${isActive ? "active" : ""}" data-seq-activate="${index}">
            ${isCompleted ? "\u2714 Done" : isActive ? "\u25B6 Active" : "\u25B6 Set Active"}
          </button>
          <button type="button" class="seq-reuse-btn" data-seq-reuse="${index}" title="Duplicate this row above">Reuse</button>
          <button type="button" class="seq-remove-btn ${isPendingRemove ? "pending" : ""}" data-seq-remove="${index}" title="Remove">
            ${isPendingRemove ? "Confirm?" : "\u00D7"}
          </button>
        </div>
      </div>
    `;
  }).join("");

  if (state.activeSequenceIndex < 0) {
    els.sequenceHint.textContent = "Hold a row or tap \u201CSet Active\u201D to enable Start";
  } else if (state.activeSequenceIndex >= state.sequence.length) {
    els.sequenceHint.textContent = "All scenarios complete.";
  } else {
    const activeRow = state.sequence[state.activeSequenceIndex];
    els.sequenceHint.textContent = `Active: ${buildScenarioName(activeRow)} (${activeRow.durationMinutes} mins) \u2013 Tap Start to begin`;
  }

  renderActiveScenarioLabel();
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
  els.clearLogsBtn.textContent = state.pendingClear ? "Confirm?" : "Clear";
  els.clearLogsBtn.classList.toggle("pending", state.pendingClear);

  if (state.logs.length === 0) {
    els.logList.innerHTML = '<div class="log-item log-empty"><p class="log-title">No scenarios logged yet.</p></div>';
    return;
  }

  els.logList.innerHTML = state.logs.map((log, logIndex) => {
    const serialNum = logIndex + 1;
    const isEditing = state.editingLogId === log.id;
    if (isEditing) {
      return `
        <article class="log-item" data-log-id="${log.id}">
          <div class="inline-editor">
            <div class="log-title-row"><span class="log-serial">${serialNum}</span></div>
            <input class="inline-name-input" type="text" value="${escapeAttribute(state.editDraft.scenarioName)}" data-edit-name="${log.id}" placeholder="Scenario name">
            <div class="editor-row">
              <input class="inline-time-input" type="text" value="${escapeAttribute(state.editDraft.startTime)}" data-edit-start="${log.id}" inputmode="numeric" placeholder="HH:MM:SS">
              <span class="log-arrow">\u2192</span>
              <input class="inline-time-input" type="text" value="${escapeAttribute(state.editDraft.endTime)}" data-edit-end="${log.id}" inputmode="numeric" placeholder="HH:MM:SS">
            </div>
            <div class="editor-row">
              <button class="save-inline" type="button" data-save-log="${log.id}">\u2714 Save</button>
              <button class="cancel-inline text-button" type="button" data-cancel-edit="${log.id}">Cancel</button>
            </div>
            <p class="hint-text">Format: HH:MM:SS</p>
          </div>
        </article>
      `;
    }
    return `
      <article class="log-item" data-log-id="${log.id}">
        <div class="log-title-row">
          <span class="log-serial">${serialNum}</span>
          <p class="log-title">${escapeHtml(log.scenarioName)} (${log.durationMinutes} mins)</p>
        </div>
        <div class="log-times">
          <button class="text-button mono-time" type="button" data-begin-edit="${log.id}">${escapeHtml(log.startTime)}</button>
          <span class="log-arrow">\u2192</span>
          <button class="text-button mono-time" type="button" data-begin-edit="${log.id}">${escapeHtml(log.endTime)}</button>
        </div>
        <div class="entry-actions">
          <button class="text-button" type="button" data-begin-edit="${log.id}">Edit</button>
          <button class="delete-hold" type="button" data-delete-log="${log.id}">Hold to delete</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderToast() {
  if (!state.toast) {
    els.toast.classList.add("hidden");
    return;
  }
  els.toast.classList.remove("hidden");
  els.toastMessage.textContent = state.toast.message;
}

function setTimerMode(mode) {
  if (state.running) return;
  state.timerMode = mode;
  renderTimer();
  renderSequence();
  persistState();
}

function startScenario() {
  if (state.running) return;
  soundMutedForRun = false;

  if (state.timerMode === "standalone") {
    const durationSeconds = Math.max(10, state.baseDurationSeconds);
    const startedAt = Date.now();
    state.running = {
      scenarioName: "Timer",
      sequenceIndex: -1,
      startedAt,
      endsAt: startedAt + (durationSeconds * 1000),
      totalDurationSeconds: durationSeconds
    };
    els.copyStatus.textContent = "Timer running.";
    renderAll();
    persistState();
    return;
  }

  if (state.activeSequenceIndex < 0 || state.activeSequenceIndex >= state.sequence.length) return;

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
  if (!state.running) return;

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
  if (!state.running) return;

  stopAlertSound();
  soundMutedForRun = false;

  if (state.running.sequenceIndex === -1) {
    const endedAt = Date.now();
    const durationMinutes = Math.max(1, Math.round(state.running.totalDurationSeconds / 60));
    const log = {
      id: crypto.randomUUID(),
      scenarioName: "Timer",
      sequenceIndex: -1,
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
    els.copyStatus.textContent = "Timer saved.";
    renderAll();
    persistState();
    return;
  }

  const endedAt = Date.now();
  const durationMinutes = Math.max(1, Math.round(state.running.totalDurationSeconds / 60));
  const sequenceIndex = state.running.sequenceIndex;
  const log = {
    id: crypto.randomUUID(),
    scenarioName: state.running.scenarioName,
    sequenceIndex,
    startTime: formatTime(state.running.startedAt),
    endTime: formatTime(endedAt),
    durationMinutes,
    startedAt: state.running.startedAt,
    endedAt
  };

  state.logs.push(log);
  if (sequenceIndex >= 0 && sequenceIndex < state.sequence.length) {
    state.sequence[sequenceIndex].completed = true;
  }
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

function beginHoldReset(event) {
  if (state.timerMode === "sequence") return;
  clearHoldReset();
  const startedAt = performance.now();
  const btn = els.resetTimerBtn;

  holdReset = {
    timer: window.setTimeout(() => {
      resetTimer();
      clearHoldReset();
    }, HOLD_RESET_MS),
    raf: 0,
    startedAt
  };

  const animate = () => {
    if (!holdReset) return;
    const progress = Math.min((performance.now() - startedAt) / HOLD_RESET_MS, 1);
    btn.style.setProperty("--hold-progress", progress);
    holdReset.raf = requestAnimationFrame(animate);
  };
  animate();
}

function clearHoldReset() {
  if (!holdReset) return;
  clearTimeout(holdReset.timer);
  cancelAnimationFrame(holdReset.raf);
  els.resetTimerBtn.style.setProperty("--hold-progress", 0);
  holdReset = null;
}

function resetTimer() {
  if (state.timerMode === "sequence") return;
  stopAlertSound();
  soundMutedForRun = false;
  state.running = null;
  state.baseDurationSeconds = DEFAULT_DURATION_SECONDS;
  state.lastEndTapAt = 0;
  els.doubleTapHint.textContent = "End requires double-tap within 500ms.";
  els.doubleTapHint.classList.remove("hint-active");
  els.copyStatus.textContent = "Timer reset.";
  renderAll();
  persistState();
}

function addSequenceRow() {
  state.sequence.push({
    prefix: "Person",
    scenarioPreset: "Custom",
    scenario: "",
    durationMinutes: 5,
    completed: false
  });
  renderSequence();
  renderTimer();
  persistState();
}

function reuseSequenceRow(idx) {
  if (idx < 0 || idx >= state.sequence.length) return;
  const original = state.sequence[idx];
  const clone = {
    prefix: original.prefix,
    scenarioPreset: original.scenarioPreset,
    scenario: original.scenario,
    durationMinutes: original.durationMinutes,
    completed: false
  };
  state.sequence.splice(idx + 1, 0, clone);
  if (state.activeSequenceIndex > idx) {
    state.activeSequenceIndex += 1;
  }
  renderSequence();
  renderTimer();
  persistState();
}

function adjustRowDuration(idx, delta) {
  if (idx < 0 || idx >= state.sequence.length) return;
  const row = state.sequence[idx];
  row.durationMinutes = Math.max(1, Math.min(240, row.durationMinutes + delta));
  if (state.activeSequenceIndex === idx && !state.running) {
    state.baseDurationSeconds = row.durationMinutes * 60;
  }
  renderSequence();
  renderTimer();
  persistState();
}

function activateSequenceIndex(idx) {
  if (idx < 0 || idx >= state.sequence.length) return;
  state.activeSequenceIndex = idx;
  if (!state.running) {
    state.baseDurationSeconds = Math.max(10, state.sequence[idx].durationMinutes * 60);
  }
  if (state.timerMode !== "sequence") {
    state.timerMode = "sequence";
  }
  clearPendingRemove();
  renderSequence();
  renderTimer();
  persistState();
}

function handleSequenceListClick(event) {
  const target = event.target;

  const removeIndex = target.dataset.seqRemove;
  if (removeIndex !== undefined) {
    handleRowRemoveTap(Number(removeIndex));
    return;
  }

  const activateIndex = target.dataset.seqActivate;
  if (activateIndex !== undefined) {
    activateSequenceIndex(Number(activateIndex));
    return;
  }

  const reuseIndex = target.dataset.seqReuse;
  if (reuseIndex !== undefined) {
    reuseSequenceRow(Number(reuseIndex));
    return;
  }

  const durMinusIndex = target.dataset.seqDurMinus;
  if (durMinusIndex !== undefined) {
    adjustRowDuration(Number(durMinusIndex), -1);
    return;
  }

  const durPlusIndex = target.dataset.seqDurPlus;
  if (durPlusIndex !== undefined) {
    adjustRowDuration(Number(durPlusIndex), 1);
    return;
  }

  const upIndex = target.dataset.seqUp;
  if (upIndex !== undefined) {
    moveSequenceRow(Number(upIndex), 1);
    return;
  }

  const downIndex = target.dataset.seqDown;
  if (downIndex !== undefined) {
    moveSequenceRow(Number(downIndex), -1);
    return;
  }
}

function moveSequenceRow(idx, direction) {
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= state.sequence.length) return;
  const moving = state.sequence[idx];
  state.sequence.splice(idx, 1);
  state.sequence.splice(newIdx, 0, moving);
  if (state.activeSequenceIndex === idx) state.activeSequenceIndex = newIdx;
  else if (direction === -1 && state.activeSequenceIndex === newIdx) state.activeSequenceIndex = idx;
  else if (direction === 1 && state.activeSequenceIndex === newIdx) state.activeSequenceIndex = idx;
  clearPendingRemove();
  renderSequence();
  renderTimer();
  persistState();
}

function beginHoldActivate(event) {
  const row = event.target.closest(".seq-row");
  if (!row) return;
  if (event.target.closest("input, select, button, textarea")) return;

  clearHoldActivate();
  const idx = Number(row.dataset.seqIndex);
  if (Number.isNaN(idx)) return;

  holdActivate = {
    row,
    startX: event.clientX,
    startY: event.clientY,
    timer: window.setTimeout(() => {
      clearHoldActivate();
      activateSequenceIndex(idx);
    }, HOLD_ACTIVATE_MS)
  };

  row.classList.add("hold-activating");
}

function clearHoldActivate() {
  if (!holdActivate) return;
  clearTimeout(holdActivate.timer);
  if (holdActivate.row) {
    holdActivate.row.classList.remove("hold-activating");
  }
  holdActivate = null;
}

function handleHoldActivateMove(event) {
  if (!holdActivate) return;
  const dx = event.clientX - holdActivate.startX;
  const dy = event.clientY - holdActivate.startY;
  if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
    clearHoldActivate();
  }
}

function handleRowRemoveTap(idx) {
  if (state.pendingRemoveIndex === idx) {
    removeSequenceRow(idx);
    return;
  }
  clearPendingRemove();
  state.pendingRemoveIndex = idx;
  renderSequence();
  pendingRemoveTimer = window.setTimeout(() => {
    clearPendingRemove();
    renderSequence();
  }, CONFIRM_WINDOW_MS);
}

function clearPendingRemove() {
  clearTimeout(pendingRemoveTimer);
  pendingRemoveTimer = null;
  state.pendingRemoveIndex = -1;
}

function removeSequenceRow(idx) {
  clearPendingRemove();
  pushUndoAction({
    type: "seq-remove",
    sequence: structuredClone(state.sequence),
    activeSequenceIndex: state.activeSequenceIndex,
    notes: state.notes,
    logs: structuredClone(state.logs),
    baseDurationSeconds: state.baseDurationSeconds,
    running: state.running ? structuredClone(state.running) : null
  });
  state.sequence.splice(idx, 1);
  if (state.activeSequenceIndex === idx) {
    state.activeSequenceIndex = -1;
  } else if (state.activeSequenceIndex > idx) {
    state.activeSequenceIndex -= 1;
  }
  showToast("Row removed");
  renderSequence();
  renderTimer();
  persistState();
}

function handleSequenceListInput(event) {
  const target = event.target;

  const prefixIndex = target.dataset.seqPrefixSelect;
  if (prefixIndex !== undefined) {
    state.sequence[Number(prefixIndex)].prefix = target.value;
    renderActiveScenarioLabel();
    persistState();
    return;
  }

  const scenarioSelectIndex = target.dataset.seqScenarioSelect;
  if (scenarioSelectIndex !== undefined) {
    const idx = Number(scenarioSelectIndex);
    const row = state.sequence[idx];
    row.scenarioPreset = target.value;
    if (row.scenarioPreset !== "Custom") {
      row.scenario = row.scenarioPreset;
    } else if (SCENARIO_PRESETS.includes(row.scenario)) {
      row.scenario = "";
    }
    renderSequence();
    renderTimer();
    persistState();
    return;
  }

  const scenarioTextIndex = target.dataset.seqScenarioText;
  if (scenarioTextIndex !== undefined) {
    state.sequence[Number(scenarioTextIndex)].scenario = target.value;
    renderActiveScenarioLabel();
    persistState();
    return;
  }

  const durationIndex = target.dataset.seqDuration;
  if (durationIndex !== undefined) {
    const mins = Math.max(1, Math.min(240, Number(target.value) || 1));
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

async function copyNotes() {
  const output = state.notes.trim();
  if (!output) {
    els.copyNotesBtn.textContent = "Empty";
    window.setTimeout(() => { els.copyNotesBtn.textContent = "Copy"; }, 1500);
    return;
  }
  try {
    await navigator.clipboard.writeText(output);
    els.copyNotesBtn.textContent = "Copied!";
    window.setTimeout(() => { els.copyNotesBtn.textContent = "Copy"; }, 1500);
  } catch {
    els.copyNotesBtn.textContent = "Failed";
    window.setTimeout(() => { els.copyNotesBtn.textContent = "Copy"; }, 1500);
  }
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
    state.editDraft = {
      scenarioName: log.scenarioName,
      startTime: log.startTime,
      endTime: log.endTime
    };
    renderHistory();
    return;
  }

  const saveLogId = event.target.dataset.saveLog;
  if (saveLogId) {
    saveInlineEdit(saveLogId);
    return;
  }

  const cancelEditId = event.target.dataset.cancelEdit;
  if (cancelEditId) {
    state.editingLogId = null;
    renderHistory();
  }
}

function handleLogListInput(event) {
  if (event.target.dataset.editName) state.editDraft.scenarioName = event.target.value;
  if (event.target.dataset.editStart) state.editDraft.startTime = event.target.value.trim();
  if (event.target.dataset.editEnd) state.editDraft.endTime = event.target.value.trim();
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
  if (holdDelete.button) holdDelete.button.style.setProperty("--hold-progress", 0);
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
    baseDurationSeconds: state.baseDurationSeconds,
    running: state.running ? structuredClone(state.running) : null
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
  const trimmedName = state.editDraft.scenarioName.trim();
  if (trimmedName) log.scenarioName = trimmedName;
  log.startTime = state.editDraft.startTime;
  log.endTime = state.editDraft.endTime;
  state.editingLogId = null;
  els.copyStatus.textContent = "Entry updated.";
  renderHistory();
  persistState();
}

async function copyLogs() {
  const output = state.logs
    .map((log) => `${log.scenarioName} (${log.durationMinutes} mins) \u2192 ${log.startTime} - ${log.endTime}`)
    .join("\n");
  try {
    await navigator.clipboard.writeText(output);
    els.copyStatus.textContent = `${state.logs.length} log${state.logs.length !== 1 ? "s" : ""} copied.`;
  } catch {
    els.copyStatus.textContent = "Clipboard blocked in this browser.";
  }
}

function handleClearLogsTap() {
  if (state.pendingClear) {
    clearPendingClear();
    clearLogs();
    return;
  }
  state.pendingClear = true;
  renderHistory();
  els.copyStatus.textContent = "Tap Confirm? to clear all logs.";
  pendingClearTimer = window.setTimeout(() => {
    clearPendingClear();
    renderHistory();
    els.copyStatus.textContent = "Clear cancelled.";
  }, CONFIRM_WINDOW_MS);
}

function clearPendingClear() {
  clearTimeout(pendingClearTimer);
  pendingClearTimer = null;
  state.pendingClear = false;
}

function clearLogs() {
  pushUndoAction({
    type: "clear",
    logs: structuredClone(state.logs),
    sequence: structuredClone(state.sequence),
    activeSequenceIndex: state.activeSequenceIndex,
    notes: state.notes,
    baseDurationSeconds: state.baseDurationSeconds,
    running: state.running ? structuredClone(state.running) : null
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

  if (action.logs !== undefined) state.logs = structuredClone(action.logs);
  if (action.sequence !== undefined) state.sequence = structuredClone(action.sequence);
  if (action.activeSequenceIndex !== undefined) state.activeSequenceIndex = action.activeSequenceIndex;
  if (action.notes !== undefined) state.notes = action.notes;
  if (action.baseDurationSeconds !== undefined) state.baseDurationSeconds = action.baseDurationSeconds;
  if ("running" in action) state.running = action.running ? structuredClone(action.running) : null;

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
      if (now >= state.running.endsAt && state.soundEnabled && !alertAudio && !soundMutedForRun) {
        startAlertSound();
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
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    const toggleHz = [880, 587.33];
    let step = 0;
    const toggleId = window.setInterval(() => {
      step = (step + 1) % toggleHz.length;
      osc.frequency.setValueAtTime(toggleHz[step], ctx.currentTime);
    }, 420);

    alertAudio = {
      ctx,
      stop: () => {
        try {
          clearInterval(toggleId);
          gain.gain.cancelScheduledValues(ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
          osc.stop(ctx.currentTime + 0.1);
          window.setTimeout(() => ctx.close().catch(() => {}), 200);
        } catch {}
        alertAudio = null;
      }
    };
  } catch {
    alertAudio = null;
  }
}

function stopAlertSound() {
  if (alertAudio) alertAudio.stop();
}

function buildScenarioName(row) {
  const prefix = (row.prefix || "").trim() || "Person";
  const raw = row.scenarioPreset && row.scenarioPreset !== "Custom"
    ? row.scenarioPreset
    : (row.scenario || "").trim();
  const scenario = raw || "Unnamed";
  return `${prefix} \u2013 ${scenario}`;
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
    toast: state.toast,
    timerMode: state.timerMode
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function restoreState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const saved = JSON.parse(raw);
    state.sequence = Array.isArray(saved.sequence) ? saved.sequence.map(normalizeSequenceRow) : [];
    state.activeSequenceIndex = typeof saved.activeSequenceIndex === "number" ? saved.activeSequenceIndex : -1;
    state.notes = saved.notes || "";
    state.logs = Array.isArray(saved.logs) ? saved.logs : [];
    state.baseDurationSeconds = Number(saved.baseDurationSeconds) || DEFAULT_DURATION_SECONDS;
    state.running = saved.running || null;
    state.soundEnabled = saved.soundEnabled !== undefined ? Boolean(saved.soundEnabled) : true;
    state.historyCollapsed = Boolean(saved.historyCollapsed);
    state.undoStack = Array.isArray(saved.undoStack) ? saved.undoStack.slice(0, MAX_UNDO_LEVELS) : [];
    state.toast = saved.toast || null;
    state.timerMode = saved.timerMode === "standalone" ? "standalone" : "sequence";

    if (state.running && Date.now() >= state.running.endsAt && state.soundEnabled) {
      startAlertSound();
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function normalizeSequenceRow(row) {
  const preset = typeof row.scenarioPreset === "string"
    ? row.scenarioPreset
    : (SCENARIO_PRESETS.includes(row.scenario) ? row.scenario : "Custom");
  return {
    prefix: row.prefix || "Person",
    scenarioPreset: preset,
    scenario: typeof row.scenario === "string" ? row.scenario : "",
    durationMinutes: Number(row.durationMinutes) || 5,
    completed: Boolean(row.completed)
  };
}

function formatCountdown(totalSeconds) {
  const negative = totalSeconds < 0;
  const abs = Math.abs(totalSeconds);
  const minutes = Math.floor(abs / 60);
  const seconds = abs % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return negative ? `-${display}` : display;
}

function formatMinutesLabel(totalSeconds) {
  return `${String(Math.max(1, Math.round(totalSeconds / 60))).padStart(2, "0")} mins`;
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
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
