const db = require('../db/connection');

const ACTIVE_DOSSIER_STATUSES = ['open', 'in_progress', 'on_hold'];
const CONFIRMED_FINANCIAL_STATUSES = ['confirmed', 'paid', 'posted'];
const REVENUE_ENTRY_TYPES = ['income', 'revenue'];

function getMonthBoundaries() {
  const { current_start, next_start, previous_start } = db
    .prepare(
      `
      SELECT
        DATE('now', 'localtime', 'start of month') AS current_start,
        DATE('now', 'localtime', 'start of month', '+1 month') AS next_start,
        DATE('now', 'localtime', 'start of month', '-1 month') AS previous_start
    `
    )
    .get();

  return {
    currentStart: current_start,
    nextStart: next_start,
    previousStart: previous_start,
  };
}

function percentageDelta(currentValue, previousValue) {
  if (!previousValue || previousValue === 0) return 0;
  return Math.round(((currentValue - previousValue) / previousValue) * 100);
}

/**
 * Aggregate dashboard statistics from persisted data only.
 * Uses SQL aggregation to avoid any in-memory filtering.
 */
function getSummary() {
  const { currentStart, nextStart, previousStart } = getMonthBoundaries();
  const clientDateExpr = `DATE(COALESCE(join_date, created_at))`;

  // Total clients (excluding soft-deleted)
  const totalClients = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM clients
      WHERE deleted_at IS NULL
        AND validated = 1
    `
    )
    .get().count;

  // Clients created this month vs last month
  const clientsCurrentMonth = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM clients
      WHERE deleted_at IS NULL
        AND validated = 1
        AND ${clientDateExpr} >= DATE(@currentStart)
        AND ${clientDateExpr} < DATE(@nextStart)
    `
    )
    .get({ currentStart, nextStart }).count;

  const clientsPreviousMonth = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM clients
      WHERE deleted_at IS NULL
        AND validated = 1
        AND ${clientDateExpr} >= DATE(@previousStart)
        AND ${clientDateExpr} < DATE(@currentStart)
    `
    )
    .get({ previousStart, currentStart }).count;

  // Active dossiers (open/in progress/on hold)
  const activeDossiers = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM dossiers
      WHERE deleted_at IS NULL
        AND validated = 1
        AND status IN (${ACTIVE_DOSSIER_STATUSES.map((s) => `'${s}'`).join(',')})
    `
    )
    .get().count;

  // Dossiers created in the last 7 days (including today)
  const newDossiersThisWeek = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM dossiers
      WHERE deleted_at IS NULL
        AND validated = 1
        AND DATE(COALESCE(created_at, opened_at)) >= DATE('now', 'localtime', '-6 days')
    `
    )
    .get().count;

  // Pending tasks: not done or cancelled
  const pendingTasks = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM tasks
      WHERE deleted_at IS NULL
        AND validated = 1
        AND status NOT IN ('done', 'cancelled')
    `
    )
    .get().count;

  // Tasks due today (not done/cancelled)
  const tasksDueToday = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM tasks
      WHERE deleted_at IS NULL
        AND validated = 1
        AND status NOT IN ('done', 'cancelled')
        AND due_date IS NOT NULL
        AND DATE(due_date) = DATE('now', 'localtime')
    `
    )
    .get().count;

  // Confirmed revenue (all time)
  const revenue = db
    .prepare(
      `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM financial_entries
      WHERE deleted_at IS NULL
        AND validated = 1
        AND entry_type IN (${REVENUE_ENTRY_TYPES.map((t) => `'${t}'`).join(',')})
        AND status IN (${CONFIRMED_FINANCIAL_STATUSES.map((s) => `'${s}'`).join(',')})
    `
    )
    .get().total;

  // Revenue for current and previous month for delta calculation
  const revenueCurrentMonth = db
    .prepare(
      `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM financial_entries
      WHERE deleted_at IS NULL
        AND validated = 1
        AND entry_type IN (${REVENUE_ENTRY_TYPES.map((t) => `'${t}'`).join(',')})
        AND status IN (${CONFIRMED_FINANCIAL_STATUSES.map((s) => `'${s}'`).join(',')})
        AND DATE(COALESCE(occurred_at, due_date, created_at)) >= DATE(@currentStart)
        AND DATE(COALESCE(occurred_at, due_date, created_at)) < DATE(@nextStart)
    `
    )
    .get({ currentStart, nextStart }).total;

  const revenuePreviousMonth = db
    .prepare(
      `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM financial_entries
      WHERE deleted_at IS NULL
        AND validated = 1
        AND entry_type IN (${REVENUE_ENTRY_TYPES.map((t) => `'${t}'`).join(',')})
        AND status IN (${CONFIRMED_FINANCIAL_STATUSES.map((s) => `'${s}'`).join(',')})
        AND DATE(COALESCE(occurred_at, due_date, created_at)) >= DATE(@previousStart)
        AND DATE(COALESCE(occurred_at, due_date, created_at)) < DATE(@currentStart)
    `
    )
    .get({ previousStart, currentStart }).total;

  return {
    totalClients: totalClients || 0,
    clientsDelta: percentageDelta(clientsCurrentMonth, clientsPreviousMonth),
    activeDossiers: activeDossiers || 0,
    newDossiersThisWeek: newDossiersThisWeek || 0,
    pendingTasks: pendingTasks || 0,
    tasksDueToday: tasksDueToday || 0,
    revenue: Number(revenue) || 0,
    revenueDelta: percentageDelta(revenueCurrentMonth, revenuePreviousMonth),
  };
}

module.exports = {
  getSummary,
};
