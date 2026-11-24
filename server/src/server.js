import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId || !process.env.FIREBASE_WEB_API_KEY || !process.env.ADMIN_UIDS) {
  throw new Error('Missing FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY, or ADMIN_UIDS. Configure server/.env.');
}
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const auth = getAuth();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '24kb' }));
const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
app.use(cors({ origin(origin, cb) { if (!origin || origins.includes(origin)) cb(null, true); else cb(new Error('Origin not allowed')); }, methods: ['GET','POST','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','Idempotency-Key'] }));

const admins = new Set(process.env.ADMIN_UIDS.split(',').map(x => x.trim()).filter(Boolean));
const now = () => FieldValue.serverTimestamp();
const bad = (status, message) => Object.assign(new Error(message), { status });
const trim = (v, length = 160) => typeof v === 'string' ? v.trim().slice(0, length) : '';
const status = (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };
app.use('/api/portal', status);
const moneyLimit = (v, max) => Number.isSafeInteger(v) && v > 0 && v <= max;
const toIso = (value) => value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value ?? null;
const serialize = (v) => {
  if (Array.isArray(v)) return v.map(serialize);
  if (v && typeof v === 'object') {
    if (typeof v.toDate === 'function') return toIso(v);
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, serialize(val)]));
  }
  return v;
};
const rows = async (col, field, value, limit = 100) => {
  const query = field ? db.collection(col).where(field, '==', value) : db.collection(col);
  const snap = await query.limit(limit).get();
  return snap.docs.map(d => ({ id: d.id, ...serialize(d.data()) }));
};
const one = async (col, id) => { const doc = await db.collection(col).doc(id).get(); return doc.exists ? { id: doc.id, ...serialize(doc.data()) } : null; };
const serviceError = (error) => error?.error?.message || error?.message || 'Request failed';
// A small per-process anti-abuse guard for public authentication endpoints.
// Put rate limits at your hosting edge as well for multi-instance deployments.
const attempts = new Map();
function authRateLimit(req, res, next) {
  const key = String(req.ip || req.socket.remoteAddress || 'unknown');
  const t = Date.now();
  const windowMs = 10 * 60 * 1000;
  const old = attempts.get(key);
  const item = (!old || old.resetAt <= t) ? { count: 0, resetAt: t + windowMs } : old;
  item.count++;
  attempts.set(key, item);
  if (attempts.size > 20000) for (const [ip, record] of attempts) if (record.resetAt <= t) attempts.delete(ip);
  if (item.count > 15) return res.status(429).json({ error: { message: 'Too many attempts. Please try later.' } });
  next();
}
app.use(['/api/portal/auth/login', '/api/portal/auth/register'], authRateLimit);

async function requireUser(req, res, next) {
  try {
    const token = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
    if (!token) throw bad(401, 'Sign in to continue.');
    const user = await auth.verifyIdToken(token, true);
    req.user = user;
    req.isAdmin = admins.has(user.uid) || user.admin === true;
    next();
  } catch (e) { next(e.status ? e : bad(401, 'Your session is invalid or expired. Please sign in again.')); }
}
function requireAdmin(req, res, next) { if (!req.isAdmin) next(bad(403, 'Administrator access required.')); else next(); }
function requireCustomer(req, res, next) { if (req.isAdmin) next(bad(403, 'Use the customer portal with a customer account.')); else next(); }

app.get('/api/portal/health', (_req, res) => res.json({ status: 'ok', service: 'gotham-portal-api' }));

// Authenticate against the SAME Firebase Authentication project already used by the bank.
// The Web API key identifies the project; it is not privileged authorization.
app.post('/api/portal/auth/login', async (req, res, next) => {
  try {
    const email = trim(req.body?.email, 254);
    const password = req.body?.password;
    if (!email || typeof password !== 'string') throw bad(400, 'Email and password required.');
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(process.env.FIREBASE_WEB_API_KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await r.json();
    if (!r.ok) throw bad(401, 'Invalid credentials or authentication service unavailable.');
    const verified = await auth.verifyIdToken(data.idToken, true);
    const role = (admins.has(verified.uid) || verified.admin === true) ? 'admin' : 'customer';
    res.json({ uid: verified.uid, email: verified.email, token: data.idToken, expiresIn: Number(data.expiresIn), role });
  } catch (e) { next(e); }
});

app.post('/api/portal/auth/register', async (req, res, next) => {
  try {
    const { email, password, name, phone, documentType, documentRefLast4 } = req.body || {};
    const normalizedEmail = trim(email, 254).toLowerCase();
    const fullName = trim(name, 120);
    const mobile = trim(phone, 15);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail) || typeof password !== 'string' || password.length < 8 ||
        fullName.length < 2 || !/^\d{10}$/.test(mobile) || !['PAN','AADHAAR','PASSPORT'].includes(documentType) ||
        !/^[A-Za-z0-9]{4}$/.test(documentRefLast4 || '')) throw bad(400, 'Complete all registration fields with a valid email, password, phone and last-four reference.');
    // Registration never allows client-selected roles or balance values.
    const created = await auth.createUser({ email: normalizedEmail, password, displayName: fullName, disabled: false });
    const kycRef = db.collection('kyc_requests').doc();
    try {
      const batch = db.batch();
      batch.create(db.collection('users').doc(created.uid), { uid: created.uid, bankId: 'P628', email: normalizedEmail, fullName, phone: mobile, role: 'customer', status: 'PENDING', portalCreated: true, createdAt: now() });
      batch.create(kycRef, { uid: created.uid, customerUid: created.uid, bankId: 'P628', documentType, documentRefLast4: documentRefLast4.toUpperCase(), status: 'PENDING', openingDepositMinor: 100000, portalCreated: true, createdAt: now() });
      await batch.commit();
    } catch (error) {
      // Best effort rollback of newly created Auth user. A failed rollback needs admin attention.
      await auth.deleteUser(created.uid).catch(err => console.error('Auth cleanup required:', created.uid, err.message));
      throw error;
    }
    res.status(201).json({ success: true, message: 'Registration submitted for administrator review. Please sign in.', uid: created.uid });
  } catch (e) { next(e); }
});

app.use('/api/portal', requireUser);
app.get('/api/portal/me', async (req, res, next) => {
  try {
    const profile = await one('users', req.user.uid);
    res.json({ uid: req.user.uid, email: req.user.email, role: req.isAdmin ? 'admin' : 'customer',
      name: profile?.fullName || profile?.name || req.user.name || req.user.email?.split('@')[0] || 'Customer',
      status: profile?.status || 'UNKNOWN', phone: profile?.phone || '', profile });
  } catch(e){next(e);}
});

app.get('/api/portal/customer/beneficiaries', requireCustomer, async (req, res, next) => {
  try { res.json({ items: await rows('beneficiaries', 'uid', req.user.uid) }); } catch(e){next(e);}
});
app.post('/api/portal/customer/beneficiaries', requireCustomer, async (req, res, next) => {
  try {
    const { name, bankName, ifsc, accountNumber } = req.body || {};
    const label = trim(name, 120), bank = trim(bankName, 120), code = trim(ifsc, 11).toUpperCase(), number = trim(accountNumber, 34);
    if (!label || !bank || !/^[A-Z0-9]{11}$/.test(code) || !/^[A-Za-z0-9-]{4,34}$/.test(number)) throw bad(400, 'Valid beneficiary details required.');
    const ref = db.collection('beneficiaries').doc();
    await ref.create({ uid: req.user.uid, customerUid: req.user.uid, name: label, bankName: bank, ifsc: code, beneficiaryIfsc: code, accountNumber: number, beneficiaryAccountNumber: number, bankId: 'P628', createdAt: now(), portalCreated: true });
    res.status(201).json({ id: ref.id });
  } catch(e){next(e);}
});
app.delete('/api/portal/customer/beneficiaries/:id', requireCustomer, async (req, res, next) => {
  try {
    const ref = db.collection('beneficiaries').doc(req.params.id);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().uid !== req.user.uid) throw bad(404, 'Beneficiary not found.');
      if (!snap.data().portalCreated) throw bad(403, 'Existing beneficiaries are read-only in this extension.');
      tx.delete(ref);
    });
    res.json({ success: true });
  } catch(e){next(e);}
});
app.get('/api/portal/customer/loans', requireCustomer, async (req, res, next) => {
  try { res.json({ items: await rows('loans', 'uid', req.user.uid) }); } catch(e){next(e);}
});
app.post('/api/portal/customer/loans', requireCustomer, async (req, res, next) => {
  try {
    const { type, amountMinor, months } = req.body || {};
    if (!['Personal loan','Education loan','Vehicle loan','Home loan'].includes(type) || !moneyLimit(amountMinor, 100000000) || ![6,12,24,36,60].includes(months)) throw bad(400, 'Invalid loan details.');
    const ref = db.collection('loans').doc();
    await ref.create({ uid: req.user.uid, customerUid: req.user.uid, bankId: 'P628', type, amountMinor, months, status: 'PENDING', portalCreated: true, createdAt: now() });
    res.status(201).json({ id: ref.id, status: 'PENDING' });
  } catch(e){next(e);}
});
app.patch('/api/portal/customer/profile', requireCustomer, async (req, res, next) => {
  try {
    const name = trim(req.body?.name, 120), phone = trim(req.body?.phone, 15);
    if (!name || !/^\d{10}$/.test(phone)) throw bad(400, 'A name and 10-digit mobile are required.');
    const ref = db.collection('users').doc(req.user.uid);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists || !snap.data().portalCreated) throw bad(403, 'Profile editing is available only for new portal registrations.');
      tx.update(ref, { fullName: name, phone, updatedAt: now() });
    });
    res.json({ success: true });
  } catch(e){next(e);}
});
app.get('/api/portal/announcements', async (_req, res, next) => {
  try { res.json({ items: (await rows('portal_announcements', null, null, 100)).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))) }); } catch(e){next(e);}
});

app.get('/api/portal/admin/snapshot', requireAdmin, async (_req, res, next) => {
  try {
    const [users, accounts, kyc, transfers, loans, announcements] = await Promise.all([
      rows('users', null, null, 200), rows('accounts', null, null, 200), rows('kyc_requests', null, null, 200),
      rows('transfers', null, null, 200), rows('loans', null, null, 200), rows('portal_announcements', null, null, 100)
    ]);
    // Never include password hashes, tokens, or KYC ID values in the admin dashboard response.
    const safeUsers = users.map(({passwordHash, salt, documentPaths, ...profile}) => profile);
    const safeKyc = kyc.map(({ documentRefLast4, documentPaths, ...row}) => row);
    res.json({ users: safeUsers, accounts, kyc: safeKyc, transfers, loans, announcements, limits: { } });
  } catch(e){next(e);}
});

app.post('/api/portal/admin/kyc/:id/review', requireAdmin, async (req, res, next) => {
  try {
    const decision = req.body?.decision;
    if (!['APPROVED','HOLD','REJECTED'].includes(decision)) throw bad(400, 'Invalid KYC decision.');
    const ref = db.collection('kyc_requests').doc(req.params.id);
    const balance = 100000; // Approved demo onboarding; not a monetary transfer.
    await db.runTransaction(async tx => {
      const item = await tx.get(ref);
      if (!item.exists || !item.data().portalCreated) throw bad(403, 'Existing KYC records are read-only in this extension.');
      if (!['PENDING','HOLD'].includes(item.data().status)) throw bad(409, 'KYC was already finalized.');
      const uid = item.data().uid;
      const userRef = db.collection('users').doc(uid);
      const user = await tx.get(userRef);
      if (!user.exists || !user.data().portalCreated) throw bad(409, 'Customer registration is inconsistent.');
      const accountId = `P628-PORTAL-${uid}`;
      const accRef = db.collection('accounts').doc(accountId);
      const account = await tx.get(accRef);
      if (decision === 'APPROVED' && account.exists) throw bad(409, 'Account already exists; investigate before retrying.');
      const newStatus = decision === 'APPROVED' ? 'ACTIVE' : decision;
      tx.update(ref, { status: decision, reviewedBy: req.user.uid, reviewedAt: now() });
      tx.update(userRef, { status: newStatus, updatedAt: now() });
      if (decision === 'APPROVED') {
        const suffix = crypto.createHash('sha256').update(uid).digest('hex').slice(0, 12).toUpperCase();
        const number = `P628${BigInt('0x' + suffix).toString().slice(-11).padStart(11, '0')}`;
        tx.create(accRef, { accountId, accountNumber: number, customerUid: uid, uid, currency: 'INR', status: 'ACTIVE', postedBalanceMinor: balance, heldMinor: 0, availableMinor: balance, portalCreated: true, createdAt: now() });
        const ledgerRef = db.collection('ledger_entries').doc(`PORTAL-OPEN-${uid}`);
        tx.create(ledgerRef, { transferId: `PORTAL-OPEN-${uid}`, accountId, direction: 'CREDIT', amountMinor: balance, postedAt: now(), note: 'Synthetic opening balance, approved account', portalCreated: true });
      }
    });
    res.json({ success: true, status: decision });
  } catch(e){next(e);}
});

app.post('/api/portal/admin/loans/:id/review', requireAdmin, async (req, res, next) => {
  try {
    const decision = req.body?.decision;
    if (!['APPROVED','REJECTED'].includes(decision)) throw bad(400, 'Invalid decision.');
    const ref = db.collection('loans').doc(req.params.id);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists || !snap.data().portalCreated) throw bad(403, 'Existing loans are read-only.');
      if (snap.data().status !== 'PENDING') throw bad(409, 'Already reviewed.');
      tx.update(ref, { status: decision, reviewedBy: req.user.uid, reviewedAt: now(), disbursedMinor: 0 });
    });
    res.json({ success: true, status: decision, disbursed: false });
  } catch(e){next(e);}
});
app.post('/api/portal/admin/announcements', requireAdmin, async (req, res, next) => {
  try {
    const title = trim(req.body?.title, 80), body = trim(req.body?.body, 500);
    if (!title || !body) throw bad(400, 'Announcement title and content required.');
    const ref = db.collection('portal_announcements').doc();
    await ref.create({ title, body, createdBy: req.user.uid, createdAt: now(), bankId: 'P628' });
    res.status(201).json({ id: ref.id });
  } catch(e){next(e);}
});

app.use((req, res) => res.status(404).json({ error: { message: 'Unknown API endpoint.' } }));
app.use((err, req, res, _next) => {
  const status = Number(err.status) ||
    (['auth/email-already-exists','already-exists',6].includes(err.code) ? 409 : 500);
  if (status >= 500) console.error('Portal API error:', err);
  res.status(status).json({ error: { message: status >= 500 ? 'The banking API could not complete this request.' : serviceError(err) } });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`Gotham portal API listening on http://localhost:${port}`));
