const service = require('../services/email.service');

/**
 * Send a client email.
 * POST /api/email/send
 */
async function sendClientEmail(req, res, next) {
  try {
    const { to, subject, body, replyTo } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({
        message: 'to, subject, and body are required',
      });
    }

    const result = await service.sendEmail({ to, subject, body, replyTo });

    if (result.success) {
      res.json({ success: true, messageId: result.messageId });
    } else {
      const statusCode = result.reason === 'email_disabled' ? 503 : 500;
      const message =
        result.reason === 'email_disabled'
          ? 'Email service is not configured'
          : result.reason === 'invalid_params'
            ? 'Invalid email parameters'
            : 'Failed to send email';

      res.status(statusCode).json({
        success: false,
        reason: result.reason,
        message,
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Check email service status.
 * GET /api/email/status
 */
async function checkStatus(req, res, next) {
  try {
    const configured = service.isConfigured();

    if (!configured) {
      return res.json({
        configured: false,
        connected: false,
        reason: 'email_disabled',
      });
    }

    const result = await service.verifyConnection();
    res.json({
      configured: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  sendClientEmail,
  checkStatus,
};
