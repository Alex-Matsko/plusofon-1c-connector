/**
 * server.js — Express HTTP-сервер.
 *
 * Endpoints:
 *   GET  /health        — проверка работоспособности
 *   POST /quickcall     — инициировать исходящий звонок (из 1С кнопка «Позвонить»)
 *   POST /calls         — принять обработанный звонок от poller'а и передать в 1С
 */

'use strict';

const express = require('express');
const axios = require('axios');
const logger = require('./logger');

const PLUSOFON_BASE = 'https://restapi.plusofon.ru';

function createServer() {
  const app = express();
  app.use(express.json());

  // ── Проверка API-ключа ────────────────────────────────────────────────────
  function checkApiKey(req, res, next) {
    const secret = process.env.API_SECRET;
    if (secret && req.headers['x-api-key'] !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // ── Передать звонок в 1С:УНФ ─────────────────────────────────────────────
  // POST /calls
  // Вызывается внутренне из poller.js — проксирует payload в HTTP-сервис 1С.
  // 1С ожидает POST /hs/plusofon/calls с Basic-авторизацией.
  app.post('/calls', async (req, res) => {
    const payload = req.body;
    if (!payload || !payload.connect_time) {
      return res.status(400).json({ error: 'connect_time is required' });
    }

    const unfUrl = process.env.UNF_URL;
    if (!unfUrl) {
      logger.error('/calls: UNF_URL is not set');
      return res.status(500).json({ error: 'UNF_URL not configured' });
    }

    try {
      const resp = await axios.post(
        `${unfUrl}/hs/plusofon/calls`,
        payload,
        {
          auth: {
            username: process.env.UNF_USER,
            password: process.env.UNF_PASSWORD,
          },
          timeout: 10_000,
        }
      );
      logger.info(`Call forwarded to 1C: ${payload.connect_time} dir=${payload.direction}`);
      return res.json(resp.data);
    } catch (err) {
      logger.error('Failed to forward call to 1C', err.response?.data || err.message);
      return res.status(502).json({ error: '1C error', detail: err.message });
    }
  });

  // ── Инициировать быстрый звонок (из 1С нажата кнопка «Позвонить») ────────
  // POST /quickcall
  // Headers: X-Api-Key: <API_SECRET>
  // Body: { "number": "79XXXXXXXXX", "line_number": "7XXXXXXXXXX", "sip_id": "optional" }
  app.post('/quickcall', checkApiKey, async (req, res) => {
    const { number, line_number, sip_id } = req.body;

    if (!number || !line_number) {
      return res.status(400).json({ error: 'number and line_number are required' });
    }

    const body = { number, line_number };
    if (sip_id) body.sip_id = String(sip_id);

    try {
      const resp = await axios.post(
        `${PLUSOFON_BASE}/api/v1/call/quickcall`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Client: process.env.PLUSOFON_CLIENT_ID,
            Authorization: `Bearer ${process.env.PLUSOFON_TOKEN}`,
          },
          timeout: 10_000,
        }
      );
      logger.info(`quickcall initiated to ${number} via ${line_number}`);
      return res.json(resp.data);
    } catch (err) {
      logger.error('quickcall error', err.response?.data || err.message);
      return res.status(502).json({ error: 'Plusofon API error', detail: err.message });
    }
  });

  return app;
}

module.exports = { createServer };
