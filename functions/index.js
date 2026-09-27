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

const transporter = GMAIL_USER && GMAIL_PASS
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_PASS
      }
    })
  : null;

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
      const { recipients, subject, html, reportDate, senderEmail } = req.body || {};
      const senderAddress = typeof senderEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail.trim())
        ? senderEmail.trim()
        : GMAIL_USER;

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

      if (!transporter) {
        res.status(500).json({
          ok: false,
          message: 'Cấu hình Gmail chưa được thiết lập. Vui lòng đặt GMAIL_USER và GMAIL_PASS cho Firebase Function.'
        });
        return;
      }

      const mailOptions = {
        from: `Báo cáo Chanh Thu <${senderAddress}>`,
        to: validRecipients.join(', '),
        subject: finalSubject,
        html: finalHtml,
        replyTo: senderAddress
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

/**
 * Applies an immutable event's material-balance delta to its lot cache.
 * The marker collection makes the update safe if Firestore retries the trigger.
 */
exports.onStageEventCreated = functions.region('asia-southeast1')
  .firestore.document('stage_events/{eventId}')
  .onCreate(async (snapshot, context) => {
    const event = snapshot.data() || {};
    const lotId = typeof event.lotId === 'string' ? event.lotId.trim() : '';
    const quantityDeltaKg = Number(event.quantityDeltaKg);

    if (!lotId) {
      console.error('stage_events document is missing lotId', context.params.eventId);
      return null;
    }
    if (!Number.isFinite(quantityDeltaKg)) {
      console.error('stage_events document is missing a valid quantityDeltaKg', context.params.eventId);
      return null;
    }

    const db = admin.firestore();
    const lotRef = db.collection('lots').doc(lotId);
    const appliedRef = db.collection('stage_event_cache_applications').doc(context.params.eventId);

    await db.runTransaction(async (transaction) => {
      const [lotSnapshot, appliedSnapshot] = await Promise.all([
        transaction.get(lotRef),
        transaction.get(appliedRef)
      ]);

      if (appliedSnapshot.exists) return;
      if (!lotSnapshot.exists) {
        throw new Error(`Lot ${lotId} does not exist for event ${context.params.eventId}`);
      }

      const currentQuantityKg = Number(lotSnapshot.get('currentQuantityKg') || 0);
      const nextQuantityKg = currentQuantityKg + quantityDeltaKg;
      if (nextQuantityKg < -0.000001) {
        throw new Error(`Event ${context.params.eventId} would make lot ${lotId} quantity negative`);
      }

      transaction.update(lotRef, {
        currentQuantityKg: nextQuantityKg,
        quantityCacheUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastEventId: context.params.eventId,
        lastStageId: event.stageId || null
      });
      transaction.create(appliedRef, {
        eventId: context.params.eventId,
        lotId,
        quantityDeltaKg,
        appliedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    return null;
  });

/**
 * Trusted write boundary for append-only production events. Clients cannot
 * write stage_events directly; their authenticated UID becomes operatorId.
 */
exports.recordStageEvent = functions.region('asia-southeast1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Bạn cần đăng nhập để ghi nhận công đoạn.');
  }

  const lotId = typeof data?.lotId === 'string' ? data.lotId.trim() : '';
  const stageId = typeof data?.stageId === 'string' ? data.stageId.trim() : '';
  const rejectReasonId = typeof data?.rejectReasonId === 'string' ? data.rejectReasonId.trim() : null;
  const inputKg = Number(data?.inputKg);
  const acceptedKg = Number(data?.acceptedKg);
  const rejectedKg = Number(data?.rejectedKg);
  const quantityDeltaKg = Number(data?.quantityDeltaKg ?? 0);

  if (!lotId || !stageId) {
    throw new functions.https.HttpsError('invalid-argument', 'lotId và stageId là bắt buộc.');
  }
  if (![inputKg, acceptedKg, rejectedKg, quantityDeltaKg].every(Number.isFinite)
    || inputKg < 0 || acceptedKg < 0 || rejectedKg < 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Khối lượng phải là số hợp lệ không âm.');
  }
  if (acceptedKg + rejectedKg > inputKg + 0.000001) {
    throw new functions.https.HttpsError('invalid-argument', 'Khối lượng đạt và loại không được vượt khối lượng vào.');
  }

  const db = admin.firestore();
  const [lotSnapshot, stageSnapshot, rejectSnapshot, userSnapshot] = await Promise.all([
    db.collection('lots').doc(lotId).get(),
    db.collection('process_stages').doc(stageId).get(),
    rejectReasonId ? db.collection('reject_reasons').doc(rejectReasonId).get() : Promise.resolve(null),
    db.collection('users').doc(context.auth.uid).get()
  ]);

  if (!lotSnapshot.exists) {
    throw new functions.https.HttpsError('not-found', `Không tìm thấy lô ${lotId}.`);
  }
  if (!stageSnapshot.exists) {
    throw new functions.https.HttpsError('failed-precondition', `Công đoạn ${stageId} chưa được cấu hình.`);
  }
  if (rejectReasonId && !rejectSnapshot.exists) {
    throw new functions.https.HttpsError('failed-precondition', `Lý do loại ${rejectReasonId} chưa được cấu hình.`);
  }

  const operator = userSnapshot.exists ? userSnapshot.data() : {};
  const eventRef = db.collection('stage_events').doc();
  await eventRef.create({
    lotId,
    stageId,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    inputKg,
    acceptedKg,
    rejectedKg,
    rejectReasonId,
    quantityDeltaKg,
    operatorId: context.auth.uid,
    operatorName: operator.name || context.auth.token.name || '',
    operatorEmail: context.auth.token.email || '',
    rework: Boolean(data?.rework),
    outputLotIds: Array.isArray(data?.outputLotIds)
      ? data.outputLotIds.filter((id) => typeof id === 'string' && id.trim())
      : []
  });

  return { eventId: eventRef.id };
});
