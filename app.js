const STORAGE_KEY = "cheqlist.focus.v3";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const dayGrid = document.getElementById("dayGrid");
const dayScroll = document.getElementById("dayScroll");
const scrollLeftBtn = document.getElementById("scrollLeftBtn");
const scrollRightBtn = document.getElementById("scrollRightBtn");
const somedayList = document.getElementById("somedayList");
const thisWeekList = document.getElementById("thisWeekList");
const thisMonthList = document.getElementById("thisMonthList");
const lineTemplate = document.getElementById("lineTemplate");
const searchInput = document.getElementById("searchInput");

const homeView = document.getElementById("homeView");
const timerView = document.getElementById("timerView");
const analyticsView = document.getElementById("analyticsView");
const homeBtn = document.getElementById("homeBtn");
const timerBtn = document.getElementById("timerBtn");
const analyticsBtn = document.getElementById("analyticsBtn");

const quickAddBtn = document.getElementById("quickAddBtn");
const addTaskDialog = document.getElementById("addTaskDialog");
const addTaskForm = document.getElementById("addTaskForm");
const taskTitle = document.getElementById("taskTitle");
const taskGroup = document.getElementById("taskGroup");
const taskDay = document.getElementById("taskDay");
const daySelectWrap = document.getElementById("daySelectWrap");

const timerTaskLink = document.getElementById("timerTaskLink");
const timerTasks = document.getElementById("timerTasks");
const ringProgress = document.getElementById("ringProgress");
const timerDisplay = document.getElementById("timerDisplay");
const timerModeLabel = document.getElementById("timerModeLabel");
const startPause = document.getElementById("startPause");
const resetTimer = document.getElementById("resetTimer");
const workMinutes = document.getElementById("workMinutes");
const breakMinutes = document.getElementById("breakMinutes");
const applyTimer = document.getElementById("applyTimer");

const months = document.getElementById("months");
const weekdays = document.getElementById("weekdays");
const heatGrid = document.getElementById("heatGrid");
const selectedHeat = document.getElementById("selectedHeat");
const peakChart = document.getElementById("peakChart");
const weekdayChips = document.getElementById("weekdayChips");
const weekLog = document.getElementById("weekLog");
const weekSummary = document.getElementById("weekSummary");
const completionRing = document.getElementById("completionRing");
const peakRing = document.getElementById("peakRing");
const completionPct = document.getElementById("completionPct");
const peakPct = document.getElementById("peakPct");

let data = load();
let timer = {
  running: false,
  mode: "work",
  remaining: data.timer.work * 60,
  total: data.timer.work * 60,
  interval: null,
};

init();

function init() {
  setupDaySelect();
  syncTimerInputs();
  bindTopNav();
  bindDialog();
  bindTimer();
  bindDayScroll();
  renderHome();
  renderTaskLinkOptions();
  renderTimerTaskList();
  renderAnalytics();
  updateTimerUI();
  showView("home");
}

function bindTopNav() {
  homeBtn.addEventListener("click", () => showView("home"));
  timerBtn.addEventListener("click", () => showView("timer"));
  analyticsBtn.addEventListener("click", () => showView("analytics"));

  quickAddBtn.addEventListener("click", () => addTaskDialog.showModal());
  searchInput.addEventListener("input", renderHome);
}

function bindDayScroll() {
  scrollLeftBtn.addEventListener("click", () => {
    dayScroll.scrollBy({ left: -300, behavior: "smooth" });
  });

  scrollRightBtn.addEventListener("click", () => {
    dayScroll.scrollBy({ left: 300, behavior: "smooth" });
  });
}

function bindDialog() {
  taskGroup.addEventListener("change", () => {
    daySelectWrap.style.display = taskGroup.value === "day" ? "grid" : "none";
  });

  addTaskForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const title = taskTitle.value.trim();
    if (!title) return;

    const group = taskGroup.value;
    const task = {
      id: crypto.randomUUID(),
      title,
      completed: false,
      group,
      day: group === "day" ? Number(taskDay.value) : null,
      createdAt: Date.now(),
    };

    data.tasks.unshift(task);
    persist();

    taskTitle.value = "";
    addTaskDialog.close();
    renderAll();
  });
}

function bindTimer() {
  startPause.addEventListener("click", () => {
    if (timer.running) {
      stopTimer();
      return;
    }

    timer.running = true;
    startPause.textContent = "Pause";

    timer.interval = setInterval(() => {
      timer.remaining -= 1;
      if (timer.remaining <= 0) finishTimerPhase();
      updateTimerUI();
    }, 1000);
  });

  resetTimer.addEventListener("click", () => {
    stopTimer();
    timer.mode = "work";
    timer.total = data.timer.work * 60;
    timer.remaining = timer.total;
    updateTimerUI();
  });

  applyTimer.addEventListener("click", () => {
    data.timer.work = clamp(workMinutes.value, 1, 180, 25);
    data.timer.break = clamp(breakMinutes.value, 1, 60, 5);
    persist();

    stopTimer();
    timer.mode = "work";
    timer.total = data.timer.work * 60;
    timer.remaining = timer.total;
    updateTimerUI();
    renderAnalytics();
  });
}

function stopTimer() {
  timer.running = false;
  clearInterval(timer.interval);
  timer.interval = null;
  startPause.textContent = "Start";
}

function finishTimerPhase() {
  stopTimer();

  if (timer.mode === "work") {
    const now = new Date();
    const key = keyFor(now);
    data.logs[key] = (data.logs[key] || 0) + data.timer.work;
    data.hourly[now.getHours()] = (data.hourly[now.getHours()] || 0) + data.timer.work;

    const linkedTaskId = timerTaskLink.value;
    if (linkedTaskId) {
      const linked = data.tasks.find((task) => task.id === linkedTaskId);
      if (linked) linked.completed = true;
    }

    timer.mode = "break";
    timer.total = data.timer.break * 60;
    timer.remaining = timer.total;

    persist();
    renderAll();
  } else {
    timer.mode = "work";
    timer.total = data.timer.work * 60;
    timer.remaining = timer.total;
  }

  updateTimerUI();
}

function updateTimerUI() {
  timerDisplay.textContent = mmss(timer.remaining);
  timerModeLabel.textContent = timer.mode === "work" ? "Work" : "Break";
  const progress = 1 - timer.remaining / timer.total;
  const circumference = 2 * Math.PI * 138;
  ringProgress.style.strokeDasharray = String(circumference);
  ringProgress.style.strokeDashoffset = String(Math.max(0, circumference * (1 - progress)));
}

function showView(view) {
  homeView.classList.remove("active");
  timerView.classList.remove("active");
  analyticsView.classList.remove("active");

  homeBtn.classList.remove("active");
  timerBtn.classList.remove("active");
  analyticsBtn.classList.remove("active");

  if (view === "home") {
    homeView.classList.add("active");
    homeBtn.classList.add("active");
  }
  if (view === "timer") {
    timerView.classList.add("active");
    timerBtn.classList.add("active");
  }
  if (view === "analytics") {
    analyticsView.classList.add("active");
    analyticsBtn.classList.add("active");
  }
}

function renderHome() {
  const query = searchInput.value.trim().toLowerCase();
  dayGrid.innerHTML = "";

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const col = document.createElement("section");
    col.className = "day-col";
    if (dayIndex === new Date().getDay()) col.classList.add("today");

    const head = document.createElement("div");
    head.className = "day-head";
    head.innerHTML = `<h3>${DAYS[dayIndex]}</h3><p>${fmtDate(dayDate(dayIndex))}</p>`;

    const list = document.createElement("ul");
    list.className = "task-lines";

    data.tasks
      .filter((task) => task.group === "day" && task.day === dayIndex && match(task, query))
      .forEach((task) => {
        list.append(renderTaskItem(task));
      });

    col.append(head, list);
    dayGrid.append(col);
  }

  renderGroupList(somedayList, "someday", query);
  renderGroupList(thisWeekList, "week", query);
  renderGroupList(thisMonthList, "month", query);
}

function renderGroupList(target, group, query) {
  target.innerHTML = "";
  data.tasks
    .filter((task) => task.group === group && match(task, query))
    .forEach((task) => {
      target.append(renderTaskItem(task));
    });
}

function renderTaskItem(task) {
  const node = lineTemplate.content.cloneNode(true);
  const item = node.querySelector(".line-item");
  const check = node.querySelector("input");
  const text = node.querySelector("span");
  const remove = node.querySelector(".x");

  text.textContent = task.title;
  check.checked = task.completed;
  if (task.completed) item.classList.add("done");

  check.addEventListener("change", () => {
    task.completed = check.checked;
    persist();
    renderAll();
  });

  remove.addEventListener("click", () => {
    data.tasks = data.tasks.filter((entry) => entry.id !== task.id);
    persist();
    renderAll();
  });

  return item;
}

function renderTaskLinkOptions() {
  const current = timerTaskLink.value;
  timerTaskLink.innerHTML = "<option value=''>No linked task</option>";

  data.tasks
    .filter((task) => !task.completed)
    .forEach((task) => {
      const option = document.createElement("option");
      option.value = task.id;
      option.textContent = task.title;
      timerTaskLink.append(option);
    });

  if (current) timerTaskLink.value = current;
}

function renderTimerTaskList() {
  timerTasks.innerHTML = "";
  data.tasks
    .filter((task) => !task.completed)
    .slice(0, 8)
    .forEach((task) => {
      const item = document.createElement("li");
      item.textContent = `• ${task.title}`;
      timerTasks.append(item);
    });

  if (!timerTasks.children.length) {
    const empty = document.createElement("li");
    empty.textContent = "• No pending tasks";
    timerTasks.append(empty);
  }
}

function renderAnalytics() {
  renderHeatmap();
  renderPeakHours();
  renderWeekStats();
}

function renderHeatmap() {
  months.innerHTML = "";
  weekdays.innerHTML = "";
  heatGrid.innerHTML = "";

  MONTHS.forEach((month) => {
    const label = document.createElement("span");
    label.textContent = month;
    months.append(label);
  });

  DAYS_SHORT.forEach((day) => {
    const label = document.createElement("span");
    label.textContent = day;
    weekdays.append(label);
  });

  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const firstSunday = new Date(jan1);
  firstSunday.setDate(jan1.getDate() - jan1.getDay());

  for (let week = 0; week < 53; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(firstSunday);
      date.setDate(firstSunday.getDate() + week * 7 + day);
      const key = keyFor(date);
      const minutes = data.logs[key] || 0;

      const cell = document.createElement("button");
      cell.className = "heat-cell";
      cell.style.background = heatColor(minutes);
      if (date.getFullYear() !== now.getFullYear()) cell.style.opacity = "0.34";
      cell.title = `${key}: ${minutes}m`;
      cell.addEventListener("click", () => {
        selectedHeat.textContent = `${key} • ${minutes}m focus time`;
      });

      heatGrid.append(cell);
    }
  }
}

function heatColor(minutes) {
  if (minutes <= 0) return "#262b35";
  if (minutes < 30) return "#2f4455";
  if (minutes < 60) return "#3e6980";
  if (minutes < 120) return "#57a9be";
  return "#7df1ca";
}

function renderPeakHours() {
  peakChart.innerHTML = "";
  const max = Math.max(...Object.values(data.hourly), 1);

  for (let hour = 0; hour < 24; hour += 1) {
    const minutes = data.hourly[hour] || 0;
    const bar = document.createElement("div");
    bar.className = "hour-bar";
    bar.style.height = `${Math.max(8, (minutes / max) * 100)}%`;
    bar.title = `${hour}:00 • ${minutes}m`;
    peakChart.append(bar);
  }
}

function renderWeekStats() {
  const weekDates = currentWeek();
  const totals = weekDates.map((date) => data.logs[keyFor(date)] || 0);
  const max = Math.max(...totals, 1);
  const total = totals.reduce((sum, value) => sum + value, 0);

  weekdayChips.innerHTML = "";
  totals.forEach((minutes, index) => {
    const chip = document.createElement("div");
    chip.className = "weekday-chip";
    chip.textContent = `${DAYS_SHORT[index]}: ${minutes}m`;
    weekdayChips.append(chip);
  });

  weekLog.innerHTML = "";
  totals.forEach((minutes, index) => {
    const row = document.createElement("div");
    row.className = "week-row";
    const tasksDone = data.tasks.filter((task) => task.group === "day" && task.day === index && task.completed).length;
    row.innerHTML = `<div class="week-top"><span>${keyFor(weekDates[index])}</span><span>${minutes}m • ${tasksDone} tasks</span></div><div class="week-bar" style="width:${Math.max(1.8, (minutes / max) * 100)}%"></div>`;
    weekLog.append(row);
  });

  const goal = data.timer.work * 5;
  const completionRate = Math.min(100, Math.round((total / goal) * 100));
  const peakConcentration = Math.min(100, Math.round((max / Math.max(data.timer.work, 1)) * 100));

  setDonut(completionRing, completionRate);
  setDonut(peakRing, peakConcentration);

  completionPct.textContent = `${completionRate}%`;
  peakPct.textContent = `${peakConcentration}%`;

  const completionDays = totals.filter((minutes) => minutes >= data.timer.work).length;
  weekSummary.innerHTML = `Weekly focus total: <strong>${total}m</strong><br />Weekly completions: <strong>${completionDays}</strong>`;
}

function setDonut(circle, percent) {
  const circumference = 2 * Math.PI * 38;
  circle.style.strokeDasharray = String(circumference);
  circle.style.strokeDashoffset = String(circumference - (percent / 100) * circumference);
}

function renderAll() {
  renderHome();
  renderTaskLinkOptions();
  renderTimerTaskList();
  renderAnalytics();
}

function setupDaySelect() {
  taskDay.innerHTML = "";
  DAYS.forEach((day, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = day;
    taskDay.append(option);
  });
  taskDay.value = String(new Date().getDay());
}

function syncTimerInputs() {
  workMinutes.value = String(data.timer.work);
  breakMinutes.value = String(data.timer.break);
}

function dayDate(dayIndex) {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  sunday.setHours(0, 0, 0, 0);
  const date = new Date(sunday);
  date.setDate(sunday.getDate() + dayIndex);
  return date;
}

function currentWeek() {
  const sunday = dayDate(0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + index);
    return date;
  });
}

function fmtDate(date) {
  return `${MONTHS[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}, ${date.getFullYear()}`;
}

function keyFor(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mmss(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function match(task, query) {
  return !query || task.title.toLowerCase().includes(query);
}

function load() {
  const fallback = {
    timer: { work: 25, break: 5 },
    tasks: [
      { id: crypto.randomUUID(), title: "Deep work sprint", group: "day", day: 0, completed: false, createdAt: Date.now() },
      { id: crypto.randomUUID(), title: "Ship homepage polish", group: "day", day: 1, completed: false, createdAt: Date.now() },
      { id: crypto.randomUUID(), title: "Review week priorities", group: "week", day: null, completed: false, createdAt: Date.now() },
      { id: crypto.randomUUID(), title: "Finish product draft", group: "month", day: null, completed: false, createdAt: Date.now() },
      { id: crypto.randomUUID(), title: "Learn system design notes", group: "someday", day: null, completed: false, createdAt: Date.now() },
    ],
    logs: {},
    hourly: {},
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      timer: { ...fallback.timer, ...(parsed.timer || {}) },
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : fallback.tasks,
      logs: parsed.logs && typeof parsed.logs === "object" ? parsed.logs : {},
      hourly: parsed.hourly && typeof parsed.hourly === "object" ? parsed.hourly : {},
    };
  } catch {
    return fallback;
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
