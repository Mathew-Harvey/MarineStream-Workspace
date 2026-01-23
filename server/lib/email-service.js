/**
 * MarineStream Workspace - Email Service
 * Handles sending emails (call invitations, notifications)
 */

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.warn('nodemailer not installed - email functionality disabled');
}

// Email transporter (created lazily)
let transporter = null;

/**
 * Get or create the email transporter
 */
function getTransporter() {
  if (transporter) return transporter;
  
  if (!nodemailer) {
    console.warn('nodemailer not available');
    return null;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('Email not configured - missing SMTP credentials');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT) || 587,
    secure: parseInt(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  return transporter;
}

/**
 * Send call invitation email
 */
async function sendCallInvitation(toEmail, fromUserName, inviteToken, channelName) {
  const transport = getTransporter();
  
  if (!transport) {
    console.log(`📧 [MOCK] Would send call invite to ${toEmail} from ${fromUserName}`);
    return { success: true, mock: true };
  }

  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const joinUrl = `${baseUrl}?join_call=${inviteToken}`;

  const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER;

  try {
    await transport.sendMail({
      from: `"MarineStream" <${emailFrom}>`,
      to: toEmail,
      subject: `${fromUserName} is inviting you to a video call`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Video Call Invitation</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #1e293b;
              margin: 0;
              padding: 0;
              background-color: #f1f5f9;
            }
            .container {
              max-width: 560px;
              margin: 40px auto;
              background: white;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
              background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
              color: white;
              padding: 32px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 600;
            }
            .content {
              padding: 32px;
              text-align: center;
            }
            .avatar {
              width: 80px;
              height: 80px;
              background: #f97316;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 32px;
              font-weight: 600;
              margin: 0 auto 16px;
            }
            .message {
              font-size: 18px;
              margin-bottom: 24px;
            }
            .message strong {
              color: #f97316;
            }
            .join-btn {
              display: inline-block;
              background: #22c55e;
              color: white;
              text-decoration: none;
              padding: 16px 32px;
              border-radius: 8px;
              font-size: 16px;
              font-weight: 600;
              margin-bottom: 16px;
            }
            .join-btn:hover {
              background: #16a34a;
            }
            .note {
              font-size: 14px;
              color: #64748b;
            }
            .footer {
              background: #f8fafc;
              padding: 20px 32px;
              text-align: center;
              font-size: 12px;
              color: #94a3b8;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚢 MarineStream</h1>
            </div>
            <div class="content">
              <div class="avatar">${fromUserName ? fromUserName.charAt(0).toUpperCase() : '?'}</div>
              <p class="message">
                <strong>${fromUserName}</strong> is inviting you to a video call on MarineStream Workspace.
              </p>
              <a href="${joinUrl}" class="join-btn">
                Join Video Call
              </a>
              <p class="note">
                This invitation link will expire in 24 hours.
              </p>
            </div>
            <div class="footer">
              <p>MarineStream Workspace - Maritime biofouling management</p>
              <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `${fromUserName} is inviting you to a video call on MarineStream Workspace.\n\nJoin the call: ${joinUrl}\n\nThis invitation link will expire in 24 hours.`
    });

    console.log(`📧 Sent call invitation to ${toEmail}`);
    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send notification email
 */
async function sendNotification(toEmail, subject, htmlContent, textContent) {
  const transport = getTransporter();
  
  if (!transport) {
    console.log(`📧 [MOCK] Would send notification to ${toEmail}: ${subject}`);
    return { success: true, mock: true };
  }

  const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER;

  try {
    await transport.sendMail({
      from: `"MarineStream" <${emailFrom}>`,
      to: toEmail,
      subject,
      html: htmlContent,
      text: textContent
    });

    console.log(`📧 Sent notification to ${toEmail}: ${subject}`);
    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendCallInvitation,
  sendNotification
};
