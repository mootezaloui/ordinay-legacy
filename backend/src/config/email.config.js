/**
 * Email Configuration
 *
 * Loads SMTP settings from environment variables.
 * If EMAIL_ENABLED is not 'true', email sending will be disabled (fail-safe).
 */

const emailEnabled = process.env.EMAIL_ENABLED === 'true';
const smtpHost = process.env.SMTP_HOST || '';
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';
const smtpSecure = process.env.SMTP_SECURE === 'true';
const emailFromName = process.env.EMAIL_FROM_NAME || 'Ordinay';
const emailFromAddress = process.env.EMAIL_FROM_ADDRESS || '';

module.exports = {
  emailEnabled,
  smtpHost,
  smtpPort,
  smtpUser,
  smtpPass,
  smtpSecure,
  emailFromName,
  emailFromAddress,
};
