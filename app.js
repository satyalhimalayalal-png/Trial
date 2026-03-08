const STORAGE_KEY = "cheqlist.focus.v4";
const HOME_RANGE_BEFORE = 365;
const HOME_RANGE_AFTER = 365;
const WEEKDAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH_LONG = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

const ACCENT_MAP = {
  pink: "#ff0050",
  blue: "#2f8bff",
  green: "#33b56f",
  amber: "#d08a2e",
  rose: "#cf2f78",
};

const dom = {
  searchInput: document.getElementById("searchInput"),
  homeBtn: document.getElementById("homeBtn"),
  clockBtn: document.getElementById("clockBtn"),
  statsBtn: document.getElementById("statsBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  homeView: document.getElementById("homeView"),
  clockView: document.getElementById("clockView"),
  statsView: document.getElementById("statsView"),

  dayScroll: document.getElementById("dayScroll"),
  dayStrip: document.getElementById("dayStrip"),
  shiftLeftDay: document.getElementById("shiftLeftDay"),
  shiftLeftWeek: document.getElementById("shiftLeftWeek"),
  shiftRightDay: document.getElementById("shiftRightDay"),
  shiftRightWeek: document.getElementById("shiftRightWeek"),

  weekList: document.getElementById("weekList"),
  monthList: document.getElementById("monthList"),
  yearList: document.getElementById("yearList"),

  clockDayName: document.getElementById("clockDayName"),
  clockDayDate: document.getElementById("clockDayDate"),
  clockPrevDay: document.getElementById("clockPrevDay"),
  clockToday: document.getElementById("clockToday"),
  clockNextDay: document.getElementById("clockNextDay"),
  modePomodoro: document.getElementById("modePomodoro"),
  modeStopwatch: document.getElementById("modeStopwatch"),
  clockDisplay: document.getElementById("clockDisplay"),
  clockStartPause: document.getElementById("clockStartPause"),
  clockStopLog: document.getElementById("clockStopLog"),
  clockReset: document.getElementById("clockReset"),
  sessionMinutes: document.getElementById("sessionMinutes"),
  activeTaskInfo: document.getElementById("activeTaskInfo"),
  clockListHeading: document.getElementById("clockListHeading"),
  clockDayList: document.getElementById("clockDayList"),

  dailyTotals: document.getElementById("dailyTotals"),
  hourGraph: document.getElementById("hourGraph"),
  months: document.getElementById("months"),
  weekdays: document.getElementById("weekdays"),
  heatGrid: document.getElementById("heatGrid"),
  selectedHeat: document.getElementById("selectedHeat"),
  recentLogs: document.getElementById("recentLogs"),
  weeklySummary: document.getElementById("weeklySummary"),

  settingsPanel: document.getElementById("settingsPanel"),
  accentChoices: document.getElementById("accentChoices"),
  columnChoices: document.getElementById("columnChoices"),
  textChoices: document.getElementById("textChoices"),
  spacingChoices: document.getElementById("spacingChoices"),
  bulletChoices: document.getElementById("bulletChoices"),
  startWeekChoices: document.getElementById("startWeekChoices"),
  themeChoices: document.getElementById("themeChoices"),
  showCompletedToggle: document.getElementById("showCompletedToggle"),
  showLinesToggle: document.getElementById("showLinesToggle"),
  celebrationsToggle: document.getElementById("celebrationsToggle"),

  recurrenceMenu: document.getElementById("recurrenceMenu"),
  taskTemplate: document.getElementById("taskTemplate"),
};

let state = loadState();
let view = "home";
let homeDayLists = [];
let recurrenceTargetTaskId = null;
let scrollRaf = null;
let clockInterval = null;

init();

function init() {
  applySettings();
  bindGlobalEvents();
  buildHomeColumns();
  renderAll();
  switchView("home");
}

function bindGlobalEvents() {
  dom.homeBtn.addEventListener("click", () => switchView("home"));
  dom.clockBtn.addEventListener("click", () => switchView("clock"));
  dom.statsBtn.addEventListener("click", () => switchView("stats"));

  dom.settingsBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSettingsPanel();
  });

  dom.searchInput.addEventListener("input", () => {
    renderVisibleHomeDayLists();
    renderLowerLists();
  });

  dom.shiftLeftDay.addEventListener("click", () => shiftDays(-1));
  dom.shiftLeftWeek.addEventListener("click", () => shiftDays(-7));
  dom.shiftRightDay.addEventListener("click", () => shiftDays(1));
  dom.shiftRightWeek.addEventListener("click", () => shiftDays(7));

  dom.dayScroll.addEventListener("scroll", () => {
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      renderVisibleHomeDayLists();
    });
  });

  bindClockControls();
  bindSettingsControls();

  document.addEventListener("click", (event) => {
    if (!dom.settingsPanel.contains(event.target) && !dom.settingsBtn.contains(event.target)) {
      hideSettingsPanel();
    }

    if (!dom.recurrenceMenu.contains(event.target) && !event.target.closest(".task-recur")) {
      hideRecurrenceMenu();
    }
  });

  dom.recurrenceMenu.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-recur]");
    if (!button || !recurrenceTargetTaskId) return;

    const task = state.tasks.find((entry) => entry.id === recurrenceTargetTaskId);
    if (!task) return;

    task.recurrence = button.dataset.recur;
    persistState();
    hideRecurrenceMenu();
    renderAll();
  });
}

function bindClockControls() {
  dom.clockPrevDay.addEventListener("click", () => {
    state.clockDateKey = keyForDate(addDays(parseKey(state.clockDateKey), -1));
    renderClockDay();
  });

  dom.clockNextDay.addEventListener("click", () => {
    state.clockDateKey = keyForDate(addDays(parseKey(state.clockDateKey), 1));
    renderClockDay();
  });

  dom.clockToday.addEventListener("click", () => {
    state.clockDateKey = todayKey();
    renderClockDay();
  });

  dom.modePomodoro.addEventListener("click", () => setClockMode("pomodoro"));
  dom.modeStopwatch.addEventListener("click", () => setClockMode("stopwatch"));

  dom.clockStartPause.addEventListener("click", () => {
    if (state.clock.running) {
      pauseClock();
    } else {
      startClock();
    }
  });

  dom.clockStopLog.addEventListener("click", () => {
    if (state.clock.mode === "pomodoro") {
      cancelPomodoro();
    } else {
      stopStopwatchAndLog();
    }
  });

  dom.clockReset.addEventListener("click", () => {
    resetClock();
  });

  dom.sessionMinutes.addEventListener("change", () => {
    state.clock.sessionMinutes = clampNumber(dom.sessionMinutes.value, 1, 180, 25);
    persistState();
    if (state.clock.mode === "pomodoro" && !state.clock.running) {
      state.clock.remainingSec = state.clock.sessionMinutes * 60;
      updateClockDisplay();
    }
  });
}

function bindSettingsControls() {
  dom.accentChoices.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-accent]");
    if (!button) return;
    state.settings.accent = button.dataset.accent;
    persistState();
    applySettings();
    renderSettingsSelections();
  });

  dom.columnChoices.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-columns]");
    if (!button) return;
    state.settings.columns = Number(button.dataset.columns);
    persistState();
    applySettings();
    centerHomeAroundStartRule();
    renderSettingsSelections();
  });

  dom.textChoices.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-text]");
    if (!button) return;
    state.settings.textSize = button.dataset.text;
    persistState();
    applySettings();
    renderSettingsSelections();
  });

  dom.spacingChoices.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-spacing]");
    if (!button) return;
    state.settings.spacing = button.dataset.spacing;
    persistState();
    applySettings();
    renderSettingsSelections();
  });

  dom.bulletChoices.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-bullet]");
    if (!button) return;
    state.settings.bulletStyle = button.dataset.bullet;
    persistState();
    applySettings();
    renderSettingsSelections();
  });

  dom.startWeekChoices.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-start]");
    if (!button) return;
    state.settings.startWeekOn = button.dataset.start;
    persistState();
    centerHomeAroundStartRule();
    renderSettingsSelections();
  });

  dom.themeChoices.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-theme]");
    if (!button) return;
    state.settings.theme = button.dataset.theme;
    persistState();
    applySettings();
    renderSettingsSelections();
  });

  dom.showCompletedToggle.addEventListener("change", () => {
    state.settings.showCompleted = dom.showCompletedToggle.checked;
    persistState();
    renderAll();
  });

  dom.showLinesToggle.addEventListener("change", () => {
    state.settings.showLines = dom.showLinesToggle.checked;
    persistState();
    applySettings();
    renderSettingsSelections();
  });

  dom.celebrationsToggle.addEventListener("change", () => {
    state.settings.celebrations = dom.celebrationsToggle.checked;
    persistState();
  });
}

function switchView(nextView) {
  view = nextView;

  dom.homeView.classList.toggle("active", nextView === "home");
  dom.clockView.classList.toggle("active", nextView === "clock");
  dom.statsView.classList.toggle("active", nextView === "stats");

  dom.homeBtn.classList.toggle("active", nextView === "home");
  dom.clockBtn.classList.toggle("active", nextView === "clock");
  dom.statsBtn.classList.toggle("active", nextView === "stats");

  if (nextView === "home") {
    renderVisibleHomeDayLists();
  }

  if (nextView === "clock") {
    renderClockDay();
  }

  if (nextView === "stats") {
    renderStats();
  }
}

function toggleSettingsPanel() {
  const isHidden = dom.settingsPanel.classList.contains("hidden");
  if (isHidden) {
    dom.settingsPanel.classList.remove("hidden");
    dom.settingsPanel.setAttribute("aria-hidden", "false");
    dom.settingsBtn.classList.add("active");
  } else {
    hideSettingsPanel();
  }
}

function hideSettingsPanel() {
  dom.settingsPanel.classList.add("hidden");
  dom.settingsPanel.setAttribute("aria-hidden", "true");
  dom.settingsBtn.classList.remove("active");
}

function hideRecurrenceMenu() {
  dom.recurrenceMenu.classList.add("hidden");
  dom.recurrenceMenu.setAttribute("aria-hidden", "true");
  recurrenceTargetTaskId = null;
}

function showRecurrenceMenu(taskId, anchorButton) {
  recurrenceTargetTaskId = taskId;
  const rect = anchorButton.getBoundingClientRect();
  dom.recurrenceMenu.style.left = `${rect.left - 90}px`;
  dom.recurrenceMenu.style.top = `${rect.bottom + 6}px`;
  dom.recurrenceMenu.classList.remove("hidden");
  dom.recurrenceMenu.setAttribute("aria-hidden", "false");
}

function applySettings() {
  const accent = ACCENT_MAP[state.settings.accent] || ACCENT_MAP.pink;
  document.documentElement.style.setProperty("--accent", accent);
  document.body.dataset.theme = state.settings.theme;

  document.body.classList.toggle("text-lg", state.settings.textSize === "lg");
  document.body.classList.toggle("spacing-cozy", state.settings.spacing === "cozy");
  document.body.classList.toggle("bullet-dash", state.settings.bulletStyle === "dash");
  document.body.classList.toggle("hide-lines", !state.settings.showLines);

  const dayWidth = state.settings.columns === 3 ? "33.333vw" : "20vw";
  document.documentElement.style.setProperty("--day-col-width", dayWidth);

  renderSettingsSelections();
}

function renderSettingsSelections() {
  markActive(dom.accentChoices, "data-accent", state.settings.accent);
  markActive(dom.columnChoices, "data-columns", String(state.settings.columns));
  markActive(dom.textChoices, "data-text", state.settings.textSize);
  markActive(dom.spacingChoices, "data-spacing", state.settings.spacing);
  markActive(dom.bulletChoices, "data-bullet", state.settings.bulletStyle);
  markActive(dom.startWeekChoices, "data-start", state.settings.startWeekOn);
  markActive(dom.themeChoices, "data-theme", state.settings.theme);

  dom.showCompletedToggle.checked = state.settings.showCompleted;
  dom.showLinesToggle.checked = state.settings.showLines;
  dom.celebrationsToggle.checked = state.settings.celebrations;
}

function markActive(container, attr, value) {
  container.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.getAttribute(attr) === value);
  });
}

function buildHomeColumns() {
  dom.dayStrip.innerHTML = "";
  homeDayLists = [];

  const baseDate = startOfDay(new Date());
  for (let offset = -HOME_RANGE_BEFORE; offset <= HOME_RANGE_AFTER; offset += 1) {
    const date = addDays(baseDate, offset);
    const dateKey = keyForDate(date);

    const col = document.createElement("section");
    col.className = "day-col";

    const head = document.createElement("div");
    head.className = "day-head";
    if (dateKey === todayKey()) head.classList.add("today");
    head.innerHTML = `<h3>${WEEKDAY_NAMES[date.getDay()]}</h3><p>${formatTopDate(date)}</p>`;

    const list = document.createElement("ul");
    list.className = "task-lines";
    list.dataset.scope = "day";
    list.dataset.dateKey = dateKey;

    list.addEventListener("click", (event) => {
      if (event.target.closest(".task-item") || event.target.closest(".inline-entry")) return;
      startInlineEntry(list, { scope: "day", dateKey });
    });

    col.append(head, list);
    dom.dayStrip.append(col);

    homeDayLists.push({ dateKey, list, date });
  }

  centerHomeAroundStartRule();
}

function centerHomeAroundStartRule() {
  const today = startOfDay(new Date());
  const anchorDate = state.settings.startWeekOn === "yesterday" ? addDays(today, -1) : today;
  const anchorKey = keyForDate(anchorDate);
  const anchorIndex = homeDayLists.findIndex((entry) => entry.dateKey === anchorKey);
  if (anchorIndex < 0) return;

  const dayWidth = getDayWidth();
  const leadColumns = state.settings.columns === 3 ? 1 : 2;
  dom.dayScroll.scrollLeft = Math.max(0, (anchorIndex - leadColumns) * dayWidth);
  renderVisibleHomeDayLists();
}

function shiftDays(days) {
  const width = getDayWidth();
  dom.dayScroll.scrollBy({ left: width * days, behavior: "smooth" });
}

function getDayWidth() {
  const col = dom.dayStrip.querySelector(".day-col");
  if (!col) return 300;
  return col.getBoundingClientRect().width;
}

function renderAll() {
  renderVisibleHomeDayLists();
  renderLowerLists();
  renderClockDay();
  renderStats();
}

function renderVisibleHomeDayLists() {
  if (!homeDayLists.length) return;

  const query = dom.searchInput.value.trim().toLowerCase();
  const width = getDayWidth() || 1;
  const start = Math.max(0, Math.floor(dom.dayScroll.scrollLeft / width) - 4);
  const end = Math.min(homeDayLists.length - 1, Math.ceil((dom.dayScroll.scrollLeft + dom.dayScroll.clientWidth) / width) + 4);

  for (let index = start; index <= end; index += 1) {
    const entry = homeDayLists[index];
    renderTaskList(entry.list, { scope: "day", dateKey: entry.dateKey, query });
  }
}

function renderLowerLists() {
  const query = dom.searchInput.value.trim().toLowerCase();
  renderTaskList(dom.weekList, { scope: "week", query });
  renderTaskList(dom.monthList, { scope: "month", query });
  renderTaskList(dom.yearList, { scope: "year", query });

  [
    { list: dom.weekList, scope: "week" },
    { list: dom.monthList, scope: "month" },
    { list: dom.yearList, scope: "year" },
  ].forEach(({ list, scope }) => {
    if (list.dataset.bound === "1") return;
    list.dataset.bound = "1";
    list.addEventListener("click", (event) => {
      if (event.target.closest(".task-item") || event.target.closest(".inline-entry")) return;
      startInlineEntry(list, { scope });
    });
  });
}

function renderClockDay() {
  const date = parseKey(state.clockDateKey);
  dom.clockDayName.textContent = WEEKDAY_NAMES[date.getDay()];
  dom.clockDayDate.textContent = `${MONTH_LONG[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}, ${date.getFullYear()}`;
  dom.clockListHeading.textContent = WEEKDAY_NAMES[date.getDay()];

  renderTaskList(dom.clockDayList, { scope: "day", dateKey: state.clockDateKey, query: "" });

  if (dom.clockDayList.dataset.bound !== "1") {
    dom.clockDayList.dataset.bound = "1";
    dom.clockDayList.addEventListener("click", (event) => {
      if (event.target.closest(".task-item") || event.target.closest(".inline-entry")) return;
      startInlineEntry(dom.clockDayList, { scope: "day", dateKey: state.clockDateKey });
    });
  }

  updateClockDisplay();
}

function renderTaskList(listElement, context) {
  const existingInline = listElement.querySelector(".inline-entry");
  listElement.innerHTML = "";

  const items = collectTasksForContext(context);
  items.forEach(({ task, dateKey }) => {
    listElement.append(createTaskItem(task, dateKey));
  });

  if (existingInline) {
    listElement.prepend(existingInline);
  }
}

function collectTasksForContext(context) {
  const query = context.query || "";
  let tasksForView = [];

  if (context.scope === "day") {
    const date = parseKey(context.dateKey);

    state.tasks.forEach((task) => {
      if (task.scope !== "day") return;
      if (!taskOccursOn(task, date, context.dateKey)) return;
      if (!state.settings.showCompleted && isTaskCompleted(task, context.dateKey)) return;
      if (query && !task.title.toLowerCase().includes(query)) return;
      tasksForView.push({ task, dateKey: context.dateKey });
    });
  } else {
    state.tasks.forEach((task) => {
      if (task.scope !== context.scope) return;
      if (!state.settings.showCompleted && task.completed) return;
      if (query && !task.title.toLowerCase().includes(query)) return;
      tasksForView.push({ task, dateKey: null });
    });
  }

  return tasksForView;
}

function createTaskItem(task, dateKey) {
  const node = dom.taskTemplate.content.cloneNode(true);
  const li = node.querySelector(".task-item");
  const check = node.querySelector(".task-check");
  const text = node.querySelector(".task-text");
  const time = node.querySelector(".task-time");
  const recur = node.querySelector(".task-recur");
  const remove = node.querySelector(".task-delete");

  text.textContent = task.title;

  const completed = isTaskCompleted(task, dateKey);
  li.classList.toggle("done", completed);
  li.classList.toggle("selected", task.id === state.selectedTaskId);

  const taskSeconds = task.timeSpentSec || 0;
  time.textContent = taskSeconds > 0 ? formatDuration(taskSeconds) : "";

  if (task.scope !== "day") {
    recur.style.visibility = "hidden";
  } else {
    recur.classList.toggle("active", task.recurrence !== "none");
  }

  check.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleTaskCompletion(task, dateKey);
  });

  recur.addEventListener("click", (event) => {
    event.stopPropagation();
    showRecurrenceMenu(task.id, recur);
  });

  remove.addEventListener("click", (event) => {
    event.stopPropagation();
    state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
    if (state.selectedTaskId === task.id) {
      state.selectedTaskId = null;
    }
    persistState();
    renderAll();
  });

  li.addEventListener("click", () => {
    state.selectedTaskId = task.id;
    persistState();
    updateActiveTaskInfo();
    renderVisibleHomeDayLists();
    renderClockDay();
  });

  return li;
}

function startInlineEntry(listElement, context) {
  if (listElement.querySelector(".inline-entry")) return;

  const li = document.createElement("li");
  li.className = "inline-entry";

  const marker = document.createElement("span");
  marker.className = "task-check";

  const input = document.createElement("input");
  input.placeholder = "Write on line...";

  li.append(marker, input);
  listElement.prepend(li);
  input.focus();

  const commit = () => {
    const title = input.value.trim();
    if (!title) {
      li.remove();
      return;
    }

    const task = {
      id: crypto.randomUUID(),
      title,
      scope: context.scope,
      dateKey: context.scope === "day" ? context.dateKey : null,
      createdAt: Date.now(),
      completed: false,
      recurrence: "none",
      completedByDate: {},
      timeSpentSec: 0,
      timeByDate: {},
    };

    state.tasks.unshift(task);
    persistState();
    renderAll();
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }

    if (event.key === "Escape") {
      li.remove();
    }
  });

  input.addEventListener("blur", () => {
    commit();
  });
}

function toggleTaskCompletion(task, dateKey) {
  if (task.scope === "day" && task.recurrence !== "none") {
    task.completedByDate = task.completedByDate || {};
    task.completedByDate[dateKey] = !task.completedByDate[dateKey];

    if (task.completedByDate[dateKey] && state.settings.celebrations) {
      pulseCelebration();
    }
  } else {
    task.completed = !task.completed;
    if (task.completed && state.settings.celebrations) {
      pulseCelebration();
    }
  }

  persistState();
  renderAll();
}

function pulseCelebration() {
  document.body.classList.remove("flash");
  window.requestAnimationFrame(() => {
    document.body.classList.add("flash");
  });
}

function isTaskCompleted(task, dateKey) {
  if (task.scope === "day" && task.recurrence !== "none") {
    return !!(task.completedByDate && task.completedByDate[dateKey]);
  }
  return !!task.completed;
}

function taskOccursOn(task, date, dateKey) {
  if (task.recurrence === "none") return task.dateKey === dateKey;

  const origin = parseKey(task.dateKey);
  if (date < origin) return false;

  if (task.recurrence === "daily") return true;
  if (task.recurrence === "weekdays") return date.getDay() >= 1 && date.getDay() <= 5;
  if (task.recurrence === "weekly") return date.getDay() === origin.getDay();
  return false;
}

function setClockMode(mode) {
  if (state.clock.running) {
    clearInterval(clockInterval);
    clockInterval = null;
    state.clock.running = false;
  }

  state.clock.mode = mode;
  if (mode === "pomodoro") {
    state.clock.remainingSec = state.clock.sessionMinutes * 60;
  } else {
    state.clock.elapsedSec = 0;
  }

  persistState();
  updateClockDisplay();
}

function startClock() {
  if (state.clock.running) return;

  state.clock.running = true;
  clockInterval = setInterval(() => {
    if (state.clock.mode === "pomodoro") {
      state.clock.remainingSec -= 1;
      if (state.clock.remainingSec <= 0) {
        state.clock.remainingSec = 0;
        completePomodoroSession();
      }
    } else {
      state.clock.elapsedSec += 1;
    }

    updateClockDisplay();
  }, 1000);

  updateClockDisplay();
}

function pauseClock() {
  if (!state.clock.running) return;
  state.clock.running = false;
  clearInterval(clockInterval);
  clockInterval = null;
  updateClockDisplay();
}

function completePomodoroSession() {
  pauseClock();
  const loggedSeconds = state.clock.sessionMinutes * 60;
  logSeconds(state.clockDateKey, state.selectedTaskId, loggedSeconds);
  state.clock.remainingSec = state.clock.sessionMinutes * 60;
  persistState();
  renderAll();
}

function cancelPomodoro() {
  pauseClock();
  state.clock.remainingSec = state.clock.sessionMinutes * 60;
  updateClockDisplay();
}

function stopStopwatchAndLog() {
  const seconds = state.clock.elapsedSec;
  pauseClock();

  if (seconds > 0) {
    logSeconds(state.clockDateKey, state.selectedTaskId, seconds);
  }

  state.clock.elapsedSec = 0;
  persistState();
  renderAll();
}

function resetClock() {
  pauseClock();
  if (state.clock.mode === "pomodoro") {
    state.clock.remainingSec = state.clock.sessionMinutes * 60;
  } else {
    state.clock.elapsedSec = 0;
  }
  updateClockDisplay();
}

function logSeconds(dateKey, taskId, seconds) {
  if (!seconds || seconds <= 0) return;

  state.logsByDate[dateKey] = (state.logsByDate[dateKey] || 0) + seconds;

  const hour = new Date().getHours();
  state.logsByHour[hour] = (state.logsByHour[hour] || 0) + seconds;

  if (taskId) {
    const task = state.tasks.find((entry) => entry.id === taskId);
    if (task) {
      task.timeSpentSec = (task.timeSpentSec || 0) + seconds;
      task.timeByDate = task.timeByDate || {};
      task.timeByDate[dateKey] = (task.timeByDate[dateKey] || 0) + seconds;
    }
  }

  persistState();
}

function updateClockDisplay() {
  const value = state.clock.mode === "pomodoro" ? state.clock.remainingSec : state.clock.elapsedSec;
  dom.clockDisplay.textContent = formatHHMMSS(Math.max(0, value));

  dom.modePomodoro.classList.toggle("active", state.clock.mode === "pomodoro");
  dom.modeStopwatch.classList.toggle("active", state.clock.mode === "stopwatch");

  dom.clockStartPause.textContent = state.clock.running ? "Pause" : "Start";
  dom.clockStopLog.textContent = state.clock.mode === "pomodoro" ? "Cancel" : "Stop & Log";
  dom.sessionMinutes.value = String(state.clock.sessionMinutes);

  updateActiveTaskInfo();
}

function updateActiveTaskInfo() {
  const task = state.tasks.find((entry) => entry.id === state.selectedTaskId);
  if (!task) {
    dom.activeTaskInfo.textContent = "No selected task";
    return;
  }

  const spent = task.timeSpentSec ? ` • ${formatDuration(task.timeSpentSec)}` : "";
  dom.activeTaskInfo.textContent = `${task.title}${spent}`;
}

function renderStats() {
  renderDailyTotals();
  renderHourGraph();
  renderHeatmap();
  renderRecentLogs();
}

function renderDailyTotals() {
  const week = currentWeekDates();
  const daySeconds = week.map((date) => state.logsByDate[keyForDate(date)] || 0);
  const max = Math.max(...daySeconds, 1);

  dom.dailyTotals.innerHTML = "";
  week.forEach((date, index) => {
    const card = document.createElement("div");
    card.className = "day-total-box";

    const label = document.createElement("p");
    label.className = "label";
    label.textContent = WEEKDAY_SHORT[index];

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(1, (daySeconds[index] / max) * 100)}%`;
    bar.append(fill);

    const time = document.createElement("p");
    time.textContent = formatHoursMinutes(daySeconds[index]);

    card.append(label, bar, time);
    dom.dailyTotals.append(card);
  });
}

function renderHourGraph() {
  const svg = dom.hourGraph;
  svg.innerHTML = "";

  const width = 1000;
  const height = 220;
  const values = Array.from({ length: 24 }, (_, hour) => state.logsByHour[hour] || 0);
  const max = Math.max(...values, 1);

  const points = values.map((value, index) => {
    const x = (index / 23) * width;
    const y = height - (value / max) * (height - 24) - 12;
    return { x, y };
  });

  const areaPath = [`M 0 ${height}`, ...points.map((point) => `L ${point.x} ${point.y}`), `L ${width} ${height} Z`].join(" ");
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
  area.setAttribute("class", "graph-area");
  area.setAttribute("d", areaPath);

  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.setAttribute("class", "graph-line");
  line.setAttribute("d", linePath);

  svg.append(area, line);

  [0, 6, 12, 18, 23].forEach((hour) => {
    const point = points[hour];
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("class", "graph-dot");
    dot.setAttribute("cx", String(point.x));
    dot.setAttribute("cy", String(point.y));
    dot.setAttribute("r", "3");
    svg.append(dot);
  });
}

function renderHeatmap() {
  dom.months.innerHTML = "";
  dom.weekdays.innerHTML = "";
  dom.heatGrid.innerHTML = "";

  MONTH_SHORT.forEach((month) => {
    const span = document.createElement("span");
    span.textContent = month;
    dom.months.append(span);
  });

  WEEKDAY_SHORT.forEach((day) => {
    const span = document.createElement("span");
    span.textContent = day;
    dom.weekdays.append(span);
  });

  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const firstSunday = addDays(jan1, -jan1.getDay());

  for (let week = 0; week < 53; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(firstSunday, week * 7 + day);
      const key = keyForDate(date);
      const seconds = state.logsByDate[key] || 0;

      const cell = document.createElement("button");
      cell.className = "heat-cell";
      cell.style.background = heatColor(seconds);
      if (date.getFullYear() !== now.getFullYear()) cell.style.opacity = "0.34";

      cell.addEventListener("click", () => {
        dom.selectedHeat.textContent = `${key} • ${formatHoursMinutes(seconds)}`;
      });

      dom.heatGrid.append(cell);
    }
  }
}

function heatColor(seconds) {
  if (seconds <= 0) return "#252b35";
  if (seconds < 1800) return "#304250";
  if (seconds < 3600) return "#3f677c";
  if (seconds < 7200) return "#58a8bd";
  return "#7df2ca";
}

function renderRecentLogs() {
  const week = currentWeekDates();
  const totals = week.map((date) => state.logsByDate[keyForDate(date)] || 0);
  const max = Math.max(...totals, 1);

  dom.recentLogs.innerHTML = "";
  totals.forEach((seconds, index) => {
    const row = document.createElement("div");
    row.className = "log-row";

    const completedTasks = countCompletedOnDate(keyForDate(week[index]));
    row.innerHTML = `
      <div class="log-head"><span>${keyForDate(week[index])}</span><span>${formatHoursMinutes(seconds)} • ${completedTasks} tasks</span></div>
      <div class="log-bar" style="width:${Math.max(2, (seconds / max) * 100)}%"></div>
    `;

    dom.recentLogs.append(row);
  });

  const total = totals.reduce((sum, value) => sum + value, 0);
  dom.weeklySummary.textContent = `Weekly focus total: ${formatHoursMinutes(total)}`;
}

function countCompletedOnDate(dateKey) {
  const date = parseKey(dateKey);
  let total = 0;

  state.tasks.forEach((task) => {
    if (task.scope !== "day") return;
    if (!taskOccursOn(task, date, dateKey)) return;
    if (isTaskCompleted(task, dateKey)) total += 1;
  });

  return total;
}

function formatTopDate(date) {
  return `${MONTH_LONG[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}, ${date.getFullYear()}`;
}

function formatHoursMinutes(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatHHMMSS(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function currentWeekDates() {
  const today = startOfDay(new Date());
  const sunday = addDays(today, -today.getDay());
  return Array.from({ length: 7 }, (_, index) => addDays(sunday, index));
}

function todayKey() {
  return keyForDate(startOfDay(new Date()));
}

function keyForDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function loadState() {
  const fallback = {
    tasks: [],
    selectedTaskId: null,
    clockDateKey: todayKey(),
    settings: {
      accent: "pink",
      columns: 7,
      textSize: "sm",
      spacing: "compact",
      bulletStyle: "dot",
      startWeekOn: "today",
      theme: "dark",
      showCompleted: true,
      showLines: true,
      celebrations: true,
    },
    clock: {
      mode: "pomodoro",
      running: false,
      sessionMinutes: 25,
      remainingSec: 25 * 60,
      elapsedSec: 0,
    },
    logsByDate: {},
    logsByHour: {},
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : fallback.tasks,
      selectedTaskId: parsed.selectedTaskId || null,
      clockDateKey: parsed.clockDateKey || fallback.clockDateKey,
      settings: { ...fallback.settings, ...(parsed.settings || {}) },
      clock: {
        ...fallback.clock,
        ...(parsed.clock || {}),
        running: false,
      },
      logsByDate: parsed.logsByDate && typeof parsed.logsByDate === "object" ? parsed.logsByDate : {},
      logsByHour: parsed.logsByHour && typeof parsed.logsByHour === "object" ? parsed.logsByHour : {},
    };
  } catch {
    return fallback;
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
