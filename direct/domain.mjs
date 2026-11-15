/**
 * Доменный слой мини-трекера: чистые операции над задачами,
 * валидация ввода и расчёт итогов. Без DOM и без побочных эффектов.
 */

export const HOURS_MIN = 0.5;
export const HOURS_MAX = 24;
export const HOURS_STEP = 0.5;

export const FILTERS = Object.freeze(['all', 'active', 'done']);

const HOURS_PATTERN = /^[+-]?\d+(?:[.,]\d+)?$/;
const EPSILON = 1e-9;

/** Исходный пример из init-data.md. */
export function createInitialTasks() {
  return [
    { id: 'seed-reading', title: 'Чтение', hours: 2, done: true },
    { id: 'seed-practice', title: 'Практика', hours: 4, done: false },
    { id: 'seed-review', title: 'Повторение', hours: 2, done: false },
  ];
}

/**
 * Проверяет пользовательский ввод.
 * Возвращает { ok, value, errors, values }, где values — введённые значения
 * без изменений (интерфейс использует их, чтобы не терять данные формы).
 */
export function validateTaskInput(input = {}) {
  const errors = {};

  const rawTitle = typeof input.title === 'string' ? input.title : '';
  const title = rawTitle.trim();
  if (title === '') {
    errors.title = 'Введите название задачи.';
  }

  const rawHours =
    typeof input.hours === 'string' || typeof input.hours === 'number'
      ? String(input.hours)
      : '';
  const hoursText = rawHours.trim().replace(',', '.');
  let hours = null;

  if (hoursText === '') {
    errors.hours = 'Введите часы: пустое поле не считается нулём.';
  } else if (!HOURS_PATTERN.test(hoursText)) {
    errors.hours = 'Введите число часов, например 2 или 1,5.';
  } else {
    const parsed = Number(hoursText);
    if (!Number.isFinite(parsed)) {
      errors.hours = 'Введите число часов, например 2 или 1,5.';
    } else if (parsed < HOURS_MIN || parsed > HOURS_MAX) {
      errors.hours = `Часы должны быть от ${HOURS_MIN} до ${HOURS_MAX}.`;
    } else if (!isHalfStep(parsed)) {
      errors.hours = 'Шаг часов — 0,5: подойдут 0,5; 1; 1,5 и т. д.';
    } else {
      hours = parsed;
    }
  }

  const ok = Object.keys(errors).length === 0;

  return {
    ok,
    value: ok ? { title, hours } : null,
    errors,
    values: { title: rawTitle, hours: rawHours },
  };
}

function isHalfStep(hours) {
  const doubled = hours * 2;
  return Math.abs(doubled - Math.round(doubled)) < EPSILON;
}

/** Добавляет задачу, не изменяя исходный массив. */
export function addTask(tasks, value, id) {
  const list = Array.isArray(tasks) ? tasks : [];
  const title = typeof value?.title === 'string' ? value.title.trim() : '';
  const hours = Number(value?.hours);

  return [
    ...list,
    {
      id: String(id),
      title,
      hours,
      done: false,
    },
  ];
}

/** Переключает done у задачи по id. Возвращает новый массив. */
export function toggleTask(tasks, id) {
  const list = Array.isArray(tasks) ? tasks : [];
  return list.map((task) =>
    task.id === id ? { ...task, done: !task.done } : task,
  );
}

/** Удаляет задачу по id. Возвращает новый массив. */
export function removeTask(tasks, id) {
  const list = Array.isArray(tasks) ? tasks : [];
  return list.filter((task) => task.id !== id);
}

/** Видимый список. Фильтр не влияет на расчёт итогов. */
export function filterTasks(tasks, filter) {
  const list = Array.isArray(tasks) ? tasks : [];
  if (filter === 'active') return list.filter((task) => !task.done);
  if (filter === 'done') return list.filter((task) => task.done);
  return list.slice();
}

/**
 * Итоги по ВСЕМ задачам.
 * Прогресс = округление(100 × часы done / все часы), при нуле — 0.
 */
export function getTotals(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  let totalHours = 0;
  let doneHours = 0;

  for (const task of list) {
    const hours = Number(task?.hours);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    totalHours += hours;
    if (task.done) doneHours += hours;
  }

  const progress =
    totalHours > 0 ? Math.round((100 * doneHours) / totalHours) : 0;

  return {
    totalHours,
    doneHours,
    progress: Number.isFinite(progress) ? progress : 0,
  };
}

/** 2 → «2», 2.5 → «2,5». */
export function formatHours(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

/** 25 → «25%»; защита от NaN/Infinity. */
export function formatPercent(progress) {
  const value = Number(progress);
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value)}%`;
}
