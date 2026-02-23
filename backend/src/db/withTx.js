function withTx(db, fn) {
  if (!db || typeof db.transaction !== "function") {
    throw new Error("withTx requires a better-sqlite3 database instance");
  }
  if (typeof fn !== "function") {
    throw new Error("withTx requires a callback function");
  }
  return db.transaction(fn)();
}

module.exports = { withTx };
