'use strict';

require('dotenv').config();
const { start: startPoller } = require('./poller');
const { createServer } = require('./server');
const logger = require('./logger');

const PORT = parseInt(process.env.PORT || '8080', 10);

const app = createServer();
app.listen(PORT, () => {
  logger.info(`HTTP server listening on :${PORT}`);
});

startPoller();
