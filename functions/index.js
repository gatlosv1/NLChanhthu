const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cors = require('cors');

admin.initializeApp();

const corsHandler = cors({
  origin: true,
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

const ZAPIER_SECRET = process.env.ZAPIER_SECRET || 'replace-with-your-secret';
const GMAIL_USER = process.env.GMAIL_USER || 'your-gmail@gmail.com';
const GMAIL_PASS = process.env.GMAIL_PASS || '';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS
  }
});

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  return authHeader.replace(/^Bearer\s+/i, '').trim();
}

function normalizeIncomingPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  if (Array.isArray(payload)) {
    return { items: payload };
  }

  return payload;
}

exports.zapierWebhook = functions.region('asia-southeast1').https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Method not allowed' });
      return;
    }

    const token = getBearerToken(req);
    if (!token || token !== ZAPIER_SECRET) {
      res.status(401).json({ ok: false, message: 'Unauthorized: invalid or missing Authorization bearer token' });
      return;
    }

    try {
      const payload = normalizeIncomingPayload(req.body || {});
      const docData = {
        source: 'zapier',
        eventType: payload.eventType || payload.type || 'incoming',
        payload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        receivedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const docRef = await admin.firestore().collection('zapierInbound').add(docData);

      res.status(200).json({
        ok: true,
        message: 'Zapier payload received and saved to Firestore',
        docId: docRef.id
      });
    } catch (error) {
      console.error('zapierWebhook error:', error);
      res.status(500).json({
        ok: false,
        message: error && error.message ? error.message : 'Lỗi xử lý webhook từ Zapier'
      });
    }
  });
});

exports.sendProductionReport = functions.region('asia-southeast1').https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Method not allowed' });
      return;
    }

    try {
      const { recipients, subject, html, reportDate } = req.body || {};

      if (!Array.isArray(recipients) || recipients.length === 0) {
        res.status(400).json({ ok: false, message: 'Danh sách người nhận không hợp lệ' });
        return;
      }

      const validRecipients = recipients
        .map((item) => String(item).trim())
        .filter((email) => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

      if (!validRecipients.length) {
        res.status(400).json({ ok: false, message: 'Không có email hợp lệ trong recipients' });
        return;
      }

      const finalSubject = subject || `[Báo cáo Chanh Thu] ${reportDate || new Date().toISOString()}`;
      const finalHtml = html || '<p>Không có nội dung báo cáo.</p>';

      const mailOptions = {
        from: `Báo cáo Chanh Thu <${GMAIL_USER}>`,
        to: validRecipients.join(', '),
        subject: finalSubject,
        html: finalHtml,
        replyTo: GMAIL_USER
      };

      await transporter.sendMail(mailOptions);

      res.status(200).json({
        ok: true,
        message: 'Đã gửi email thành công'
      });
    } catch (error) {
      console.error('sendProductionReport error:', error);
      res.status(500).json({
        ok: false,
        message: error && error.message ? error.message : 'Lỗi gửi email'
      });
    }
  });
});
