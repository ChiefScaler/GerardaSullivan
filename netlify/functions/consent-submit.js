// netlify/functions/consent-submit.js
//
// Receives a signed /consent submission: the form details plus the signed PDF
// that was built in the visitor's browser (src/js/consent.js).
//   1. Light validation + anti-spam (honeypot, minimum time-on-page).
//   2. Emails each signer their own copy of the signed PDF (Gmail SMTP via nodemailer).
//   3. Emails Gerarda a copy (production only) with the payment route.
//   4. Stores ONLY a small hashed "already signed" record per email address.
//      The PDF and health/insurance details are NOT stored on the server:
//      they exist only in the emails.
//
// Environment variables (Netlify -> Project configuration -> Environment variables):
//   PRACTICE_GMAIL_USER, PRACTICE_GMAIL_APP_PASSWORD   (required)
//   PRACTICE_NOTIFY_EMAIL        (optional; default info@gerarda-sullivan-counselling.com)
//   PRACTICE_TEST_NOTIFY_EMAIL   (optional; on previews, the "Gerarda copy" goes here
//                                 instead, so the whole flow can be tested safely)
//
// Safety: unless the request arrives on gerarda-sullivan-counselling.com (the live site),
// Gerarda is NOT emailed and subjects are tagged [TEST].

const crypto = require('crypto');
const nodemailer = require('nodemailer');

const MAX_PDF_BYTES = 4 * 1024 * 1024;

function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function isValidEmail(v) { return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254; }
function emailHash(email) { return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex'); }
function fail(statusCode, error) { return { statusCode, body: JSON.stringify({ ok: false, error }) }; }
function makeReference() { return 'GS-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(); }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return fail(405, 'Method not allowed');

  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return fail(400, 'Invalid submission.'); }
  if (p.hpTrap) return fail(400, 'Something went wrong with the form. Please refresh the page and try again, or email info@gerarda-sullivan-counselling.com.');
  if (typeof p.msSinceLoad === 'number' && p.msSinceLoad < 2500) return fail(400, 'Please take a moment to review the agreement before signing.');

  const rawClients = Array.isArray(p.clients) ? p.clients.slice(0, 2) : [];
  if (rawClients.length < 1) return fail(400, 'Please complete the signing form.');
  const clients = [];
  for (const c of rawClients) {
    const fullName = clean(c && c.fullName, 120);
    const email = clean(c && c.email, 254).toLowerCase();
    if (fullName.length < 2) return fail(400, 'Please enter each person’s full name.');
    if (!isValidEmail(email)) return fail(400, 'Please enter a valid email address for each person.');
    clients.push({ fullName, email });
  }
  if (clients.length === 2 && clients[0].email === clients[1].email) return fail(400, 'Each person must use their own, different email address.');
  if (!['self', 'insurer', 'referral'].includes(p.pay)) return fail(400, 'Please choose how sessions will be paid for.');
  const plan = p.plan === '2' ? 'couples' : 'individual';
  if (plan === 'couples' && clients.length !== 2) return fail(400, 'Both people must sign for couples therapy.');

  if (typeof p.pdfBase64 !== 'string' || !p.pdfBase64) return fail(400, 'Signed copy missing. Please try again.');
  const pdf = Buffer.from(p.pdfBase64, 'base64');
  if (pdf.length < 1000 || pdf.length > MAX_PDF_BYTES || pdf.slice(0, 5).toString() !== '%PDF-') return fail(400, 'Signed copy could not be read. Please try again.');

  // Test mode unless the request came in on the real website domain. (Netlify's CONTEXT
  // variable is not reliably available at runtime, so we go by the host instead.)
  const host = String((event.headers && (event.headers['x-forwarded-host'] || event.headers.host)) || '').toLowerCase().split(':')[0];
  const isTest = !/(^|\.)gerarda-sullivan-counselling\.com$/.test(host);
  const reference = makeReference();
  const signedAt = new Date();
  const signedAtDisplay = signedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' at ' + signedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
  const payLabel = { self: 'Self-pay', insurer: 'Health insurer', referral: 'Referral' }[p.pay];

  // Hashed "already signed" record only (non-fatal). No health data is stored.
  try {
    const { getStore } = require('@netlify/blobs');
    const idx = getStore('signed-clients');
    const prefix = isTest ? 'test/' : '';
    for (const c of clients) {
      await idx.setJSON(`${prefix}${emailHash(c.email)}.json`, { reference, contractVersion: clean(p.version, 80), signedAt: signedAt.toISOString() });
    }
  } catch (err) {
    console.error('Record storage failed (non-fatal)', err && err.message);
  }

  const gmailUser = process.env.PRACTICE_GMAIL_USER;
  const gmailPass = process.env.PRACTICE_GMAIL_APP_PASSWORD;
  const notifyEmail = process.env.PRACTICE_NOTIFY_EMAIL || 'info@gerarda-sullivan-counselling.com';
  if (!gmailUser || !gmailPass) {
    console.error('Missing PRACTICE_GMAIL_USER / PRACTICE_GMAIL_APP_PASSWORD env vars');
    return fail(500, 'Email delivery is not yet configured. Please contact info@gerarda-sullivan-counselling.com directly.');
  }

  try {
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: gmailUser, pass: gmailPass } });
    const attachment = { filename: `${reference}-signed-agreement.pdf`, content: pdf, contentType: 'application/pdf' };
    const tag = isTest ? '[TEST] ' : '';

    for (const c of clients) {
      const other = clients.length === 2 ? clients.find((x) => x !== c) : null;
      await transporter.sendMail({
        from: `Gerarda Sullivan Counselling <${gmailUser}>`,
        to: c.email,
        subject: `${tag}Your signed therapy agreement (${reference})`,
        text: `Hi ${c.fullName},\n\nThank you for signing your therapy agreement${other ? ' together with ' + other.fullName : ''}. A copy is attached for your records.\n\nReference: ${reference}\nSigned: ${signedAtDisplay}\n\nIf anything looks wrong, just reply to this email.\n\nWarm wishes,\nGerarda${isTest ? '\n\n(This is a test from a preview version of the website.)' : ''}`,
        attachments: [attachment]
      });
    }

    const practiceTo = isTest ? process.env.PRACTICE_TEST_NOTIFY_EMAIL : notifyEmail;
    if (practiceTo) {
      await transporter.sendMail({
        from: `Website <${gmailUser}>`,
        to: practiceTo,
        subject: `${tag}New signed agreement (${payLabel}, ${plan}): ${clients.map((c) => c.fullName).join(' & ')} (${reference})`,
        text: `${clients.map((c) => `${c.fullName} (${c.email})`).join(' and ')} signed the therapy agreement.\n\nSessions: ${plan}\nPayment route: ${payLabel}\n${p.pay === 'self' ? '' : 'ACTION: check the details in the attached PDF, then email them their personal booking link (within 2 working days).\n'}\nReference: ${reference}\nSigned: ${signedAtDisplay}\n\nA copy is attached.`,
        attachments: [attachment]
      });
    }
  } catch (err) {
    console.error('Email delivery failed', err && err.message);
    return fail(500, 'We could not email your signed copy. Please download it from this page and contact info@gerarda-sullivan-counselling.com.');
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, reference, signedAtDisplay, test: isTest }) };
};
