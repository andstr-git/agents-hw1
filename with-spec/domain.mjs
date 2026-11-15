export const HOURS_MIN = 0.5;
export const HOURS_MAX = 24;
export const HOURS_STEP = 0.5;

export const FILTERS = Object.freeze(["all", "active", "done"]);

const EPSILON = 1e-9;

export function createSeedTasks() {
  return [
    { id: "seed-reading", title: "Чтение", hours: 2, done: true },
    { id: "seed-practice", title: "Практика", hours: 4, done: false },
    { id: "seed-review", title: "Повторение", hours: 2, done: false },
  ];
}

export function cloneTasks(tasks) {
  return tasks.map((task) => ({ ...task }));
}

let fallbackIdCounter = 0;

export function createTaskId() {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  fallbackIdCounter += 1;
  return `task-${Date.now().toString(36)}-${fallbackIdCounter}`;
}

export function validateTitle(rawTitle) {
  const value = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (value === "") {
    return { ok: false, error: "Введите название задачи" };
  }
  return { ok: true, value };
}

export function validateHours(rawHours) {
  let value;

  if (typeof rawHours === "number") {
    value = rawHours;
  } else if (typeof rawHours === "string") {
    const trimmed = rawHours.trim();
    if (trimmed === "") {
      return { ok: false, error: "Укажите часы" };
    }
    value = Number(trimmed);
  } else {
    return { ok: false, error: "Часы должны быть числом" };
  }

  if (!Number.isFinite(value)) {
    return { ok: false, error: "Часы должны быть числом" };
  }
  if (value < HOURS_MIN || value > HOURS_MAX) {
    return { ok: false, error: "Часы должны быть от 0,5 до 24" };
  }
  if (Math.abs(value * 2 - Math.round(value * 2)) > EPSILON) {
    return { ok: false, error: "Часы должны быть кратны 0,5" };
  }

  return { ok: true, value };
}

export function validateTaskInput(input = {}) {
  const title = validateTitle(input.title);
  const hours = validateHours(input.hours);
  const errors = {};

  if (!title.ok) {
    errors.title = title.error;
  }
  if (!hours.ok) {
    errors.hours = hours.error;
  }

  const ok = title.ok && hours.ok;
  return {
    ok,
    errors,
    value: ok ? { title: title.value, hours: hours.value } : null,
  };
}

export function createTask(validInput, idFactory = createTaskId) {
  return {
    id: idFactory(),
    title: String(validInput.title).trim(),
    hours: validInput.hours,
    done: false,
  };
}

export function addTask(tasks, task) {
  return [...tasks, { ...task }];
}

export function removeTask(tasks, id) {
  return tasks.filter((task) => task.id !== id);
}

export function toggleTask(tasks, id) {
  return tasks.map((task) =>
    task.id === id ? { ...task, done: !task.done } : { ...task },
  );
}

export function filterTasks(tasks, filter) {
  if (filter === "active") {
    return tasks.filter((task) => !task.done);
  }
  if (filter === "done") {
    return tasks.filter((task) => task.done);
  }
  return [...tasks];
}

function roundHours(value) {
  return Math.round(value * 10) / 10;
}

export function summarize(tasks) {
  let totalHours = 0;
  let doneHours = 0;

  for (const task of Array.isArray(tasks) ? tasks : []) {
    const hours = Number(task && task.hours);
    if (!Number.isFinite(hours)) {
      continue;
    }
    totalHours += hours;
    if (task.done) {
      doneHours += hours;
    }
  }

  totalHours = roundHours(totalHours);
  doneHours = roundHours(doneHours);

  let progress = totalHours > 0 ? Math.round((100 * doneHours) / totalHours) : 0;
  if (!Number.isFinite(progress)) {
    progress = 0;
  }

  return {
    totalHours,
    doneHours,
    progress: Math.min(100, Math.max(0, progress)),
  };
}

export function isTask(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if (typeof value.id !== "string" || value.id.trim() === "") {
    return false;
  }
  if (typeof value.title !== "string" || value.title.trim() === "") {
    return false;
  }
  if (typeof value.done !== "boolean") {
    return false;
  }
  return validateHours(value.hours).ok;
}

export function sanitizeTasks(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  if (!value.every(isTask)) {
    return null;
  }
  const ids = new Set(value.map((task) => task.id));
  if (ids.size !== value.length) {
    return null;
  }
  return value.map((task) => ({
    id: task.id,
    title: task.title.trim(),
    hours: task.hours,
    done: task.done,
  }));
}


