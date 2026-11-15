import {
  addTask,
  createInitialTasks,
  filterTasks,
  formatHours,
  formatPercent,
  getTotals,
  removeTask,
  toggleTask,
  validateTaskInput,
} from './domain.mjs';

const STORAGE_KEY = 'study-task-tracker:v1';
const STORAGE_IO_ERROR =
  'Хранилище браузера недоступно: задачи сохранятся только до перезагрузки страницы.';
const STORAGE_DATA_ERROR =
  'Не удалось прочитать сохранённые задачи. Показан исходный пример.';

const els = {
  totalHours: document.querySelector('#total-hours'),
  doneHours: document.querySelector('#done-hours'),
  progressPercent: document.querySelector('#progress-percent'),
  progressBar: document.querySelector('#progress-bar'),
  progressFill: document.querySelector('#progress-fill'),
  list: document.querySelector('#task-list'),
  empty: document.querySelector('#empty-state'),
  meta: document.querySelector('#list-meta'),
  form: document.querySelector('#task-form'),
  title: document.querySelector('#title'),
  hours: document.querySelector('#hours'),
  titleError: document.querySelector('#title-error'),
  hoursError: document.querySelector('#hours-error'),
  storageNote: document.querySelector('#storage-note'),
  reset: document.querySelector('#reset-example'),
  filters: [...document.querySelectorAll('[data-filter]')],
};

let filter = 'all';
let idCounter = 0;
let tasks = loadTasks() ?? createInitialTasks();

render();

/* ------------------------------- Данные -------------------------------- */

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  idCounter += 1;
  return `task-${Date.now().toString(36)}-${idCounter}`;
}

function normalizeStoredTask(item) {
  if (!item || typeof item !== 'object') return null;

  const result = validateTaskInput({ title: item.title, hours: item.hours });
  if (!result.ok) return null;

  return {
    id: typeof item.id === 'string' && item.id !== '' ? item.id : createId(),
    title: result.value.title,
    hours: result.value.hours,
    done: item.done === true,
  };
}

function loadTasks() {
  let raw = null;

  try {
    raw = globalThis.localStorage.getItem(STORAGE_KEY);
  } catch {
    showStorageWarning(STORAGE_IO_ERROR);
    return null;
  }

  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Ожидался массив задач');

    const normalized = parsed.map(normalizeStoredTask).filter(Boolean);
    if (parsed.length > 0 && normalized.length === 0) {
      throw new Error('Нет корректных задач');
    }
    return normalized;
  } catch {
    showStorageWarning(STORAGE_DATA_ERROR);
    return null;
  }
}

function saveTasks() {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    hideStorageWarning();
  } catch {
    showStorageWarning(STORAGE_IO_ERROR);
  }
}

function showStorageWarning(message) {
  els.storageNote.textContent = message;
  els.storageNote.hidden = false;
}

function hideStorageWarning() {
  els.storageNote.hidden = true;
  els.storageNote.textContent = '';
}

/* ------------------------------- Отрисовка ----------------------------- */

function render() {
  const totals = getTotals(tasks);

  els.totalHours.textContent = `${formatHours(totals.totalHours)} ч`;
  els.doneHours.textContent = `${formatHours(totals.doneHours)} ч`;
  els.progressPercent.textContent = formatPercent(totals.progress);
  els.progressBar.setAttribute('aria-valuenow', String(totals.progress));
  els.progressFill.style.width = `${totals.progress}%`;

  const visible = filterTasks(tasks, filter);

  els.meta.textContent =
    tasks.length === 0 ? 'Задач пока нет' : `Показано: ${visible.length} из ${tasks.length}`;

  els.list.replaceChildren(...visible.map(renderTask));
  els.list.hidden = visible.length === 0;

  els.empty.hidden = visible.length > 0;
  els.empty.textContent =
    tasks.length === 0
      ? 'Задач пока нет. Добавьте первую задачу в форме ниже.'
      : 'В этом фильтре задач нет.';

  for (const button of els.filters) {
    button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
  }
}

function renderTask(task) {
  const item = document.createElement('li');
  item.className = task.done ? 'task task--done' : 'task';
  item.dataset.id = task.id;

  const label = document.createElement('label');
  label.className = 'task__label';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task__checkbox';
  checkbox.id = `task-check-${task.id}`;
  checkbox.dataset.action = 'toggle';
  checkbox.checked = task.done;

  const title = document.createElement('span');
  title.className = 'task__title';
  title.textContent = task.title;

  label.append(checkbox, title);

  const hours = document.createElement('span');
  hours.className = 'task__hours';
  hours.textContent = `${formatHours(task.hours)} ч`;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'task__delete';
  remove.dataset.action = 'delete';
  remove.textContent = 'Удалить';
  remove.setAttribute('aria-label', `Удалить задачу «${task.title}»`);

  item.append(label, hours, remove);
  return item;
}

/* ------------------------------ События -------------------------------- */

for (const button of els.filters) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    render();
  });
}

els.list.addEventListener('change', (event) => {
  const checkbox = event.target.closest('input[data-action="toggle"]');
  if (!checkbox) return;

  const item = checkbox.closest('li');
  const taskId = item?.dataset.id;
  if (!taskId) return;

  tasks = toggleTask(tasks, taskId);
  saveTasks();
  render();

  const nextCheckbox = document.getElementById(`task-check-${taskId}`);
  if (nextCheckbox) {
    nextCheckbox.focus();
  } else {
    focusActiveFilter();
  }
});

els.list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action="delete"]');
  if (!button) return;

  const item = button.closest('li');
  const taskId = item?.dataset.id;
  if (!taskId) return;

  tasks = removeTask(tasks, taskId);
  saveTasks();
  render();

  const nextCheckbox = els.list.querySelector('input[type="checkbox"]');
  if (nextCheckbox) {
    nextCheckbox.focus();
  } else if (tasks.length === 0) {
    els.title.focus();
  } else {
    focusActiveFilter();
  }
});

els.form.addEventListener('submit', (event) => {
  event.preventDefault();

  const result = validateTaskInput({
    title: els.title.value,
    hours: els.hours.value,
  });

  setFieldError(els.title, els.titleError, result.errors.title);
  setFieldError(els.hours, els.hoursError, result.errors.hours);

  if (!result.ok) {
    // Значения в полях не очищаем: пользователь исправляет их на месте.
    if (result.errors.title) {
      els.title.focus();
    } else {
      els.hours.focus();
    }
    return;
  }

  tasks = addTask(tasks, result.value, createId());
  saveTasks();

  els.form.reset();
  setFieldError(els.title, els.titleError, undefined);
  setFieldError(els.hours, els.hoursError, undefined);
  render();
  els.title.focus();
});

els.title.addEventListener('input', () => {
  setFieldError(els.title, els.titleError, undefined);
});

els.hours.addEventListener('input', () => {
  setFieldError(els.hours, els.hoursError, undefined);
});

els.reset.addEventListener('click', () => {
  const confirmed = globalThis.confirm(
    'Вернуть три исходные задачи и сбросить все отметки и добавленные задачи?',
  );
  if (!confirmed) return;

  tasks = createInitialTasks();
  filter = 'all';
  els.form.reset();
  setFieldError(els.title, els.titleError, undefined);
  setFieldError(els.hours, els.hoursError, undefined);
  saveTasks();
  render();
  els.title.focus();
});

function setFieldError(input, errorElement, message) {
  if (message) {
    errorElement.textContent = message;
    errorElement.hidden = false;
    input.setAttribute('aria-invalid', 'true');
  } else {
    errorElement.textContent = '';
    errorElement.hidden = true;
    input.removeAttribute('aria-invalid');
  }
}

function focusActiveFilter() {
  const active = els.filters.find((button) => button.getAttribute('aria-pressed') === 'true');
  (active ?? els.title).focus();
}
