function errorMiddleware(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  console.error('[error]', message, err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(status).json({ message });
}

module.exports = errorMiddleware;
