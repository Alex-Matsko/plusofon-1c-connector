/**
 * poller.js — периодически опрашивает Plusofon API /call
 * и отправляет новые звонки в 1С:УНФ через HTTP-сервис.
 */

'use strict';

const axios = require('axios');
const qs = require('qs');
const db = require('./db');
const logger = require('./logger');
const { normPhone } = require('./utils');

const PLUSOFON_BASE = 'https://restapi.plusofon.ru';
const INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_SEC || '30', 10) * 1000;

const COLUMNS = [
  'connect_time',
  'number_a',
  'number_b',
  'cld',
  'direction',
  'duration',
  'account',
  'record',
];

/**
 * Один цикл опроса.
 */
async function poll() {
  const lastSync = db.getLastSync();
  const now = new Date();

  // Запрашиваем звонки за период (lastSync — now), страница за страницей
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    let resp;
    try {
      resp = await axios.get(`${PLUSOFON_BASE}/api/v1/call`, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Client: process.env.PLUSOFON_CLIENT_ID,
          Authorization: `Bearer ${process.env.PLUSOFON_TOKEN}`,
        },
        params: {
          date_from: formatDate(lastSync),
          date_to: formatDate(now),
          direction: 'all',
          'columns[]': COLUMNS,
          page,
        },
        // Plusofon ожидает columns[]=value&columns[]=value (не columns[0]=value)
        paramsSerializer: (params) =>
          qs.stringify(params, { arrayFormat: 'repeat' }),
      });
    } catch (err) {
      logger.error('Plusofon API error', err.message);
      break;
    }

    const { data, next_page_url } = resp.data;
    if (!data || data.length === 0) break;

    for (const call of data) {
      await processCall(call);
    }

    hasMore = !!next_page_url;
    page += 1;
  }

  db.setLastSync(now);
}

/**
 * Обрабатывает одну запись звонка: дедупликация + отправка в 1С.
 */
async function processCall(call) {
  // Формируем уникальный ключ: время + account + номер
  const key = `${call.connect_time}|${call.account}|${call.number_a}|${call.number_b}`;

  if (db.isSeen(key)) return; // уже обрабатывали

  const payload = {
    connect_time: call.connect_time,
    number_a: normPhone(call.number_a),
    number_b: normPhone(call.number_b),
    cld: normPhone(call.cld),
    direction: call.direction,   // 'internal' (входящий) | 'external' (исходящий)
    duration: call.duration ?? 0,
    account: call.account,
    record_url: call.record || null,
    source: 'plusofon',
  };

  try {
    await axios.post(
      `${process.env.UNF_URL}/hs/plusofon/calls`,
      payload,
      {
        auth: {
          username: process.env.UNF_USER,
          password: process.env.UNF_PASSWORD,
        },
        timeout: 10_000,
      }
    );
    db.markSeen(key);
    logger.info(`Synced call ${key}`);
  } catch (err) {
    logger.error(`Failed to push call ${key}`, err.message);
    // НЕ помечаем как seen — попробуем на следующем цикле
  }
}

/**
 * Форматирует Date в 'YYYY-MM-DD HH:mm:ss' для Plusofon API.
 */
function formatDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Запускает бесконечный цикл опроса.
 */
function start() {
  logger.info(`Poller started, interval = ${INTERVAL_MS / 1000}s`);
  poll().catch((e) => logger.error('poll error', e.message));
  setInterval(() => {
    poll().catch((e) => logger.error('poll error', e.message));
  }, INTERVAL_MS);
}

module.exports = { start };
