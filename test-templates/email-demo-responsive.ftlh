<!DOCTYPE html>
<html>
<head>
<title>Welcome to Acme — Action Required</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<style>
  body { margin: 0; padding: 0; background: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #222; }
  .container { width: 100%; max-width: 600px; margin: 0 auto; background: #ffffff; }
  .header { background: linear-gradient(135deg, #4a3aff, #8a2be2); padding: 32px 24px; color: #ffffff; text-align: center; }
  .header h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; }
  .header p { margin: 0; font-size: 15px; opacity: 0.9; }
  .hero { padding: 40px 32px; }
  .hero h2 { margin: 0 0 16px; font-size: 22px; color: #1a1a1a; }
  .hero p { margin: 0 0 24px; font-size: 16px; line-height: 1.55; color: #444; }
  .cta-wrap { text-align: center; margin: 28px 0 8px; }
  .cta { display: inline-block; padding: 14px 36px; background: #4a3aff; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; }
  .stats { display: flex; gap: 16px; padding: 24px 32px; background: #fafafa; border-top: 1px solid #eee; border-bottom: 1px solid #eee; }
  .stat { flex: 1; text-align: center; }
  .stat .num { display: block; font-size: 22px; font-weight: 700; color: #4a3aff; margin-bottom: 4px; }
  .stat .label { font-size: 12px; color: #777; text-transform: uppercase; letter-spacing: 0.5px; }
  .footer { padding: 24px 32px; text-align: center; font-size: 12px; color: #999; }
  .footer a { color: #4a3aff; text-decoration: none; }

  /* Mobile: collapse padding, stack the stats, shrink the hero type. */
  @media (max-width: 480px) {
    .header { padding: 24px 16px; }
    .header h1 { font-size: 22px; }
    .hero { padding: 24px 16px; }
    .hero h2 { font-size: 18px; }
    .hero p { font-size: 15px; }
    .cta { display: block; padding: 14px 16px; }
    .stats { flex-direction: column; gap: 12px; padding: 16px; }
    .footer { padding: 16px; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Hi ${user.firstName}, welcome to Acme</h1>
    <p>You're one step away from getting started</p>
  </div>

  <div class="hero">
    <h2>Verify your email to activate your account</h2>
    <p>Hi ${user.firstName}, thanks for signing up. Click the button below to verify the email address on file (${user.email}) and unlock your dashboard.</p>

    <div class="cta-wrap">
      <a href="${verifyUrl}" class="cta">Verify email address</a>
    </div>
  </div>

  <div class="stats">
    <div class="stat">
      <span class="num">${stats.users}</span>
      <span class="label">Active users</span>
    </div>
    <div class="stat">
      <span class="num">${stats.projects}</span>
      <span class="label">Projects shipped</span>
    </div>
    <div class="stat">
      <span class="num">${stats.uptime}</span>
      <span class="label">Uptime</span>
    </div>
  </div>

  <div class="footer">
    <p>Sent to ${user.email} by Acme Inc. — <a href="${unsubscribeUrl}">unsubscribe</a></p>
    <p>123 Main Street, San Francisco, CA 94103</p>
  </div>
</div>
</body>
</html>
