/**
 * SQLite DB for standalone SkyDark (same schema as HA integration).
 * Uses sql.js (pure JS, no native deps) with optional file persistence.
 */
import initSqlJs from "sql.js";
import { randomUUID } from "crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SKYDARK_DB_PATH || join(__dirname, "..", "data", "skydark.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  avatar_url TEXT,
  initial TEXT,
  sort_order INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  all_day INTEGER DEFAULT 0,
  location TEXT,
  calendar_id TEXT,
  external_id TEXT,
  external_source TEXT,
  recurrence_rule TEXT,
  color TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (calendar_id) REFERENCES family_members(id)
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(calendar_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  category TEXT,
  frequency TEXT,
  custom_schedule TEXT,
  icon TEXT,
  points INTEGER DEFAULT 0,
  completed_date TEXT,
  created_at TEXT,
  due_date TEXT,
  FOREIGN KEY (assignee_id) REFERENCES family_members(id)
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed_date);

CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  sort_order INTEGER,
  created_at TEXT,
  owner_id TEXT,
  list_type TEXT DEFAULT 'general',
  FOREIGN KEY (owner_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS list_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  content TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  sort_order INTEGER,
  created_at TEXT,
  FOREIGN KEY (list_id) REFERENCES lists(id)
);
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);

CREATE TABLE IF NOT EXISTS meal_recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS meal_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  FOREIGN KEY (recipe_id) REFERENCES meal_recipes(id)
);

CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  recipe_url TEXT,
  ingredients TEXT,
  meal_date TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  created_at TEXT,
  meal_recipe_id TEXT,
  FOREIGN KEY (meal_recipe_id) REFERENCES meal_recipes(id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  caption TEXT,
  uploaded_by TEXT,
  album_id TEXT,
  created_at TEXT,
  FOREIGN KEY (uploaded_by) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  points_required INTEGER NOT NULL,
  description TEXT,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS points_log (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  points INTEGER,
  reason TEXT,
  task_id TEXT,
  created_at TEXT,
  FOREIGN KEY (member_id) REFERENCES family_members(id)
);
CREATE INDEX IF NOT EXISTS idx_points_log_member ON points_log(member_id);
`;

let db;
let SQL;

function query(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function run(db, sql, params = []) {
  db.run(sql, params);
}

function seedIfEmpty() {
  const count = query(db, "SELECT COUNT(*) as n FROM family_members")[0]?.n ?? 0;
  if (count > 0) return;
  const now = new Date().toISOString();
  const defaultMembers = [
    { id: randomUUID(), name: "Mom", color: "#FFD4D4", initial: "M", sort_order: 1 },
    { id: randomUUID(), name: "Dad", color: "#C8E6F5", initial: "D", sort_order: 2 },
    { id: randomUUID(), name: "Harper", color: "#C8F5E8", initial: "H", sort_order: 3 },
    { id: randomUUID(), name: "Liam", color: "#FFF4D4", initial: "L", sort_order: 4 },
  ];
  const insert = db.prepare(
    "INSERT INTO family_members (id, name, color, initial, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const m of defaultMembers) {
    insert.run([m.id, m.name, m.color, m.initial, m.sort_order, now]);
  }
  insert.free();
  db.run("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('family_name', 'My Family')");
}

function save() {
  try {
    const dataDir = dirname(DB_PATH);
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    writeFileSync(DB_PATH, Buffer.from(db.export()));
  } catch (e) {
    console.warn("Could not persist DB:", e.message);
  }
}

export async function initDb() {
  if (db) return db;
  SQL = await initSqlJs();
  const dataDir = dirname(DB_PATH);
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (existsSync(DB_PATH)) {
    const buf = readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
    db.run(SCHEMA);
    seedIfEmpty();
    save();
  }
  return db;
}

export function getEvents(startDate, endDate) {
  if (startDate && endDate) {
    return query(
      db,
      "SELECT * FROM events WHERE start_time <= ? AND COALESCE(end_time, start_time) >= ? ORDER BY start_time",
      [endDate, startDate]
    );
  }
  return query(db, "SELECT * FROM events ORDER BY start_time");
}

function decodeTask(row) {
  if (!row?.custom_schedule || typeof row.custom_schedule !== "string" || !row.custom_schedule.startsWith("{")) {
    return row;
  }
  try {
    const extra = JSON.parse(row.custom_schedule);
    return { ...row, ...extra };
  } catch {
    return row;
  }
}

export function getTasks() {
  return query(db, "SELECT * FROM tasks ORDER BY created_at").map(decodeTask);
}

export function getLists() {
  return query(db, "SELECT * FROM lists ORDER BY sort_order, name");
}

export function getListItems(listId) {
  return query(db, "SELECT * FROM list_items WHERE list_id = ? ORDER BY sort_order, created_at", [listId]);
}

export function getAllListItems() {
  const rows = query(db, "SELECT * FROM list_items ORDER BY list_id, sort_order, created_at");
  const byList = {};
  for (const row of rows) {
    if (!byList[row.list_id]) byList[row.list_id] = [];
    byList[row.list_id].push(row);
  }
  return byList;
}

export function getFamilyMembers() {
  return query(db, "SELECT * FROM family_members ORDER BY sort_order, name");
}

export function getMeals(startDate, endDate) {
  if (startDate && endDate) {
    return query(db, "SELECT * FROM meals WHERE meal_date >= ? AND meal_date <= ? ORDER BY meal_date, meal_type", [
      startDate,
      endDate,
    ]);
  }
  return query(db, "SELECT * FROM meals ORDER BY meal_date");
}

export function getPointsByMember() {
  const members = getFamilyMembers();
  const out = {};
  for (const m of members) {
    const row = query(db, "SELECT COALESCE(SUM(points), 0) as total FROM points_log WHERE member_id = ?", [m.id])[0];
    out[m.id] = row?.total ?? 0;
  }
  return out;
}

export function getRewards() {
  return query(db, "SELECT * FROM rewards ORDER BY points_required");
}

function getSetting(key) {
  return query(db, "SELECT value FROM app_settings WHERE key = ?", [key])[0]?.value;
}

export function getConfig() {
  return {
    panel_url: "/skydark",
    config: {
      family_name: getSetting("family_name") ?? "My Family",
      weather_entity: getSetting("weather_entity") || null,
    },
  };
}

export function updateConfig(values) {
  for (const key of ["family_name", "weather_entity"]) {
    if (typeof values[key] === "string") {
      run(db, "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [key, values[key].trim()]);
    }
  }
  save();
  return getConfig();
}

export function addEvent(data) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const start = typeof data.start_time === "string" ? data.start_time : data.start_time?.toISO?.() ?? now;
  const end = data.end_time == null ? null : (typeof data.end_time === "string" ? data.end_time : data.end_time?.toISO?.());
  run(
    db,
    `INSERT INTO events (id, title, description, start_time, end_time, all_day, location, calendar_id, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.title ?? "",
      data.description ?? "",
      start,
      end,
      data.all_day ? 1 : 0,
      data.location ?? "",
      data.calendar_id ?? null,
      null,
      now,
      now,
    ]
  );
  save();
  return id;
}

export function completeTask(taskId, completedDate, points = 0) {
  const date = completedDate || new Date().toISOString().slice(0, 10);
  const existing = query(db, "SELECT assignee_id, completed_date FROM tasks WHERE id = ?", [taskId])[0];
  if (!existing) return;
  if (existing.completed_date === date) return;
  run(db, "UPDATE tasks SET completed_date = ? WHERE id = ?", [date, taskId]);
  if (points > 0 && existing.assignee_id) {
    run(db, "INSERT INTO points_log (id, member_id, points, reason, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
      randomUUID(),
      existing.assignee_id,
      points,
      "Task completed",
      taskId,
      new Date().toISOString(),
    ]);
  }
  save();
}

export function addPoints(memberId, points, reason, taskId = null) {
  run(db, "INSERT INTO points_log (id, member_id, points, reason, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    randomUUID(),
    memberId,
    points,
    reason,
    taskId,
    new Date().toISOString(),
  ]);
  save();
}

export function redeemReward(memberId, rewardId) {
  const reward = query(db, "SELECT name, points_required FROM rewards WHERE id = ?", [rewardId])[0];
  if (!reward) return false;
  const row = query(db, "SELECT COALESCE(SUM(points), 0) as total FROM points_log WHERE member_id = ?", [memberId])[0];
  const current = row?.total ?? 0;
  if (current < reward.points_required) return false;
  run(db, "INSERT INTO points_log (id, member_id, points, reason, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    randomUUID(),
    memberId,
    -reward.points_required,
    "Redeemed: " + reward.name,
    null,
    new Date().toISOString(),
  ]);
  save();
  return true;
}

export function createList(name, color, ownerId, listType = "general") {
  const id = randomUUID();
  const now = new Date().toISOString();
  const sortOrder = (query(db, "SELECT COALESCE(MAX(sort_order), 0) + 1 as n FROM lists")[0]?.n ?? 1);
  run(db, "INSERT INTO lists (id, name, color, sort_order, created_at, owner_id, list_type) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    id,
    name,
    color ?? "#E8D8F5",
    sortOrder,
    now,
    ownerId ?? null,
    listType,
  ]);
  save();
  return id;
}

export function addListItem(listId, content) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const sortOrder =
    (query(db, "SELECT COALESCE(MAX(sort_order), 0) + 1 as n FROM list_items WHERE list_id = ?", [listId])[0]?.n ?? 1);
  run(db, "INSERT INTO list_items (id, list_id, content, completed, sort_order, created_at) VALUES (?, ?, ?, 0, ?, ?)", [
    id,
    listId,
    content,
    sortOrder,
    now,
  ]);
  save();
  return id;
}

export function addMealRecipe(name, ingredients = []) {
  const id = randomUUID();
  const now = new Date().toISOString();
  run(db, "INSERT INTO meal_recipes (id, name, created_at) VALUES (?, ?, ?)", [id, name, now]);
  for (const ing of ingredients) {
    run(db, "INSERT INTO meal_ingredients (id, recipe_id, name, quantity, unit) VALUES (?, ?, ?, ?, ?)", [
      randomUUID(),
      id,
      ing.name ?? "",
      ing.quantity ?? "",
      ing.unit ?? "",
    ]);
  }
  save();
  return id;
}

function encodeSchedule(data) {
  if (!data) return null;
  const payload = {};
  for (const key of [
    "weekdays",
    "custom_schedule",
    "custom_monthday",
    "custom_month",
    "custom_weekday",
    "custom_week_of_month",
  ]) {
    if (data[key] != null) payload[key] = data[key];
  }
  return Object.keys(payload).length ? JSON.stringify(payload) : null;
}

export function updateEvent(id, data) {
  const allowed = ["title", "description", "start_time", "end_time", "all_day", "location", "calendar_id", "color"];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (data[key] === undefined) continue;
    let v = data[key];
    if (key === "all_day") v = v ? 1 : 0;
    updates.push(`${key} = ?`);
    values.push(v);
  }
  if (!updates.length) return;
  values.push(new Date().toISOString(), id);
  run(db, `UPDATE events SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`, values);
  save();
}

export function deleteEvent(id) {
  run(db, "DELETE FROM events WHERE id = ?", [id]);
  save();
}

export function addTask(data) {
  const id = randomUUID();
  const now = new Date().toISOString();
  run(
    db,
    "INSERT INTO tasks (id, title, assignee_id, category, frequency, icon, points, due_date, custom_schedule, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      data.title ?? "",
      data.assignee_id,
      data.category ?? null,
      data.frequency ?? "daily",
      data.icon ?? null,
      data.points ?? 0,
      data.due_date ?? null,
      encodeSchedule(data),
      now,
    ]
  );
  save();
  return id;
}

export function updateTask(taskId, data) {
  const fields = ["title", "assignee_id", "category", "frequency", "icon", "points", "due_date"];
  const updates = [];
  const values = [];
  for (const key of fields) {
    if (data[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  const schedule = encodeSchedule(data);
  if (schedule) {
    updates.push("custom_schedule = ?");
    values.push(schedule);
  }
  if (!updates.length) return;
  values.push(taskId);
  run(db, `UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`, values);
  save();
}

export function deleteTask(taskId) {
  run(db, "DELETE FROM tasks WHERE id = ?", [taskId]);
  save();
}

export function uncompleteTask(taskId) {
  const row = query(db, "SELECT completed_date FROM tasks WHERE id = ?", [taskId])[0];
  run(db, "UPDATE tasks SET completed_date = NULL WHERE id = ?", [taskId]);
  if (row?.completed_date) {
    run(
      db,
      "DELETE FROM points_log WHERE task_id = ? AND reason = 'Task completed' AND date(created_at) = date(?)",
      [taskId, row.completed_date]
    );
  }
  save();
}

export function toggleListItem(itemId) {
  run(db, "UPDATE list_items SET completed = 1 - completed WHERE id = ?", [itemId]);
  save();
}

export function deleteListItem(itemId) {
  run(db, "DELETE FROM list_items WHERE id = ?", [itemId]);
  save();
}

export function deleteList(listId) {
  run(db, "DELETE FROM list_items WHERE list_id = ?", [listId]);
  run(db, "DELETE FROM lists WHERE id = ?", [listId]);
  save();
}

export function addMeal(data) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const ingredients = Array.isArray(data.ingredients) ? JSON.stringify(data.ingredients) : data.ingredients ?? null;
  run(
    db,
    "INSERT INTO meals (id, name, recipe_url, ingredients, meal_date, meal_type, created_at, meal_recipe_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      data.name,
      data.recipe_url ?? null,
      ingredients,
      data.meal_date,
      data.meal_type ?? "Dinner",
      now,
      data.meal_recipe_id ?? null,
    ]
  );
  save();
  return id;
}

export function updateMeal(mealId, data) {
  const updates = [];
  const values = [];
  for (const key of ["name", "meal_date", "meal_type", "recipe_url", "meal_recipe_id"]) {
    if (data[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (data.ingredients !== undefined) {
    updates.push("ingredients = ?");
    values.push(Array.isArray(data.ingredients) ? JSON.stringify(data.ingredients) : data.ingredients);
  }
  if (!updates.length) return;
  values.push(mealId);
  run(db, `UPDATE meals SET ${updates.join(", ")} WHERE id = ?`, values);
  save();
}

export function deleteMeal(mealId) {
  run(db, "DELETE FROM meals WHERE id = ?", [mealId]);
  save();
}

export function getMealRecipesWithIngredients() {
  const recipes = query(db, "SELECT * FROM meal_recipes ORDER BY name");
  const ings = query(db, "SELECT * FROM meal_ingredients ORDER BY name");
  const byRecipe = {};
  for (const row of ings) {
    if (!byRecipe[row.recipe_id]) byRecipe[row.recipe_id] = [];
    byRecipe[row.recipe_id].push(row);
  }
  return recipes.map((r) => ({ ...r, ingredients: byRecipe[r.id] ?? [] }));
}

export function deleteMealRecipe(recipeId) {
  run(db, "DELETE FROM meal_ingredients WHERE recipe_id = ?", [recipeId]);
  run(db, "UPDATE meals SET meal_recipe_id = NULL WHERE meal_recipe_id = ?", [recipeId]);
  run(db, "DELETE FROM meal_recipes WHERE id = ?", [recipeId]);
  save();
}

export function addFamilyMember(data) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const initial = data.initial || (data.name ? String(data.name)[0].toUpperCase() : "?");
  const sortOrder = query(db, "SELECT COALESCE(MAX(sort_order), 0) + 1 as n FROM family_members")[0]?.n ?? 1;
  run(
    db,
    "INSERT INTO family_members (id, name, color, initial, avatar_url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, data.name, data.color, initial, data.avatar_url ?? null, sortOrder, now]
  );
  save();
  return id;
}

export function updateFamilyMember(memberId, data) {
  const updates = [];
  const values = [];
  for (const key of ["name", "color", "initial", "avatar_url", "sort_order"]) {
    if (data[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (!updates.length) return;
  values.push(memberId);
  run(db, `UPDATE family_members SET ${updates.join(", ")} WHERE id = ?`, values);
  save();
}

export function deleteFamilyMember(memberId) {
  run(db, "UPDATE events SET calendar_id = NULL WHERE calendar_id = ?", [memberId]);
  run(db, "DELETE FROM tasks WHERE assignee_id = ?", [memberId]);
  run(db, "UPDATE lists SET owner_id = NULL WHERE owner_id = ?", [memberId]);
  run(db, "UPDATE photos SET uploaded_by = NULL WHERE uploaded_by = ?", [memberId]);
  run(db, "DELETE FROM points_log WHERE member_id = ?", [memberId]);
  run(db, "DELETE FROM family_members WHERE id = ?", [memberId]);
  save();
}

export function addReward(data) {
  const id = randomUUID();
  run(db, "INSERT INTO rewards (id, name, points_required, description, icon) VALUES (?, ?, ?, ?, ?)", [
    id,
    data.name,
    data.points_required,
    data.description ?? "",
    data.icon ?? null,
  ]);
  save();
  return id;
}

export function deleteReward(rewardId) {
  run(db, "DELETE FROM rewards WHERE id = ?", [rewardId]);
  save();
}
