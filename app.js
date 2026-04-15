const STORAGE_KEY = "rayiot-mobile-testing-logger-v3";
const DEFAULT_DURATION_SECONDS = 5 * 60;
const END_DOUBLE_TAP_MS = 500;
const HOLD_DELETE_MS = 500;
const MAX_UNDO_ACTIONS = 3;
const DEFAULT_PREFIXES = ["Person", "No Person"];
const DEFAULT_SCENARIOS = ["Walking", "Sitting", "Standing", "Sleeping", "No Person", "Combination"];

const state = {
  selectedPrefix: "Person",
  customPrefixDraft: "",
  selectedScenario: "Walking",
  customScenarios: [],
  customPrefixes: [],
  notes: "",
  logs: [],
  baseDurationSeconds: DEFAULT_DURATION_SECONDS,
  running: null,
  soundEnabled: false,
  historyCollapsed: false,
  editingLogId: null,
  editDraft: { startTime: "", endTime: "" },
  lastEndTapAt: 0,
  undoStack: [],
  toast: null
};

const els = {
  activeScenarioLabel: document.getElementById("activeScenarioLabel"),
  timerStatus: document.getElementById("timerStatus"),
  timerDisplay: document.getElementById("timerDisplay"),
  totalDurationDisplay: document.getElementById("totalDurationDisplay"),
  startBtn: document.getElementById("startBtn"),
  endBtn: document.getElementById("endBtn"),
  doubleTapHint: document.getElementById("doubleTapHint"),
  soundToggle: document.getElementById("soundToggle"),
  toggleCustomTimerBtn: document.getElementById("toggleCustomTimerBtn"),
  customTimerPanel: document.getElementById("customTimerPanel"),
  customMinutesInput: document.getElementById("customMinutesInput"),
  customSecondsInput: document.getElementById("customSecondsInput"),
  applyCustomTimerBtn: document.getElementById("applyCustomTimerBtn"),
  scenarioPrefixSelect: document.getElementById("scenarioPrefixSelect"),
  togglePrefixManagerBtn: document.getElementById("togglePrefixManagerBtn"),
  customPrefixInput: document.getElementById("customPrefixInput"),
  prefixManager: document.getElementById("prefixManager"),
  newPrefixInput: document.getElementById("newPrefixInput"),
  addPrefixBtn: document.getElementById("addPrefixBtn"),
  prefixList: document.getElementById("prefixList"),
  scenarioInput: document.getElementById("scenarioInput"),
  scenarioButtons: document.getElementById("scenarioButtons"),
  newScenarioInput: document.getElementById("newScenarioInput"),
  addScenarioBtn: document.getElementById("addScenarioBtn"),
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
let toastTimer = null;
let holdDelete = null;

init();

function init() {
  restoreState();
  bindEvents();
  renderAll();
  startTicker();
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

  els.toggleCustomTimerBtn.addEventListener("click", () => {
    els.customTimerPanel.classList.toggle("hidden");
  });
  els.applyCustomTimerBtn.addEventListener("click", applyCustomTimer);

  els.scenarioPrefixSelect.addEventListener("change", () => {
    const value = els.scenarioPrefixSelect.value;
    if (value === "__custom__") {
      state.selectedPrefix = "Custom";
      els.customPrefixInput.classList.remove("hidden");
      els.customPrefixInput.focus();
    } else {
      state.selectedPrefix = value;
      els.customPrefixInput.classList.add("hidden");
    }
    renderHeader();
    persistState();
  });

  els.customPrefixInput.addEventListener("input", () => {
    state.customPrefixDraft = els.customPrefixInput.value.trim();
    renderHeader();
    persistState();
  });

  els.togglePrefixManagerBtn.addEventListener("click", () => {
    els.prefixManager.classList.toggle("hidden");
  });
  els.addPrefixBtn.addEventListener("click", addPrefix);
  els.prefixList.addEventListener("click", handlePrefixListClick);

  els.scenarioButtons.addEventListener("click", handleScenarioButtonClick);
  els.scenarioInput.addEventListener("input", () => {
    state.selectedScenario = els.scenarioInput.value.trim();
    renderHeader();
    renderScenarioButtons();
    persistState();
  });
  els.addScenarioBtn.addEventListener("click", addScenario);

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
  renderPrefixSelect();
  renderPrefixManager();
  renderScenarioButtons();
  renderHeader();
  renderTimer();
  renderNotes();
  renderHistory();
  renderToast();
}

function renderPrefixSelect() {
  const options = [...DEFAULT_PREFIXES, ...state.customPrefixes];
  const currentValue = options.includes(state.selectedPrefix) ? state.selectedPrefix : "__custom__";
  els.scenarioPrefixSelect.innerHTML = options
    .map((prefix) => `<option value="${escapeAttribute(prefix)}">${escapeHtml(prefix)}</option>`)
    .concat('<option value="__custom__">Custom</option>')
    .join("");
  els.scenarioPrefixSelect.value = currentValue;
  els.customPrefixInput.classList.toggle("hidden", currentValue !== "__custom__");
  els.customPrefixInput.value = state.customPrefixDraft;
}

function renderPrefixManager() {
  if (state.customPrefixes.length === 0) {
    els.prefixList.innerHTML = '<p class="hint-text">No saved custom prefixes yet.</p>';
    return;
  }

  els.prefixList.innerHTML = state.customPrefixes.map((prefix) => `
    <div class="prefix-pill${prefix === state.selectedPrefix ? " active" : ""}">
      <span>${escapeHtml(prefix)}</span>
      <button type="button" data-remove-prefix="${escapeAttribute(prefix)}">Remove</button>
    </div>
  `).join("");
}

function renderScenarioButtons() {
  const scenarios = [...DEFAULT_SCENARIOS, ...state.customScenarios];
  els.scenarioInput.value = state.selectedScenario;
  els.scenarioButtons.innerHTML = scenarios.map((scenario) => `
    <button type="button" class="quick-chip${scenario === state.selectedScenario ? " active" : ""}" data-scenario="${escapeAttribute(scenario)}">${escapeHtml(scenario)}</button>
  `).join("");
}

function renderHeader() {
  els.activeScenarioLabel.textContent = getScenarioName();
}

function renderTimer() {
  const remainingSeconds = state.running
    ? Math.max(0, Math.ceil((state.running.endsAt - Date.now()) / 1000))
    : state.baseDurationSeconds;
  const totalSeconds = state.running ? state.running.totalDurationSeconds : state.baseDurationSeconds;

  els.timerDisplay.textContent = formatCountdown(remainingSeconds);
  els.totalDurationDisplay.textContent = formatMinutesLabel(totalSeconds);
  els.timerStatus.textContent = state.running
    ? `Started ${formatTime(state.running.startedAt)}`
    : `Ready ${formatCountdown(state.baseDurationSeconds)}`;
  els.soundToggle.checked = state.soundEnabled;
  els.startBtn.disabled = Boolean(state.running);
  els.endBtn.disabled = !state.running;

  const customTimer = secondsToParts(state.baseDurationSeconds);
  els.customMinutesInput.value = String(customTimer.minutes);
  els.customSecondsInput.value = String(customTimer.seconds);
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
    els.logList.innerHTML = '<div class="log-item"><p class="log-title">No scenarios logged yet.</p></div>';
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
              <input class="inline-time-input" type="text" value="${escapeAttribute(state.editDraft.startTime)}" data-edit-start="${log.id}" inputmode="numeric">
              <span>-</span>
              <input class="inline-time-input" type="text" value="${escapeAttribute(state.editDraft.endTime)}" data-edit-end="${log.id}" inputmode="numeric">
              <button class="save-inline" type="button" data-save-log="${log.id}">✔</button>
            </div>
          </div>
        ` : `
          <div class="log-times">
            <button class="text-button" type="button" data-begin-edit="${log.id}">${escapeHtml(log.startTime)}</button>
            <span>→</span>
            <button class="text-button" type="button" data-begin-edit="${log.id}">${escapeHtml(log.endTime)}</button>
          </div>
        `}
        <div class="entry-actions">
          <button class="text-button" type="button" data-begin-edit="${log.id}">Edit</button>
          <button class="delete-hold" type="button" data-delete-log="${log.id}">Hold Delete</button>
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

function startScenario() {
  if (state.running) {
    return;
  }

  const startedAt = Date.now();
  state.running = {
    scenarioName: getScenarioName(),
    startedAt,
    endsAt: startedAt + (state.baseDurationSeconds * 1000),
    totalDurationSeconds: state.baseDurationSeconds
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
    endScenario("manual");
    return;
  }

  state.lastEndTapAt = now;
  els.doubleTapHint.textContent = "Tap End again now to confirm.";
  window.setTimeout(() => {
    if (Date.now() - state.lastEndTapAt >= END_DOUBLE_TAP_MS) {
      state.lastEndTapAt = 0;
      els.doubleTapHint.textContent = "End requires double tap within 500ms.";
    }
  }, END_DOUBLE_TAP_MS + 10);
}

function endScenario(reason) {
  if (!state.running) {
    return;
  }

  const endedAt = reason === "auto" ? state.running.endsAt : Date.now();
  const durationMinutes = Math.max(1, Math.round(state.running.totalDurationSeconds / 60));
  const log = {
    id: crypto.randomUUID(),
    scenarioName: state.running.scenarioName,
    startTime: formatTime(state.running.startedAt),
    endTime: formatTime(endedAt),
    durationMinutes,
    startedAt: state.running.startedAt,
    endedAt,
    raw: ""
  };

  log.raw = `${log.scenarioName} | ${log.startTime} | ${log.endTime} | ${log.durationMinutes}`;
  state.logs.push(log);
  state.running = null;
  state.lastEndTapAt = 0;
  els.doubleTapHint.textContent = "End requires double tap within 500ms.";
  els.copyStatus.textContent = "Scenario saved.";

  if (reason === "auto" && state.soundEnabled) {
    playAlert();
  }

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
  } else {
    state.baseDurationSeconds = total;
  }

  els.customTimerPanel.classList.add("hidden");
  renderTimer();
  persistState();
}

function addPrefix() {
  const value = els.newPrefixInput.value.trim();
  const allPrefixes = [...DEFAULT_PREFIXES, ...state.customPrefixes];
  if (!value || allPrefixes.includes(value)) {
    return;
  }

  state.customPrefixes.push(value);
  state.selectedPrefix = value;
  els.newPrefixInput.value = "";
  renderAll();
  persistState();
}

function addScenario() {
  const value = els.newScenarioInput.value.trim();
  const allScenarios = [...DEFAULT_SCENARIOS, ...state.customScenarios];
  if (!value || allScenarios.includes(value)) {
    return;
  }

  state.customScenarios.push(value);
  state.selectedScenario = value;
  els.newScenarioInput.value = "";
  renderAll();
  persistState();
}

function insertCurrentTimeIntoNotes() {
  const time = formatTime(Date.now());
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

function handleScenarioButtonClick(event) {
  const button = event.target.closest("[data-scenario]");
  if (!button) {
    return;
  }

  state.selectedScenario = button.dataset.scenario;
  renderAll();
  persistState();
}

function handlePrefixListClick(event) {
  const prefix = event.target.dataset.removePrefix;
  if (!prefix) {
    return;
  }

  state.customPrefixes = state.customPrefixes.filter((entry) => entry !== prefix);
  if (state.selectedPrefix === prefix) {
    state.selectedPrefix = DEFAULT_PREFIXES[0];
  }
  renderAll();
  persistState();
}

function handleLogListClick(event) {
  const beginEditId = event.target.dataset.beginEdit;
  if (beginEditId) {
    const log = state.logs.find((entry) => entry.id === beginEditId);
    if (!log) {
      return;
    }
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
  if (!button) {
    return;
  }

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
    if (!holdDelete || holdDelete.button !== button) {
      return;
    }
    const progress = Math.min((performance.now() - startedAt) / HOLD_DELETE_MS, 1);
    button.style.setProperty("--hold-progress", progress);
    holdDelete.raf = requestAnimationFrame(animate);
  };

  animate();
}

function clearHoldDelete() {
  if (!holdDelete) {
    return;
  }

  clearTimeout(holdDelete.timer);
  cancelAnimationFrame(holdDelete.raf);
  holdDelete.button.style.setProperty("--hold-progress", 0);
  holdDelete = null;
}

function deleteLog(logId) {
  const log = state.logs.find((entry) => entry.id === logId);
  if (!log) {
    return;
  }

  pushUndoAction({ type: "delete", logs: [structuredClone(log)], index: state.logs.findIndex((entry) => entry.id === logId) });
  state.logs = state.logs.filter((entry) => entry.id !== logId);
  if (state.editingLogId === logId) {
    state.editingLogId = null;
  }
  showToast("Entry deleted");
  renderHistory();
  persistState();
}

function saveInlineEdit(logId) {
  if (!isValidTime(state.editDraft.startTime) || !isValidTime(state.editDraft.endTime)) {
    els.copyStatus.textContent = "Use HH:MM:SS for inline edits.";
    return;
  }

  const log = state.logs.find((entry) => entry.id === logId);
  if (!log) {
    return;
  }

  log.startTime = state.editDraft.startTime;
  log.endTime = state.editDraft.endTime;
  log.raw = `${log.scenarioName} | ${log.startTime} | ${log.endTime} | ${log.durationMinutes}`;
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
    els.copyStatus.textContent = `${state.logs.length} logs copied.`;
  } catch (error) {
    els.copyStatus.textContent = "Clipboard blocked in this browser.";
  }
}

function clearLogs() {
  if (!window.confirm("Clear all logs?")) {
    return;
  }

  if (state.logs.length > 0) {
    pushUndoAction({ type: "clear", logs: structuredClone(state.logs) });
  }
  state.logs = [];
  state.editingLogId = null;
  els.copyStatus.textContent = "Logs cleared.";
  showToast("Logs cleared");
  renderHistory();
  persistState();
}

function pushUndoAction(action) {
  state.undoStack.unshift(action);
  state.undoStack = state.undoStack.slice(0, MAX_UNDO_ACTIONS);
}

function undoLastAction() {
  const action = state.undoStack.shift();
  if (!action) {
    hideToast();
    persistState();
    return;
  }

  if (action.type === "delete") {
    state.logs.splice(action.index, 0, ...structuredClone(action.logs));
  }

  if (action.type === "clear") {
    state.logs = structuredClone(action.logs);
  }

  hideToast();
  els.copyStatus.textContent = "Undo applied.";
  renderHistory();
  persistState();
}

function showToast(message) {
  state.toast = { message };
  renderToast();
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    hideToast();
    persistState();
  }, 5000);
}

function hideToast() {
  clearTimeout(toastTimer);
  state.toast = null;
  renderToast();
}

function startTicker() {
  clearInterval(ticker);
  ticker = setInterval(() => {
    if (state.running && Date.now() >= state.running.endsAt) {
      endScenario("auto");
      return;
    }
    renderTimer();
  }, 250);
}

function getScenarioName() {
  const prefix = getCurrentPrefix();
  const scenario = state.selectedScenario.trim() || "Unnamed";
  return `${prefix} – ${scenario}`;
}

function getCurrentPrefix() {
  if (state.selectedPrefix === "Custom") {
    return state.customPrefixDraft.trim() || "Custom";
  }
  return state.selectedPrefix;
}

function persistState() {
  const data = {
    selectedPrefix: state.selectedPrefix,
    customPrefixDraft: state.customPrefixDraft,
    selectedScenario: state.selectedScenario,
    customScenarios: state.customScenarios,
    customPrefixes: state.customPrefixes,
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
  if (!raw) {
    return;
  }

  try {
    const saved = JSON.parse(raw);
    state.selectedPrefix = saved.selectedPrefix || state.selectedPrefix;
    state.customPrefixDraft = saved.customPrefixDraft || "";
    state.selectedScenario = saved.selectedScenario || state.selectedScenario;
    state.customScenarios = Array.isArray(saved.customScenarios) ? saved.customScenarios : [];
    state.customPrefixes = Array.isArray(saved.customPrefixes) ? saved.customPrefixes : [];
    state.notes = saved.notes || "";
    state.logs = Array.isArray(saved.logs) ? saved.logs : [];
    state.baseDurationSeconds = Number(saved.baseDurationSeconds) || DEFAULT_DURATION_SECONDS;
    state.running = saved.running || null;
    state.soundEnabled = Boolean(saved.soundEnabled);
    state.historyCollapsed = Boolean(saved.historyCollapsed);
    state.undoStack = Array.isArray(saved.undoStack) ? saved.undoStack.slice(0, MAX_UNDO_ACTIONS) : [];
    state.toast = saved.toast || null;

    if (state.running && Date.now() >= state.running.endsAt) {
      endScenario("auto");
    }
  } catch (error) {
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
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60
  };
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value);
}

function playAlert() {
  const context = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = 880;
  gain.gain.value = 0.035;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.18);
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
