const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'organia.db');
const db = new Database(dbPath);

console.log('Current notifications table schema:');
const columns = db.prepare("PRAGMA table_info(notifications)").all();
console.log(columns);

db.close();
