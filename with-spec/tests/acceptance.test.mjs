import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HOURS_MAX,
  HOURS_MIN,
  addTask,
  createSeedTasks,
  createTask,
  filterTasks,
  removeTask,
  summarize,
  toggleTask,
  validateHours,
  validateTaskInput,
  validateTitle,
} from "../domain.mjs";

import {
  STORAGE_KEY,
  buildViewModel,
  formatHours,
  loadTasks,
  saveTasks,
} from "../app.mjs";

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function createThrowingStorage() {
  const fail = () => {
    throw new Error("Storage is unavailable");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

test("исходный пример: три задачи, 8 ч всего, 2 ч выполнено, 25 %", () => {
  const tasks = createSeedTasks();

  assert.equal(tasks.length, 3);
  assert.deepEqual(
    tasks.map(({ title, hours, done }) => ({ title, hours, done })),
    [
      { title: "Чтение", hours: 2, done: true },
      { title: "Практика", hours: 4, done: false },
      { title: "Повторение", hours: 2, done: false },
    ],
  );

  const summary = summarize(tasks);
  assert.equal(summary.totalHours, 8);
  assert.equal(summary.doneHours, 2);
  assert.equal(summary.progress, 25);
});

test("createSeedTasks возвращает независимые массивы и объекты", () => {
  const first = createSeedTasks();
  const second = createSeedTasks();

  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);

  first[0].title = "Изменено";
  first.pop();

  assert.equal(second.length, 3);
  assert.equal(second[0].title, "Чтение");
});

test("название после trim должно быть непустым", () => {
  assert.equal(validateTitle("").ok, false);
  assert.equal(validateTitle("   ").ok, false);
  assert.equal(validateTitle("  Конспект  ").ok, true);
  assert.equal(validateTitle("  Конспект  ").value, "Конспект");
});

test("часы: пустое значение отклоняется и не равно нулю", () => {
  assert.equal(validateHours("").ok, false);
  assert.equal(validateHours("   ").ok, false);
  assert.equal(validateHours(null).ok, false);
  assert.equal(validateHours(undefined).ok, false);
});

test("часы: границы 0,5 и 24 допустимы", () => {
  assert.deepEqual(validateHours("0.5"), { ok: true, value: 0.5 });
  assert.deepEqual(validateHours(0.5), { ok: true, value: 0.5 });
  assert.deepEqual(validateHours("24"), { ok: true, value: 24 });
  assert.deepEqual(validateHours(HOURS_MIN), { ok: true, value: HOURS_MIN });
  assert.deepEqual(validateHours(HOURS_MAX), { ok: true, value: HOURS_MAX });
});

test("часы: 0,4 и 24,5 вне диапазона", () => {
  assert.equal(validateHours(0.4).ok, false);
  assert.equal(validateHours(24.5).ok, false);
  assert.equal(validateHours(-1).ok, false);
});

test("часы: шаг 0,5 обязателен", () => {
  assert.equal(validateHours(1.3).ok, false);
  assert.equal(validateHours(2.2).ok, false);
  assert.equal(validateHours(1.5).ok, true);
  assert.equal(validateHours("1.5").ok, true);
});

test("часы: нечисловое значение отклоняется", () => {
  assert.equal(validateHours("abc").ok, false);
  assert.equal(validateHours("2ч").ok, false);
});

test("ошибки валидации адресованы полям title и hours", () => {
  const emptyTitle = validateTaskInput({ title: "", hours: 2 });
  assert.equal(emptyTitle.ok, false);
  assert.equal(typeof emptyTitle.errors.title, "string");
  assert.equal(emptyTitle.errors.hours, undefined);

  const emptyHours = validateTaskInput({ title: "Задача", hours: "" });
  assert.equal(emptyHours.ok, false);
  assert.equal(typeof emptyHours.errors.hours, "string");
  assert.equal(emptyHours.errors.title, undefined);

  const both = validateTaskInput({ title: "  ", hours: -1 });
  assert.equal(both.ok, false);
  assert.equal(typeof both.errors.title, "string");
  assert.equal(typeof both.errors.hours, "string");

  const valid = validateTaskInput({ title: "  Конспект ", hours: "1.5" });
  assert.deepEqual(valid, {
    ok: true,
    errors: {},
    value: { title: "Конспект", hours: 1.5 },
  });
});

test("createTask назначает уникальные id и статус done=false", () => {
  let counter = 0;
  const idFactory = () => `id-${++counter}`;
  const first = createTask({ title: "  Конспект ", hours: 1.5 }, idFactory);
  const second = createTask({ title: "Практика", hours: 2 }, idFactory);

  assert.deepEqual(first, {
    id: "id-1",
    title: "Конспект",
    hours: 1.5,
    done: false,
  });
  assert.notEqual(first.id, second.id);
  assert.equal(second.done, false);
});

test("добавление, удаление и переключение не мутируют исходный массив", () => {
  const tasks = createSeedTasks();
  const snapshot = JSON.parse(JSON.stringify(tasks));

  const added = addTask(tasks, {
    id: "new",
    title: "Конспект",
    hours: 1.5,
    done: false,
  });
  assert.equal(added.length, 4);
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks, snapshot);

  const removed = removeTask(tasks, "seed-review");
  assert.deepEqual(
    removed.map((task) => task.id),
    ["seed-reading", "seed-practice"],
  );
  assert.deepEqual(tasks, snapshot);

  const toggled = toggleTask(tasks, "seed-practice");
  assert.equal(toggled.find((task) => task.id === "seed-practice").done, true);
  assert.equal(toggled.find((task) => task.id === "seed-reading").done, true);
  assert.deepEqual(tasks, snapshot);
});

test("переключение дважды возвращает исходный статус", () => {
  const tasks = createSeedTasks();
  const once = toggleTask(tasks, "seed-practice");
  const twice = toggleTask(once, "seed-practice");

  assert.equal(once.find((task) => task.id === "seed-practice").done, true);
  assert.equal(twice.find((task) => task.id === "seed-practice").done, false);
});

test("фильтры all, active и done", () => {
  const tasks = createSeedTasks();

  assert.deepEqual(
    filterTasks(tasks, "all").map((task) => task.title),
    ["Чтение", "Практика", "Повторение"],
  );
  assert.deepEqual(
    filterTasks(tasks, "active").map((task) => task.title),
    ["Практика", "Повторение"],
  );
  assert.deepEqual(
    filterTasks(tasks, "done").map((task) => task.title),
    ["Чтение"],
  );

  const filtered = filterTasks(tasks, "all");
  assert.notEqual(filtered, tasks);
});

test("фильтр не влияет на итоги по всем задачам", () => {
  const tasks = createSeedTasks();
  const visible = filterTasks(tasks, "active");
  const summary = summarize(tasks);

  assert.equal(visible.length, 2);
  assert.equal(summary.totalHours, 8);
  assert.equal(summary.doneHours, 2);
  assert.equal(summary.progress, 25);
});

test("прогресс 6 из 8 ч равен 75 %", () => {
  const tasks = toggleTask(createSeedTasks(), "seed-practice");
  const summary = summarize(tasks);

  assert.equal(summary.doneHours, 6);
  assert.equal(summary.totalHours, 8);
  assert.equal(summary.progress, 75);
});

test("прогресс 2 из 6 ч округляется до 33 %", () => {
  const tasks = removeTask(createSeedTasks(), "seed-review");
  const summary = summarize(tasks);

  assert.equal(summary.doneHours, 2);
  assert.equal(summary.totalHours, 6);
  assert.equal(summary.progress, 33);
});

test("пустой список даёт 0 ч, 0 ч выполнено и 0 % без NaN и Infinity", () => {
  const summary = summarize([]);

  assert.deepEqual(summary, { totalHours: 0, doneHours: 0, progress: 0 });
  assert.equal(Number.isFinite(summary.totalHours), true);
  assert.equal(Number.isFinite(summary.doneHours), true);
  assert.equal(Number.isFinite(summary.progress), true);
});

test("итоги игнорируют нефинитные часы", () => {
  const summary = summarize([
    { id: "a", title: "A", hours: Number.NaN, done: true },
    { id: "b", title: "B", hours: 2, done: false },
  ]);

  assert.deepEqual(summary, { totalHours: 2, doneHours: 0, progress: 0 });
});

test("view-model исходного примера: список, 8 ч, 2 ч, 25 %", () => {
  const view = buildViewModel(createSeedTasks(), "all");

  assert.equal(view.tasks.length, 3);
  assert.deepEqual(
    view.tasks.map((task) => task.title),
    ["Чтение", "Практика", "Повторение"],
  );
  assert.equal(view.filter, "all");
  assert.equal(view.totalTasks, 3);
  assert.equal(view.totalHours, 8);
  assert.equal(view.doneHours, 2);
  assert.equal(view.progress, 25);
  assert.equal(view.isEmpty, false);
  assert.equal(view.totalHoursText, "8 ч");
  assert.equal(view.doneHoursText, "2 ч");
  assert.equal(view.progressText, "25 %");
});

test("view-model с фильтром «активные» не меняет базу расчёта", () => {
  const tasks = createSeedTasks();
  const view = buildViewModel(tasks, "active");

  assert.deepEqual(
    view.tasks.map((task) => task.title),
    ["Практика", "Повторение"],
  );
  assert.equal(view.totalTasks, 3);
  assert.equal(view.totalHours, 8);
  assert.equal(view.doneHours, 2);
  assert.equal(view.progress, 25);
});

test("view-model с фильтром «готовые» показывает только выполненные", () => {
  const view = buildViewModel(createSeedTasks(), "done");

  assert.deepEqual(
    view.tasks.map((task) => task.title),
    ["Чтение"],
  );
  assert.equal(view.totalHours, 8);
  assert.equal(view.progress, 25);
});

test("неизвестный фильтр трактуется как «все»", () => {
  const view = buildViewModel(createSeedTasks(), "unknown");

  assert.equal(view.filter, "all");
  assert.equal(view.tasks.length, 3);
});

test("view-model не мутирует исходный массив задач", () => {
  const tasks = createSeedTasks();
  const snapshot = JSON.parse(JSON.stringify(tasks));

  buildViewModel(tasks, "active");

  assert.deepEqual(tasks, snapshot);
});

test("пустой view-model: 0 ч, 0 %, конечные значения и сообщение", () => {
  const view = buildViewModel([], "all");

  assert.deepEqual(view.tasks, []);
  assert.equal(view.totalHours, 0);
  assert.equal(view.doneHours, 0);
  assert.equal(view.progress, 0);
  assert.equal(view.isEmpty, true);
  assert.equal(view.progressText, "0 %");
  assert.equal(Number.isFinite(view.progress), true);
  assert.equal(Number.isFinite(view.totalHours), true);
  assert.ok(view.emptyMessage.length > 0);
});

test("view-model показывает отдельное сообщение для пустого фильтра", () => {
  const view = buildViewModel(
    [{ id: "a", title: "A", hours: 2, done: false }],
    "done",
  );

  assert.equal(view.tasks.length, 0);
  assert.equal(view.isEmpty, false);
  assert.equal(view.isFilteredEmpty, true);
  assert.ok(view.emptyMessage.length > 0);
});

test("formatHours выводит часы с запятой и без лишних нулей", () => {
  assert.equal(formatHours(2), "2");
  assert.equal(formatHours(1.5), "1,5");
  assert.equal(formatHours(0), "0");
  assert.equal(formatHours(Number.NaN), "0");
});

test("loadTasks при пустом хранилище отдаёт исходный пример", () => {
  const storage = createMemoryStorage();
  const result = loadTasks(storage);

  assert.equal(result.notice, null);
  assert.equal(result.tasks.length, 3);
  assert.equal(summarize(result.tasks).progress, 25);
});

test("saveTasks и loadTasks сохраняют и восстанавливают задачи", () => {
  const storage = createMemoryStorage();
  const tasks = addTask(createSeedTasks(), {
    id: "new",
    title: "Конспект",
    hours: 1.5,
    done: false,
  });

  const saved = saveTasks(storage, tasks);
  assert.deepEqual(saved, { ok: true, notice: null });

  const loaded = loadTasks(storage);
  assert.equal(loaded.notice, null);
  assert.equal(loaded.tasks.length, 4);
  assert.equal(loaded.tasks[3].title, "Конспект");
  assert.equal(loaded.tasks[3].hours, 1.5);
});

test("loadTasks при повреждённом JSON возвращает исходный пример и notice", () => {
  const storage = createMemoryStorage({ [STORAGE_KEY]: "{не json" });
  const result = loadTasks(storage);

  assert.equal(result.notice, "corrupt");
  assert.equal(result.tasks.length, 3);
});

test("loadTasks отбрасывает структурно невалидные сохранения", () => {
  const storage = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify([
      { id: "a", title: "A", hours: 48, done: false },
    ]),
  });
  const result = loadTasks(storage);

  assert.equal(result.notice, "corrupt");
  assert.equal(result.tasks.length, 3);
});

test("недоступное хранилище не ломает загрузку и сохранение", () => {
  const storage = createThrowingStorage();

  const loaded = loadTasks(storage);
  assert.equal(loaded.notice, "unavailable");
  assert.equal(loaded.tasks.length, 3);
  assert.equal(summarize(loaded.tasks).totalHours, 8);

  const saved = saveTasks(storage, createSeedTasks());
  assert.deepEqual(saved, { ok: false, notice: "unavailable" });
});

test("ошибка записи в хранилище возвращает notice и не бросает исключение", () => {
  const storage = createMemoryStorage();
  storage.setItem = () => {
    throw new Error("QuotaExceededError");
  };

  const saved = saveTasks(storage, createSeedTasks());
  assert.deepEqual(saved, { ok: false, notice: "unavailable" });
});

test("T1 · Исходный пример", () => {
  const view = buildViewModel(createSeedTasks(), "all");

  assert.equal(view.tasks.length, 3);
  assert.equal(view.totalHours, 8);
  assert.equal(view.doneHours, 2);
  assert.equal(view.progress, 25);
  assert.notEqual(view.progress, 33);
});

test("T2 · Статус", () => {
  const tasks = createSeedTasks();
  const updated = toggleTask(tasks, "seed-practice");
  const view = buildViewModel(updated, "all");

  assert.equal(view.doneHours, 6);
  assert.equal(view.totalHours, 8);
  assert.equal(view.progress, 75);
  assert.equal(
    view.tasks.find((task) => task.id === "seed-practice").done,
    true,
  );
  assert.equal(
    tasks.find((task) => task.id === "seed-practice").done,
    false,
  );
});

test("T3 · Фильтр", () => {
  const view = buildViewModel(createSeedTasks(), "active");

  assert.deepEqual(
    view.tasks.map((task) => task.title),
    ["Практика", "Повторение"],
  );
  assert.equal(view.totalHours, 8);
  assert.equal(view.doneHours, 2);
  assert.equal(view.progress, 25);
});

test("T4 · Ошибки ввода", () => {
  const invalidInputs = [
    { title: "", hours: "2", field: "title" },
    { title: "   ", hours: "2", field: "title" },
    { title: "Тест", hours: "", field: "hours" },
    { title: "Тест", hours: "-1", field: "hours" },
    { title: "Тест", hours: "0.4", field: "hours" },
    { title: "Тест", hours: "24.5", field: "hours" },
    { title: "Тест", hours: "1.3", field: "hours" },
  ];

  for (const { title, hours, field } of invalidInputs) {
    const result = validateTaskInput({ title, hours });
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
    assert.equal(typeof result.errors[field], "string");
  }

  assert.deepEqual(validateTaskInput({ title: "Тест", hours: "0.5" }), {
    ok: true,
    errors: {},
    value: { title: "Тест", hours: 0.5 },
  });
  assert.deepEqual(validateTaskInput({ title: "Тест", hours: "24" }), {
    ok: true,
    errors: {},
    value: { title: "Тест", hours: 24 },
  });
});

test("T5 · Пустое состояние", () => {
  const view = buildViewModel([], "all");

  assert.equal(view.totalHours, 0);
  assert.equal(view.doneHours, 0);
  assert.equal(view.progress, 0);
  assert.equal(Number.isNaN(view.progress), false);
  assert.equal(Number.isFinite(view.progress), true);
  assert.equal(view.isEmpty, true);

  const afterAdd = buildViewModel(
    [{ id: "a", title: "После пустого", hours: 2, done: false }],
    "all",
  );
  assert.equal(afterAdd.totalHours, 2);
  assert.equal(afterAdd.progress, 0);
  assert.equal(afterAdd.tasks.length, 1);
});
