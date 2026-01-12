const express = require('express');

const clientsRouter = require('./clients.routes');
const dossiersRouter = require('./dossiers.routes');
const casesRouter = require('./cases.routes');
const tasksRouter = require('./tasks.routes');
const sessionsRouter = require('./sessions.routes');
const missionsRouter = require('./missions.routes');
const officersRouter = require('./officers.routes');
const financialRouter = require('./financial.routes');
const documentsRouter = require('./documents.routes');
const notificationsRouter = require('./notifications.routes');
const personalTasksRouter = require('./personalTasks.routes');
const historyRouter = require('./history.routes');
const notesRouter = require('./notes.routes');
const operatorsRouter = require('./operators.routes');
const profileRouter = require('./profile.routes');
const dashboardRouter = require('./dashboard.routes');
const agentRouter = require('../agent/agent.router');

const router = express.Router();

router.use('/clients', clientsRouter);
router.use('/dossiers', dossiersRouter);
router.use('/cases', casesRouter);
router.use('/tasks', tasksRouter);
router.use('/personal-tasks', personalTasksRouter);
router.use('/sessions', sessionsRouter);
router.use('/missions', missionsRouter);
router.use('/officers', officersRouter);
router.use('/financial', financialRouter);
router.use('/documents', documentsRouter);
router.use('/notifications', notificationsRouter);
router.use('/history', historyRouter);
router.use('/notes', notesRouter);
router.use('/operators', operatorsRouter);
router.use('/profile', profileRouter);
router.use('/dashboard', dashboardRouter);
router.use('/', agentRouter);

module.exports = router;
