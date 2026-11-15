import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HOURS_MAX,
  HOURS_MIN,
  addTask,
  createInitialTasks,
  filterTasks,
  formatHours,
  formatPercent,
  getTotals,
  removeTask,
  toggleTask,
  validateTaskInput,
} from '../domain.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function byTitle(tasks, title) {
  return tasks.find((task) => task.title === title);
}

test('T1 · Исходный пример: 3 задачи, 8 ч, выполнено 2 ч, прогресс 25% по часам', () => {
  const tasks = createInitialTasks();

  assert.equal(tasks.length, 3);
  assert.deepEqual(
    tasks.map(({ title, hours, done }) => [title, hours, done]),
    [
      ['Чтение', 2, true],
      ['Практика', 4, false],
      ['Повторение', 2, false],
    ],
  );

  const totals = getTotals(tasks);
  assert.equal(totals.totalHours, 8);
  assert.equal(totals.doneHours, 2);
  assert.equal(totals.progress, 25);
  // 25% считается по часам, а не по числу задач (1/3 → 33%).
  assert.notEqual(totals.progress, Math.round((100 * 1) / 3));
});

test('T2 · Статус: «Практика» готова → 6 из 8 ч и 75%', () => {
  const before = createInitialTasks();
  const practiceId = byTitle(before, 'Практика').id;

  assert.equal(byTitle(before, 'Практика').done, false);
  assert.deepEqual(getTotals(before), {
    totalHours: 8,
    doneHours: 2,
    progress: 25,
  });

  const after = toggleTask(before, practiceId);

  assert.notEqual(after, before, 'toggleTask возвращает новый массив');
  assert.equal(byTitle(before, 'Практика').done, false, 'исходные данные не мутируются');
  assert.equal(byTitle(after, 'Практика').done, true);
  assert.equal(byTitle(after, 'Чтение').done, true);
  assert.equal(byTitle(after, 'Повторение').done, false);

  const totals = getTotals(after);
  assert.equal(totals.totalHours, 8);
  assert.equal(totals.doneHours, 6);
  assert.equal(totals.progress, 75);
  assert.equal(formatHours(totals.doneHours), '6');
  assert.equal(formatPercent(totals.progress), '75%');

  // Повторное переключение возвращает исходное состояние.
  const reverted = toggleTask(after, practiceId);
  assert.deepEqual(getTotals(reverted), {
    totalHours: 8,
    doneHours: 2,
    progress: 25,
  });
});

test('T3 · Фильтр «активные»: только «Практика» и «Повторение», прогресс 25%', () => {
  const tasks = createInitialTasks();

  const active = filterTasks(tasks, 'active');
  assert.deepEqual(
    active.map((task) => task.title),
    ['Практика', 'Повторение'],
  );
  assert.equal(tasks.length, 3, 'фильтр не меняет исходный список');
  assert.deepEqual(filterTasks(tasks, 'done').map((task) => task.title), ['Чтение']);
  assert.equal(filterTasks(tasks, 'all').length, 3);
  assert.equal(filterTasks(tasks, 'unknown').length, 3);

  const totals = getTotals(tasks);
  assert.equal(totals.totalHours, 8);
  assert.equal(totals.doneHours, 2);
  assert.equal(totals.progress, 25);

  // Итоги по видимому списку не должны подменять общий расчёт.
  const visibleTotals = getTotals(active);
  assert.equal(visibleTotals.totalHours, 6);
  assert.notEqual(totals.progress, visibleTotals.progress);
});

test('T4 · Ошибки ввода: задача не добавляется, значения сохраняются', () => {
  const rejected = [
    { title: '', hours: '2', field: 'title' },
    { title: '   ', hours: '2', field: 'title' },
    { title: 'Задача', hours: '', field: 'hours' },
    { title: 'Задача', hours: '   ', field: 'hours' },
    { title: 'Задача', hours: '-1', field: 'hours' },
    { title: 'Задача', hours: '-0.5', field: 'hours' },
    { title: 'Задача', hours: '0', field: 'hours' },
    { title: 'Задача', hours: '0.25', field: 'hours' },
    { title: 'Задача', hours: '1.25', field: 'hours' },
    { title: 'Задача', hours: '24.5', field: 'hours' },
    { title: 'Задача', hours: 'abc', field: 'hours' },
  ];

  for (const { title, hours, field } of rejected) {
    const result = validateTaskInput({ title, hours });

    assert.equal(result.ok, false, `должно быть отклонено: ${title} / ${hours}`);
    assert.equal(result.value, null);
    assert.ok(result.errors[field], `нет ошибки в поле ${field}: ${title} / ${hours}`);
    assert.equal(typeof result.errors[field], 'string');
    assert.notEqual(result.errors[field].trim(), '');
    // Введённые значения возвращаются без изменений — форма может их сохранить.
    assert.equal(result.values.title, title);
    assert.equal(result.values.hours, hours);
  }

  const emptyHours = validateTaskInput({ title: 'Задача', hours: '' });
  assert.equal(emptyHours.value, null);
  assert.ok(emptyHours.errors.hours, 'пустые часы не должны считаться нулём');

  // Границы 0,5–24 и шаг 0,5 принимаются.
  const accepted = [
    { title: 'Минимум', hours: '0.5', expected: 0.5 },
    { title: 'Полчаса с запятой', hours: '0,5', expected: 0.5 },
    { title: 'Полтора', hours: '1,5', expected: 1.5 },
    { title: 'Шаг', hours: '2.5', expected: 2.5 },
    { title: 'Почти максимум', hours: '23.5', expected: 23.5 },
    { title: 'Максимум', hours: '24', expected: 24 },
  ];

  for (const { title, hours, expected } of accepted) {
    const result = validateTaskInput({ title, hours });
    assert.equal(result.ok, true, `должно быть принято: ${title} / ${hours}`);
    assert.deepEqual(result.errors, {});
    assert.equal(result.value.title, title);
    assert.equal(result.value.hours, expected);
  }

  assert.equal(HOURS_MIN, 0.5);
  assert.equal(HOURS_MAX, 24);

  const trimmed = validateTaskInput({ title: '  Чтение  ', hours: '2' });
  assert.equal(trimmed.ok, true);
  assert.equal(trimmed.value.title, 'Чтение');

  // Корректная задача действительно добавляется.
  const tasks = addTask(createInitialTasks(), trimmed.value, 'new-task');
  assert.equal(tasks.length, 4);
  assert.deepEqual(tasks.at(-1), {
    id: 'new-task',
    title: 'Чтение',
    hours: 2,
    done: false,
  });
});

test('T5 · Пустое состояние: 0 ч, 0%, нет NaN/Infinity', () => {
  let tasks = createInitialTasks();

  for (const task of [...tasks]) {
    tasks = removeTask(tasks, task.id);
  }

  assert.deepEqual(tasks, []);

  const totals = getTotals(tasks);
  assert.equal(totals.totalHours, 0);
  assert.equal(totals.doneHours, 0);
  assert.equal(totals.progress, 0);
  assert.ok(Number.isFinite(totals.totalHours));
  assert.ok(Number.isFinite(totals.doneHours));
  assert.ok(Number.isFinite(totals.progress));
  assert.equal(formatHours(totals.totalHours), '0');
  assert.equal(formatPercent(totals.progress), '0%');
  assert.doesNotMatch(
    `${formatHours(totals.totalHours)} ${formatPercent(totals.progress)}`,
    /NaN|Infinity/,
  );

  assert.deepEqual(filterTasks(tasks, 'all'), []);
  assert.deepEqual(filterTasks(tasks, 'active'), []);
  assert.deepEqual(filterTasks(tasks, 'done'), []);
  assert.equal(removeTask(tasks, 'missing-id').length, 0, 'удаление неизвестного id безопасно');
  assert.equal(getTotals(null).progress, 0);
});

test('Офлайн-структура: локальные файлы, подписанные поля и кнопки', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');

  assert.match(html, /<html lang="ru">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /<link rel="stylesheet" href="styles\.css"/);
  assert.match(html, /<script type="module" src="app\.mjs"><\/script>/);
  assert.match(html, /<label for="title">/);
  assert.match(html, /<label for="hours">/);
  assert.match(html, /<button class="primary" type="submit">/);
  assert.match(html, /data-filter="all"/);
  assert.match(html, /data-filter="active"/);
  assert.match(html, /data-filter="done"/);
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']https?:/i, 'нет внешних ресурсов');
  assert.doesNotMatch(html, /cdn/i, 'нет CDN');
});
