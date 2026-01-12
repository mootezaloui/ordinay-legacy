const apiPrefix = process.env.API_PREFIX || '/api';
const port = parseInt(process.env.PORT || '3000', 10);
const env = process.env.NODE_ENV || 'development';

module.exports = {
  apiPrefix,
  port,
  env,
};
