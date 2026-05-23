'use strict';

require('dotenv').config();
const { start: startPoller } = require('./poller');
const { createServer } = require('./server');
const logger = require('./logger');

const PORT = parseInt(process.env.PORT || '3000', 10);

// Запуск HTTP-сервера
const app = createServer();
app.listen(PORT, () => {
  logger.info(`HTTP server listening on :${PORT}`);
});

// Запуск поллера
startPoller();
