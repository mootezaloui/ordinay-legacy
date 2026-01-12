const path = require('path');

const dbFile = process.env.DB_FILE || path.resolve(__dirname, '..', '..', 'organia.db');

module.exports = {
  dbFile,
};
