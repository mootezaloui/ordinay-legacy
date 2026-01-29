const path = require('path');

const dbFile = process.env.DB_FILE || path.resolve(__dirname, '..', '..', 'ordinay.db');

module.exports = {
  dbFile,
};
