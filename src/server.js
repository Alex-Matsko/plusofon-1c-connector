/**
 * server.js — Express HTTP-сервер.
 * Предоставляет endpoint для инициации исходящего звонка из 1С.
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

  // ── Инициировать быстрый звонок (из 1С нажата кнопка «Позвонить») ────────
  // POST /quickcall
  // Headers: X-Api-Key: <API_SECRET>
  // Body: { "number": "79XXXXXXXXX", "line_number": "7XXXXXXXXXX", "sip_id": "optional" }
  // Plusofon перезвонит на line_number (внутр./мобильный менеджера),
  // а затем соединит его с number (клиент).
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
