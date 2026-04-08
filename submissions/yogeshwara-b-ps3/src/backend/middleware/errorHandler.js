/**
 * Global Express error-handling middleware.
 * Must be registered AFTER all routes.
 */
// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, next) {
  console.error('[ErrorHandler]', err);

  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({ error: message });
}
