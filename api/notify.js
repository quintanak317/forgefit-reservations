const { URLSearchParams } = require("url");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function sendResend({ apiKey, from, to, subject, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend error: ${text}`);
  }
}

async function sendTwilio({ accountSid, authToken, from, to, body }) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const form = new URLSearchParams({ From: from, To: to, Body: body });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twilio error: ${text}`);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const secret = process.env.NOTIFY_WEBHOOK_SECRET;
  if (secret && req.headers["x-webhook-secret"] !== secret) {
    return json(res, 401, { error: "Unauthorized" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json(res, 500, { error: "Missing Supabase service role env vars" });
  }

  const payload = req.body || {};
  const record = payload.record || payload;
  if (!record || !record.id || !record.user_id || !record.message) {
    return json(res, 200, { status: "ignored" });
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${record.user_id}&select=email,phone`,
    { headers }
  );
  const profiles = await profileRes.json();
  const profile = profiles[0];

  let sentEmail = false;
  let sentSms = false;

  try {
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM && profile?.email) {
      await sendResend({
        apiKey: process.env.RESEND_API_KEY,
        from: process.env.RESEND_FROM,
        to: profile.email,
        subject: "ForgeFit Notification",
        html: `<p>${record.message}</p>`,
      });
      sentEmail = true;
    }

    if (
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM &&
      profile?.phone
    ) {
      await sendTwilio({
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        from: process.env.TWILIO_FROM,
        to: profile.phone,
        body: record.message,
      });
      sentSms = true;
    }
  } catch (error) {
    return json(res, 500, { error: error.message });
  }

  await fetch(`${supabaseUrl}/rest/v1/notifications?id=eq.${record.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      sent_email: sentEmail,
      sent_sms: sentSms,
      sent_at: new Date().toISOString(),
    }),
  });

  return json(res, 200, { status: "sent", sentEmail, sentSms });
};
