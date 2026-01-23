/**
 * Email Service
 *
 * Handles sending emails via SMTP using nodemailer.
 * Fails safely if email is not configured - logs instead of throwing.
 */

const nodemailer = require('nodemailer');
const emailConfig = require('../config/email.config');

let transporter = null;

/**
 * Get or create the nodemailer transporter.
 * Returns null if email is disabled or not configured.
 */
function getTransporter() {
  if (!emailConfig.emailEnabled) {
    return null;
  }

  if (!emailConfig.smtpHost) {
    console.warn('[email.service] SMTP_HOST not configured');
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: emailConfig.smtpPort,
      secure: emailConfig.smtpSecure,
      auth: {
        user: emailConfig.smtpUser,
        pass: emailConfig.smtpPass,
      },
    });
  }

  return transporter;
}

/**
 * Send an email.
 *
 * @param {object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.body - Email body (plain text)
 * @param {string} [options.replyTo] - Reply-to address (optional)
 * @returns {Promise<{success: boolean, messageId?: string, reason?: string, error?: string}>}
 */
async function sendEmail({ to, subject, body, replyTo }) {
  const transport = getTransporter();

  if (!transport) {
    console.log('[email.service] Email disabled or not configured. Would send:', {
      to,
      subject: subject.substring(0, 50) + (subject.length > 50 ? '...' : ''),
    });
    return { success: false, reason: 'email_disabled' };
  }

  if (!to || !subject || !body) {
    console.error('[email.service] Missing required fields:', { to: !!to, subject: !!subject, body: !!body });
    return { success: false, reason: 'invalid_params' };
  }

  try {
    const mailOptions = {
      from: `"${emailConfig.emailFromName}" <${emailConfig.emailFromAddress}>`,
      to,
      subject,
      text: body,
    };

    if (replyTo) {
      mailOptions.replyTo = replyTo;
    }

    const info = await transport.sendMail(mailOptions);

    console.log('[email.service] Email sent successfully:', {
      messageId: info.messageId,
      to,
      subject: subject.substring(0, 50) + (subject.length > 50 ? '...' : ''),
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[email.service] Failed to send email:', {
      error: error.message,
      to,
      subject: subject.substring(0, 50) + (subject.length > 50 ? '...' : ''),
    });
    return { success: false, reason: 'send_failed', error: error.message };
  }
}

/**
 * Verify the SMTP connection.
 *
 * @returns {Promise<{connected: boolean, reason?: string}>}
 */
async function verifyConnection() {
  const transport = getTransporter();

  if (!transport) {
    return { connected: false, reason: 'email_disabled' };
  }

  try {
    await transport.verify();
    return { connected: true };
  } catch (error) {
    console.error('[email.service] Connection verification failed:', error.message);
    return { connected: false, reason: error.message };
  }
}

/**
 * Check if email is enabled and configured.
 *
 * @returns {boolean}
 */
function isConfigured() {
  return emailConfig.emailEnabled && !!emailConfig.smtpHost;
}

module.exports = {
  sendEmail,
  verifyConnection,
  isConfigured,
};
