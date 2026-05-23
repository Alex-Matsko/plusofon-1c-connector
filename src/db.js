/**
 * db.js — простое in-memory + JSON-файловое хранилище состояния поллера.
 *
 * Хранит:
 *  - lastSync  — дата последнего успешного опроса
 *  - seen      — Set ключей уже обработанных звонков (для дедупликации)
 *
 * При рестарте контейнера данные восстанавливаются из /data/state.json
 * (том Docker должен быть смонтирован в /data).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STATE_FILE = process.env.STATE_FILE || '/data/state.json';
const MAX_SEEN = 5000; // ограничиваем размер Set

let state = {
  lastSync: new Date(Date.now() - 24 * 60 * 60 * 1000), // по умолчанию — 24 ч назад
  seen: [],
};

// ── Загрузка состояния ────────────────────────────────────────────────────
try {
  if (fs.existsSync(STATE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state.lastSync = new Date(raw.lastSync || state.lastSync);
    state.seen = Array.isArray(raw.seen) ? raw.seen.slice(-MAX_SEEN) : [];
  }
} catch (e) {
  // первый запуск — файла нет, это нормально
}

const seenSet = new Set(state.seen);

// ── Сохранение состояния ─────────────────────────────────────────────────
function persist() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ lastSync: state.lastSync.toISOString(), seen: [...seenSet].slice(-MAX_SEEN) }),
      'utf8'
    );
  } catch (e) {
    // некритично — потеряем только state при рестарте
  }
}

// ── Публичный API ─────────────────────────────────────────────────────────
function getLastSync() {
  return state.lastSync;
}

function setLastSync(d) {
  state.lastSync = d;
  persist();
}

function isSeen(key) {
  return seenSet.has(key);
}

function markSeen(key) {
  seenSet.add(key);
  if (seenSet.size > MAX_SEEN) {
    // Удаляем самый старый элемент
    seenSet.delete(seenSet.values().next().value);
  }
  persist();
}

module.exports = { getLastSync, setLastSync, isSeen, markSeen };
