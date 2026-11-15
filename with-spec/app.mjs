import {
  FILTERS,
  addTask,
  createSeedTasks,
  createTask,
  filterTasks,
  removeTask,
  sanitizeTasks,
  summarize,
  toggleTask,
  validateTaskInput,
} from "./domain.mjs";

export const STORAGE_KEY = "task-tracker.tasks.v1";

const PROBE_KEY = "__task_tracker_probe__";

export const FILTER_LABELS = Object.freeze({
  all: "Все",
  active: "Активные",
  done: "Готовые",
});

export const STORAGE_NOTICES = Object.freeze({
  unavailable:
    "Сохранение недоступно — задачи хранятся в памяти до закрытия страницы.",
  corrupt: "Сохранённые данные повреждены — загружен исходный пример.",
});

export function formatHours(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 10) / 10;
  return String(rounded).replace(".", ",");
}

export function buildViewModel(tasks, filter = "all") {
  const safeTasks = Array.isArray(tasks) ? tasks.map((task) => ({ ...task })) : [];
  const activeFilter = FILTERS.includes(filter) ? filter : "all";
  const visibleTasks = filterTasks(safeTasks, activeFilter).map((task) => ({
    ...task,
  }));
  const summary = summarize(safeTasks);
  const isEmpty = safeTasks.length === 0;
  const isFilteredEmpty = !isEmpty && visibleTasks.length === 0;

  let emptyMessage = "";
  if (isEmpty) {
    emptyMessage = "Пока нет задач. Добавьте первую задачу.";
  } else if (isFilteredEmpty) {
    emptyMessage = "В этом фильтре нет задач.";
  }

  return {
    tasks: visibleTasks,
    filter: activeFilter,
    filterLabel: FILTER_LABELS[activeFilter],
    totalTasks: safeTasks.length,
    visibleTasks: visibleTasks.length,
    totalHours: summary.totalHours,
    doneHours: summary.doneHours,
    progress: summary.progress,
    isEmpty,
    isFilteredEmpty,
    emptyMessage,
    totalHoursText: `${formatHours(summary.totalHours)} ч`,
    doneHoursText: `${formatHours(summary.doneHours)} ч`,
    progressText: `${summary.progress} %`,
    summaryText: `${formatHours(summary.totalHours)} ч всего, ${formatHours(
      summary.doneHours,
    )} ч выполнено, ${summary.progress} %`,
  };
}

export function probeStorage(storage) {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(PROBE_KEY, "1");
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadTasks(storage) {
  if (!probeStorage(storage)) {
    return { tasks: createSeedTasks(), notice: "unavailable" };
  }

  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { tasks: createSeedTasks(), notice: "unavailable" };
  }

  if (raw === null || raw === undefined) {
    return { tasks: createSeedTasks(), notice: null };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { tasks: createSeedTasks(), notice: "corrupt" };
  }

  const tasks = sanitizeTasks(parsed);
  if (!tasks) {
    return { tasks: createSeedTasks(), notice: "corrupt" };
  }

  return { tasks, notice: null };
}

export function saveTasks(storage, tasks) {
  if (!probeStorage(storage)) {
    return { ok: false, notice: "unavailable" };
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return { ok: true, notice: null };
  } catch {
    return { ok: false, notice: "unavailable" };
  }
}

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function startApp() {
  const elements = {
    form: document.querySelector("#task-form"),
    title: document.querySelector("#task-title"),
    hours: document.querySelector("#task-hours"),
    titleError: document.querySelector("#title-error"),
    hoursError: document.querySelector("#hours-error"),
    storageNotice: document.querySelector("#storage-notice"),
    list: document.querySelector("#task-list"),
    emptyState: document.querySelector("#empty-state"),
    totalHours: document.querySelector("#total-hours"),
    doneHours: document.querySelector("#done-hours"),
    progressValue: document.querySelector("#progress-value"),
    progressBar: document.querySelector("#progress-bar"),
    filterButtons: Array.from(document.querySelectorAll("[data-filter]")),
  };

  const storage = getBrowserStorage();
  const loaded = loadTasks(storage);

  const state = {
    tasks: loaded.tasks,
    filter: "all",
  };

  function showStorageNotice(notice) {
    if (!notice || !elements.storageNotice) {
      return;
    }
    elements.storageNotice.textContent = STORAGE_NOTICES[notice] ?? "";
    elements.storageNotice.hidden = false;
  }

  function setFieldError(field, message) {
    const input = field === "title" ? elements.title : elements.hours;
    const error = field === "title" ? elements.titleError : elements.hoursError;
    if (!input || !error) {
      return;
    }
    if (message) {
      input.setAttribute("aria-invalid", "true");
      error.textContent = message;
      error.hidden = false;
    } else {
      input.removeAttribute("aria-invalid");
      error.textContent = "";
      error.hidden = true;
    }
  }

  function renderTask(task) {
    const item = document.createElement("li");
    item.className = task.done ? "task task--done" : "task";
    item.dataset.id = task.id;

    const label = document.createElement("label");
    label.className = "task__check";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.className = "task__checkbox";
    checkbox.setAttribute(
      "aria-label",
      task.done
        ? `Снять отметку с задачи «${task.title}»`
        : `Отметить задачу «${task.title}» выполненной`,
    );
    checkbox.addEventListener("change", () => {
      state.tasks = toggleTask(state.tasks, task.id);
      render();
      persist();
    });

    const title = document.createElement("span");
    title.className = "task__title";
    title.textContent = task.title;

    label.append(checkbox, title);

    const hours = document.createElement("span");
    hours.className = "task__hours";
    hours.textContent = `${formatHours(task.hours)} ч`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "task__delete";
    removeButton.textContent = "Удалить";
    removeButton.setAttribute("aria-label", `Удалить задачу «${task.title}»`);
    removeButton.addEventListener("click", () => {
      state.tasks = removeTask(state.tasks, task.id);
      render();
      persist();
      if (elements.title) {
        elements.title.focus();
      }
    });

    item.append(label, hours, removeButton);
    return item;
  }

  function render() {
    const view = buildViewModel(state.tasks, state.filter);

    if (elements.totalHours) {
      elements.totalHours.textContent = view.totalHoursText;
    }
    if (elements.doneHours) {
      elements.doneHours.textContent = view.doneHoursText;
    }
    if (elements.progressValue) {
      elements.progressValue.textContent = view.progressText;
    }
    if (elements.progressBar) {
      elements.progressBar.value = view.progress;
      elements.progressBar.textContent = view.progressText;
    }
    if (elements.list) {
      elements.list.replaceChildren(...view.tasks.map(renderTask));
    }
    if (elements.emptyState) {
      elements.emptyState.textContent = view.emptyMessage;
      elements.emptyState.hidden = view.tasks.length > 0;
    }

    for (const button of elements.filterButtons) {
      const isActive = button.dataset.filter === view.filter;
      button.setAttribute("aria-pressed", String(isActive));
      button.classList.toggle("is-active", isActive);
    }
  }

  function persist() {
    const result = saveTasks(storage, state.tasks);
    if (!result.ok) {
      showStorageNotice(result.notice);
    }
  }

  if (loaded.notice) {
    showStorageNotice(loaded.notice);
  }

  for (const button of elements.filterButtons) {
    button.addEventListener("click", () => {
      state.filter = FILTERS.includes(button.dataset.filter)
        ? button.dataset.filter
        : "all";
      render();
    });
  }

  if (elements.form) {
    elements.form.addEventListener("submit", (event) => {
      event.preventDefault();

      const result = validateTaskInput({
        title: elements.title ? elements.title.value : "",
        hours: elements.hours ? elements.hours.value : "",
      });

      setFieldError("title", result.errors.title);
      setFieldError("hours", result.errors.hours);

      if (!result.ok) {
        const firstInvalid = result.errors.title
          ? elements.title
          : elements.hours;
        if (firstInvalid) {
          firstInvalid.focus();
        }
        return;
      }

      const task = createTask(result.value);
      state.tasks = addTask(state.tasks, task);

      elements.form.reset();
      setFieldError("title", undefined);
      setFieldError("hours", undefined);

      render();
      persist();

      if (elements.title) {
        elements.title.focus();
      }
    });
  }

  render();
}

if (typeof document !== "undefined") {
  startApp();
}
