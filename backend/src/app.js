const express = require('express');
const routes = require('./routes');
const cors = require('cors');
const { apiPrefix } = require('./config/app.config');
const notFoundMiddleware = require('./middlewares/notFound.middleware');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept'] }));
app.use(express.json({ limit: process.env.API_JSON_LIMIT || '50mb' }));

app.use(apiPrefix, routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
