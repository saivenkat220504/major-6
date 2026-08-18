import { Resend } from 'resend';

export interface DynamicSmtpCredentials {
  smtpUser: string;
  smtpAppPassword: string;
}

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    throw new Error('Resend API email configuration is missing: RESEND_API_KEY is required.');
  }

  if (!fromEmail) {
    throw new Error('Resend API email configuration is missing: RESEND_FROM_EMAIL is required.');
  }

  return { resend: new Resend(apiKey), fromEmail };
}

/**
 * Dispatches a 6-digit OTP verification code using Resend's HTTPS email API.
 */
export async function sendGuardianOtpEmail(
  toEmail: string,
  otp: string,
  _creds: DynamicSmtpCredentials
): Promise<boolean> {
  const { resend, fromEmail } = getResendConfig();

  const mailOptions = {
    from: `"Personal Guardian Verification" <${fromEmail}>`,
    to: toEmail,
    subject: 'Personal Guardian Verification Code',
    text: `Hello,

Someone has added this email address as their Personal Guardian in the Smart Airport Assistance app.

Your 6-digit verification code is:

${otp}

This code will expire in 5 minutes.

If you did not expect this email, you can safely ignore it.

Regards,
Personal Guardian System`,
  };

  try {
    const { data, error } = await resend.emails.send(mailOptions);
    if (error) {
      throw new Error(error.message);
    }

    console.log('[Mailer] OTP email sent through Resend to %s, messageId: %s', toEmail, data?.id);
    return true;
  } catch (err: any) {
    console.error('[Mailer] Resend OTP email dispatch failed:', err?.message || err);
    throw new Error(`Resend API email dispatch failed: ${err?.message || 'Unknown email API error'}`);
  }
}

/**
 * Dispatches notification/progress updates using Resend's HTTPS email API.
 */
export async function sendGuardianNotificationEmail(
  toEmail: string,
  subject: string,
  text: string,
  _creds: DynamicSmtpCredentials
): Promise<boolean> {
  const { resend, fromEmail } = getResendConfig();

  const mailOptions = {
    from: `"Airport Assistance Navigation" <${fromEmail}>`,
    to: toEmail,
    subject,
    text: `Hello,

${text}

Regards,
Smart Airport Navigation System`,
  };

  try {
    const { data, error } = await resend.emails.send(mailOptions);
    if (error) {
      throw new Error(error.message);
    }

    console.log('[Mailer] Resend notification email sent successfully to %s, messageId: %s', toEmail, data?.id);
    return true;
  } catch (err: any) {
    console.error('[Mailer] Resend notification email dispatch failed:', err?.message || err);
    throw new Error(`Resend API email dispatch failed: ${err?.message || 'Unknown email API error'}`);
  }
}
