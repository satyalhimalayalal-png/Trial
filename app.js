const STORAGE_KEY = "focusNexusData.v1";
const THEME_KEY = "focusNexusTheme.v1";
const PREF_KEY = "focusNexusPref.v1";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ringProgress = document.getElementById("ringProgress");
const timeLabel = document.getElementById("timeLabel");
const timerMode = document.getElementById("timerMode");
const startPauseBtn = document.getElementById("startPauseBtn");
const resetBtn = document.getElementById("resetBtn");
const timerConfig = document.getElementById("timerConfig");
const workInput = document.getElementById("workInput");
const breakInput = document.getElementById("breakInput");
const longBreakInput = document.getElementById("longBreakInput");
const longEveryInput = document.getElementById("longEveryInput");
const monthRow = document.getElementById("monthRow");
const weekdayCol = document.getElementById("weekdayCol");
const heatGrid = document.getElementById("heatGrid");
const heatHint = document.getElementById("heatHint");
const sparkline = document.getElementById("sparkline");
const weekdayPills = document.getElementById("weekdayPills");
const weekLogs = document.getElementById("weekLogs");
const weeklySummary = document.getElementById("weeklySummary");
const completionRing = document.getElementById("completionRing");
const peakRing = document.getElementById("peakRing");
const completionValue = document.getElementById("completionValue");
const peakValue = document.getElementById("peakValue");
const selectedDateLabel = document.getElementById("selectedDateLabel");
const taskBoard = document.getElementById("taskBoard");
const taskTemplate = document.getElementById("taskItemTemplate");
const addTaskBtn = document.getElementById("addTaskBtn");
const quickAdd = document.getElementById("quickAdd");
const taskTitle = document.getElementById("taskTitle");
const taskDay = document.getElementById("taskDay");
const saveTaskBtn = document.getElementById("saveTaskBtn");
const taskSearch = document.getElementById("taskSearch");
const dateRange = document.getElementById("dateRange");
const themeButton = document.getElementById("themeButton");
const closeAppearance = document.getElementById("closeAppearance");
const appearancePanel = document.getElementById("appearancePanel");
const themeGrid = document.getElementById("themeGrid");
const showCompletedToggle = document.getElementById("showCompletedToggle");

const THEMES = [
  { id: "neon", label: "Neon" },
  { id: "pastel", label: "Pastel Light" },
  { id: "ember", label: "Ember" },
  { id: "oceanic", label: "Oceanic" },
  { id: "medieval", label: "Medieval" },
];

const defaultState = {
  timerConfig: {
    work: 25,
    break: 5,
    longBreak: 15,
    longEvery: 4,
  },
  tasks: [
    { id: crypto.randomUUID(), title: "Define weekly focus target", day: 0, completed: false },
    { id: crypto.randomUUID(), title: "Deep work sprint: product", day: 1, completed: false },
    { id: crypto.randomUUID(), title: "Inbox zero", day: 2, completed: false },
    { id: crypto.randomUUID(), title: "Review analytics", day: 4, completed: false },
    { id: crypto.randomUUID(), title: "Plan next week", day: 6, completed: false },
  ],
  logs: {
    // YYYY-MM-DD: total focus minutes
  },
};

let state = loadState();
let timer = {
  isRunning: false,
  mode: "work",
  remaining: state.timerConfig.work * 60,
  total: state.timerConfig.work * 60,
  completedWorkSessions: 0,
  interval: null,
};

let preferences = loadPreferences();
let selectedHeatDate = null;

init();

function init() {
  populateDaySelect();
  hydrateInputs();
  renderThemeOptions();
  applyTheme(loadTheme());
  applyDensity(preferences.density || "compact");
  showCompletedToggle.checked = preferences.showCompleted !== false;
  renderTasks();
  renderHeatmap();
  renderStats();
  updateTimerUI();
  bindEvents();
  updateDateRange();
}

function bindEvents() {
  startPauseBtn.addEventListener("click", toggleTimer);
  resetBtn.addEventListener("click", resetTimer);

  timerConfig.addEventListener("submit", (event) => {
    event.preventDefault();
    state.timerConfig.work = clampNumber(workInput.value, 1, 180, 25);
    state.timerConfig.break = clampNumber(breakInput.value, 1, 60, 5);
    state.timerConfig.longBreak = clampNumber(longBreakInput.value, 5, 120, 15);
    state.timerConfig.longEvery = clampNumber(longEveryInput.value, 2, 10, 4);
    persistState();
    resetTimer();
  });

  document.querySelectorAll(".chip[data-work]").forEach((button) => {
    button.addEventListener("click", () => {
      state.timerConfig.work = Number(button.dataset.work);
      state.timerConfig.break = Number(button.dataset.break);
      persistState();
      hydrateInputs();
      resetTimer();
    });
  });

  addTaskBtn.addEventListener("click", () => {
    quickAdd.classList.toggle("hidden");
    if (!quickAdd.classList.contains("hidden")) {
      taskTitle.focus();
    }
  });

  saveTaskBtn.addEventListener("click", addTask);
  taskSearch.addEventListener("input", renderTasks);

  themeButton.addEventListener("click", () => toggleAppearance(true));
  closeAppearance.addEventListener("click", () => toggleAppearance(false));

  themeGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-theme]");
    if (!button) return;
    applyTheme(button.dataset.theme);
    saveTheme(button.dataset.theme);
  });

  document.querySelectorAll(".pref-chip[data-density]").forEach((button) => {
    button.addEventListener("click", () => {
      applyDensity(button.dataset.density);
      preferences.density = button.dataset.density;
      savePreferences();
    });
  });

  showCompletedToggle.addEventListener("change", () => {
    preferences.showCompleted = showCompletedToggle.checked;
    savePreferences();
    renderTasks();
  });
}

function toggleTimer() {
  if (timer.isRunning) {
    timer.isRunning = false;
    clearInterval(timer.interval);
    timer.interval = null;
    updateTimerUI();
    return;
  }

  timer.isRunning = true;
  startPauseBtn.textContent = "Pause";
  timer.interval = setInterval(() => {
    timer.remaining -= 1;
    if (timer.remaining <= 0) {
      finishSession();
    }
    updateTimerUI();
  }, 1000);
}

function finishSession() {
  clearInterval(timer.interval);
  timer.interval = null;
  timer.isRunning = false;

  if (timer.mode === "work") {
    timer.completedWorkSessions += 1;
    const todayKey = toKey(new Date());
    state.logs[todayKey] = (state.logs[todayKey] || 0) + state.timerConfig.work;
    persistState();
    renderHeatmap();
    renderStats();

    const useLongBreak = timer.completedWorkSessions % state.timerConfig.longEvery === 0;
    timer.mode = useLongBreak ? "longBreak" : "break";
    timer.total = (useLongBreak ? state.timerConfig.longBreak : state.timerConfig.break) * 60;
    timer.remaining = timer.total;
  } else {
    timer.mode = "work";
    timer.total = state.timerConfig.work * 60;
    timer.remaining = timer.total;
  }

  updateTimerUI();
}

function resetTimer() {
  clearInterval(timer.interval);
  timer.interval = null;
  timer.isRunning = false;
  timer.mode = "work";
  timer.total = state.timerConfig.work * 60;
  timer.remaining = timer.total;
  updateTimerUI();
}

function updateTimerUI() {
  timeLabel.textContent = formatTime(timer.remaining);
  timerMode.textContent = timer.mode === "work" ? "Work session" : timer.mode === "break" ? "Break session" : "Long break";
  startPauseBtn.textContent = timer.isRunning ? "Pause" : "Start";

  const progress = 1 - timer.remaining / timer.total;
  const circumference = 2 * Math.PI * 102;
  ringProgress.style.strokeDasharray = String(circumference);
  ringProgress.style.strokeDashoffset = String(Math.max(0, circumference * (1 - progress)));
}

function renderTasks() {
  const query = taskSearch.value.trim().toLowerCase();
  taskBoard.innerHTML = "";

  DAYS.forEach((dayName, index) => {
    const dayTasks = state.tasks.filter((task) => {
      const visibleByComplete = preferences.showCompleted ? true : !task.completed;
      const visibleBySearch = query ? task.title.toLowerCase().includes(query) : true;
      return task.day === index && visibleByComplete && visibleBySearch;
    });

    const column = document.createElement("div");
    column.className = "day-col";

    const head = document.createElement("div");
    head.className = "day-head";
    const date = getDateForDay(index);
    head.innerHTML = `<h3>${dayName.toUpperCase()}</h3><p>${formatLongDate(date)}</p>`;

    const list = document.createElement("ul");
    list.className = "task-list";

    dayTasks.forEach((task) => {
      const fragment = taskTemplate.content.cloneNode(true);
      const item = fragment.querySelector(".task-item");
      const checkbox = fragment.querySelector(".task-check");
      const text = fragment.querySelector(".task-text");
      const remove = fragment.querySelector(".task-delete");

      checkbox.checked = task.completed;
      text.textContent = task.title;
      if (task.completed) text.classList.add("done");

      checkbox.addEventListener("change", () => {
        task.completed = checkbox.checked;
        persistState();
        renderTasks();
        renderStats();
      });

      remove.addEventListener("click", () => {
        state.tasks = state.tasks.filter((itemTask) => itemTask.id !== task.id);
        persistState();
        renderTasks();
        renderStats();
      });

      list.append(item);
    });

    column.append(head, list);
    taskBoard.append(column);
  });
}

function addTask() {
  const title = taskTitle.value.trim();
  const day = Number(taskDay.value);
  if (!title) return;

  state.tasks.unshift({
    id: crypto.randomUUID(),
    title,
    day,
    completed: false,
  });

  taskTitle.value = "";
  persistState();
  renderTasks();
  renderStats();
}

function renderHeatmap() {
  monthRow.innerHTML = "";
  weekdayCol.innerHTML = "";
  heatGrid.innerHTML = "";

  MONTH_SHORT.forEach((label) => {
    const el = document.createElement("span");
    el.textContent = label;
    monthRow.append(el);
  });

  DAY_SHORT.forEach((label) => {
    const el = document.createElement("span");
    el.textContent = label;
    weekdayCol.append(el);
  });

  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const firstSunday = new Date(start);
  firstSunday.setDate(start.getDate() - start.getDay());

  for (let week = 0; week < 53; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const current = new Date(firstSunday);
      current.setDate(firstSunday.getDate() + week * 7 + day);

      const cell = document.createElement("button");
      cell.className = "heat-cell";
      const key = toKey(current);
      const minutes = state.logs[key] || 0;
      const level = getIntensity(minutes);

      cell.style.background = levelColor(level);
      cell.title = `${key}: ${minutes}m`;

      if (current.getFullYear() !== now.getFullYear()) {
        cell.style.opacity = "0.35";
      }

      cell.addEventListener("click", () => {
        selectedHeatDate = key;
        heatHint.textContent = `${key} • Focus time ${minutes}m`;
        selectedDateLabel.textContent = `${key} selected`;
      });

      heatGrid.append(cell);
    }
  }
}

function renderStats() {
  const weekDates = getCurrentWeekDates();
  const totals = weekDates.map((date) => state.logs[toKey(date)] || 0);
  const maxDay = Math.max(...totals, 1);
  const totalWeekMinutes = totals.reduce((sum, item) => sum + item, 0);

  sparkline.innerHTML = "";
  Array.from({ length: 24 }).forEach((_, index) => {
    const bar = document.createElement("div");
    bar.className = "spark-bar";
    const synthetic = index % 6 === 0 ? 1 : 0.1;
    bar.style.height = `${Math.max(8, synthetic * 100)}%`;
    sparkline.append(bar);
  });

  weekdayPills.innerHTML = "";
  weekDates.forEach((date, index) => {
    const pill = document.createElement("div");
    pill.className = "weekday-pill";
    pill.textContent = `${DAY_SHORT[index]}: ${totals[index]}m`;
    weekdayPills.append(pill);
  });

  weekLogs.innerHTML = "";
  weekDates.forEach((date, index) => {
    const row = document.createElement("div");
    row.className = "log-row";
    const taskCount = state.tasks.filter((task) => task.day === index && task.completed).length;
    const width = Math.max(2, (totals[index] / maxDay) * 100);
    row.innerHTML = `
      <div class="log-top"><strong>${toKey(date)}</strong><strong>${totals[index]}m • ${taskCount} tasks</strong></div>
      <div class="log-bar" style="width:${width}%"></div>
    `;
    weekLogs.append(row);
  });

  const completionTarget = state.timerConfig.work * 5;
  const completion = Math.min(100, Math.round((totalWeekMinutes / completionTarget) * 100));
  const peak = Math.round((maxDay / Math.max(state.timerConfig.work, 1)) * 100);

  setDonutValue(completionRing, completion);
  setDonutValue(peakRing, Math.min(100, peak));
  completionValue.textContent = `${completion}%`;
  peakValue.textContent = `${Math.min(100, peak)}%`;

  const completions = Object.values(state.logs).filter((minutes) => minutes >= state.timerConfig.work).length;
  weeklySummary.innerHTML = `Weekly focus total: <strong>${totalWeekMinutes}m</strong><br />Weekly completions: <strong>${completions}</strong>`;

  updateDateRange();
}

function setDonutValue(el, percent) {
  const circumference = 2 * Math.PI * 46;
  const offset = circumference - (percent / 100) * circumference;
  el.style.strokeDasharray = String(circumference);
  el.style.strokeDashoffset = String(offset);
}

function levelColor(level) {
  const palette = [
    "color-mix(in srgb, var(--chip), black 12%)",
    "color-mix(in srgb, var(--accent), black 55%)",
    "color-mix(in srgb, var(--accent), black 38%)",
    "color-mix(in srgb, var(--accent-2), black 28%)",
    "color-mix(in srgb, var(--accent-2), white 8%)",
  ];
  return palette[level];
}

function getIntensity(minutes) {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
}

function renderThemeOptions() {
  themeGrid.innerHTML = "";
  THEMES.forEach((theme) => {
    const button = document.createElement("button");
    button.className = "chip theme-option";
    button.dataset.theme = theme.id;
    button.textContent = theme.label;
    themeGrid.append(button);
  });
}

function applyTheme(themeId) {
  document.documentElement.setAttribute("data-theme", themeId === "neon" ? "" : themeId);
  document.querySelectorAll(".theme-option").forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === themeId);
  });
}

function applyDensity(density) {
  document.documentElement.setAttribute("data-density", density);
  document.querySelectorAll(".pref-chip[data-density]").forEach((button) => {
    button.classList.toggle("active", button.dataset.density === density);
  });
}

function toggleAppearance(open) {
  appearancePanel.classList.toggle("collapsed", !open);
  appearancePanel.setAttribute("aria-hidden", String(!open));
}

function populateDaySelect() {
  taskDay.innerHTML = "";
  DAYS.forEach((name, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = name;
    taskDay.append(option);
  });
  taskDay.value = String(new Date().getDay());
}

function hydrateInputs() {
  workInput.value = String(state.timerConfig.work);
  breakInput.value = String(state.timerConfig.break);
  longBreakInput.value = String(state.timerConfig.longBreak);
  longEveryInput.value = String(state.timerConfig.longEvery);
}

function updateDateRange() {
  const week = getCurrentWeekDates();
  const first = week[0];
  const last = week[6];
  dateRange.textContent = `${MONTH_SHORT[first.getMonth()].toUpperCase()} ${first.getDate()} - ${MONTH_SHORT[last.getMonth()].toUpperCase()} ${last.getDate()}, ${last.getFullYear()}`;
}

function getCurrentWeekDates() {
  const now = new Date();
  const first = new Date(now);
  first.setDate(now.getDate() - now.getDay());
  first.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return date;
  });
}

function getDateForDay(dayIndex) {
  const week = getCurrentWeekDates();
  return week[dayIndex];
}

function formatLongDate(date) {
  return `${MONTH_SHORT[date.getMonth()].toUpperCase()} ${String(date.getDate()).padStart(2, "0")}, ${date.getFullYear()}`;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function toKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      timerConfig: {
        ...defaultState.timerConfig,
        ...(parsed.timerConfig || {}),
      },
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : structuredClone(defaultState.tasks),
      logs: typeof parsed.logs === "object" && parsed.logs ? parsed.logs : {},
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveTheme(themeId) {
  localStorage.setItem(THEME_KEY, themeId);
}

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || "neon";
}

function loadPreferences() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return { density: "compact", showCompleted: true };
    return JSON.parse(raw);
  } catch {
    return { density: "compact", showCompleted: true };
  }
}

function savePreferences() {
  localStorage.setItem(PREF_KEY, JSON.stringify(preferences));
}
