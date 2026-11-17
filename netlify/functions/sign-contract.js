// netlify/functions/sign-contract.js
//
// Handles a submission from sign-contract.html — one Client, or two Clients
// (couples) each with their own email address.
//   1. Validates input + lightweight anti-spam (honeypot, minimum time-on-page).
//   2. Builds ONE signed PDF (pdf-lib) containing the agreement, each Client's
//      details and typed signature, and Gerarda's pre-printed signature.
//      Wording comes from ./agreement-content.js (single source of truth).
//   3. Emails each Client their own copy, and the practice inbox a copy,
//      via Gmail SMTP (nodemailer) — no e-signature subscription.
//   4. Stores an audit record + the PDF in Netlify Blobs, plus a small
//      "already signed" record per email address (hashed) so we can tell
//      who has signed which version of the agreement.
//
// Environment variables (Netlify → Project configuration → Environment variables):
//   PRACTICE_GMAIL_USER, PRACTICE_GMAIL_APP_PASSWORD   (required)
//   PRACTICE_NOTIFY_EMAIL   (optional; default info@gerarda-sullivan-counselling.com)
//
// Safety: on Netlify deploy previews / branch deploys (CONTEXT !== 'production')
// the practice inbox is NOT emailed, subjects are tagged [TEST], and the PDF is
// stamped as a test — so demos never reach Gerarda by accident.

const crypto = require('crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const nodemailer = require('nodemailer');
const { getStore } = require('@netlify/blobs');
const { VERSION: CONTRACT_VERSION, INTRO, SECTIONS } = require('./agreement-content');

const FOREST = rgb(0.1, 0.23, 0.16);
const SAGE = rgb(0.29, 0.45, 0.32);
const TEXT = rgb(0.16, 0.2, 0.1);
const MUTED = rgb(0.54, 0.52, 0.44);
const LINE = rgb(0.68, 0.75, 0.68);

const MAX = { short: 120, long: 300, text: 2000 };

function isValidEmail(v) { return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254; }
function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function emailHash(email) { return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex'); }
function makeReference() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `GSC-${d}-${crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4)}`;
}
function fail(statusCode, error) { return { statusCode, body: JSON.stringify({ ok: false, error }) }; }

// Standard PDF fonts only cover WinAnsi — swap anything outside it so a name
// like "Zoë" is fine but unusual characters never crash PDF generation.
function safe(text) {
  return String(text).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\x20-\x7e -ÿ£€]/g, '?');
}

async function buildPdf({ signers, shared, ip, userAgent, reference, signedAt, isTest }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const script = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  const M = 56, W = 595.28, H = 841.89, CW = W - M * 2;
  let page, y;
  function addPage() {
    page = pdfDoc.addPage([W, H]); y = H - M;
    if (isTest) page.drawText('TEST DOCUMENT - preview only, not a real agreement', { x: M, y: H - 28, size: 8, font: bold, color: rgb(0.7, 0.2, 0.2) });
  }
  addPage();
  const need = (s) => { if (y - s < M) addPage(); };

  function wrap(text, f, size, width) {
    const out = []; let cur = '';
    for (const word of safe(text).split(' ')) {
      const t = cur ? cur + ' ' + word : word;
      if (f.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = word; } else cur = t;
    }
    if (cur) out.push(cur);
    return out;
  }
  function para(text, { size = 10, f = font, color = TEXT, gap = 13, indent = 0, lead } = {}) {
    let first = true;
    if (lead) {
      // bold lead-in on its own measured run, body continues after it
      const leadTxt = safe(lead) + ' ';
      const lw = bold.widthOfTextAtSize(leadTxt, size);
      const lines = wrap(text, f, size, CW - indent - lw);
      need(gap);
      page.drawText(leadTxt, { x: M + indent, y, size, font: bold, color });
      if (lines.length) { page.drawText(lines[0], { x: M + indent + lw, y, size, font: f, color }); }
      y -= gap;
      // remaining text re-wrapped at full width
      const rest = lines.slice(1).join(' ');
      if (rest) for (const l of wrap(rest, f, size, CW - indent)) { need(gap); page.drawText(l, { x: M + indent, y, size, font: f, color }); y -= gap; }
      return;
    }
    for (const l of wrap(text, f, size, CW - indent)) {
      need(gap); page.drawText(l, { x: M + indent, y, size, font: f, color }); y -= gap; first = false;
    }
  }
  function bullet(text, size = 10, gap = 13) {
    const lines = wrap(text, font, size, CW - 14);
    lines.forEach((l, i) => {
      need(gap);
      if (i === 0) page.drawText('-', { x: M + 2, y, size, font, color: SAGE });
      page.drawText(l, { x: M + 14, y, size, font, color: TEXT }); y -= gap;
    });
  }
  const rule = () => { need(14); page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: LINE }); y -= 14; };

  // Header
  para('Gerarda Sullivan Counselling & Psychotherapy', { size: 10, color: SAGE, gap: 16 });
  para('Client & Therapist Informed Consent Agreement', { size: 17, f: bold, color: FOREST, gap: 24 });
  para('Virtual (telehealth) counselling & psychotherapy', { size: 9, color: MUTED, gap: 14 });
  para(`Reference: ${reference}   |   Agreement version: ${CONTRACT_VERSION}`, { size: 8, color: MUTED, gap: 20 });
  para(INTRO, { size: 10, gap: 13 });
  y -= 8;

  // Client details tables
  const colW = signers.length === 2 ? (CW - 130) / 2 : CW - 130;
  function row(label, values) {
    const cellLines = values.map((v) => wrap(v || '-', font, 9, colW - 8));
    const n = Math.max(1, ...cellLines.map((c) => c.length));
    need(n * 12 + 8);
    page.drawText(safe(label), { x: M, y, size: 8.5, font: bold, color: FOREST });
    cellLines.forEach((lines, i) => lines.forEach((l, j) => page.drawText(l, { x: M + 130 + i * colW, y: y - j * 12, size: 9, font, color: TEXT })));
    y -= n * 12 + 4;
    page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.3, color: rgb(0.85, 0.87, 0.83) });
    y -= 6;
  }
  function tableHead(title) {
    need(40);
    para(title, { size: 11.5, f: bold, color: FOREST, gap: 16 });
    if (signers.length === 2) {
      page.drawText('Client 1', { x: M + 130, y, size: 8.5, font: bold, color: SAGE });
      page.drawText('Client 2', { x: M + 130 + colW, y, size: 8.5, font: bold, color: SAGE });
      y -= 14;
    }
  }
  const col = (k) => signers.map((s) => s[k]);

  tableHead('1. Client information');
  row('Full name', col('fullName')); row('Date of birth', col('dob')); row('Address', col('address'));
  row('Phone number', col('phone')); row('Email address', col('email'));
  y -= 8;
  tableHead('2. Emergency contact & GP');
  row('Emergency contact', col('emergencyName')); row('Phone', col('emergencyPhone')); row('Relationship', col('emergencyRelationship'));
  row('GP / healthcare provider', col('gpName')); row('GP address', col('gpAddress')); row('GP phone', col('gpPhone'));
  y -= 8;
  const sec3 = SECTIONS.find((x) => x.heading.startsWith('3.'));
  para(sec3.heading, { size: 11.5, f: bold, color: FOREST, gap: 16 });
  para(sec3.blocks[0].p, { size: 10, gap: 13 });
  y -= 8;
  para('4. Presenting issues', { size: 11.5, f: bold, color: FOREST, gap: 16 });
  para(shared.presentingIssues || '(none given)', { size: 10, gap: 13 });
  y -= 10;

  // Agreement body
  for (const s of SECTIONS) {
    if (s.heading.startsWith('15.') || s.heading.startsWith('3.')) continue; // rendered with the signature block
    need(44);
    para(s.heading, { size: 11.5, f: bold, color: FOREST, gap: 16 });
    for (const b of s.blocks) {
      if (b.ul) b.ul.forEach((t) => bullet(t));
      else para(b.p, { lead: b.lead });
      y -= 2;
    }
    y -= 8;
  }

  // Consent & signatures
  const sec15 = SECTIONS.find((s) => s.heading.startsWith('15.'));
  need(230);
  rule();
  para(sec15.heading, { size: 11.5, f: bold, color: FOREST, gap: 16 });
  para(sec15.blocks[0].p, { size: 10, gap: 14 });
  y -= 10;

  const dateStr = new Date(signedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const sigColW = signers.length === 2 ? CW / 2 : CW;
  const top = y;
  signers.forEach((s, i) => {
    const x = M + i * sigColW; let yy = top;
    page.drawText(signers.length === 2 ? `CLIENT ${i + 1}` : 'CLIENT', { x, y: yy, size: 8.5, font: bold, color: SAGE }); yy -= 26;
    page.drawText(safe(s.fullName), { x, y: yy, size: 20, font: script, color: FOREST, maxWidth: sigColW - 12 }); yy -= 6;
    page.drawLine({ start: { x, y: yy }, end: { x: x + sigColW - 20, y: yy }, thickness: 0.5, color: LINE }); yy -= 12;
    page.drawText(safe(`Signed by: ${s.fullName}`), { x, y: yy, size: 8.5, font, color: TEXT, maxWidth: sigColW - 12 }); yy -= 12;
    page.drawText(safe(`Email: ${s.email}`), { x, y: yy, size: 8.5, font, color: TEXT, maxWidth: sigColW - 12 }); yy -= 12;
    page.drawText(safe(`Signed in: ${s.place}`), { x, y: yy, size: 8.5, font, color: TEXT, maxWidth: sigColW - 12 }); yy -= 12;
    page.drawText(`Date signed: ${dateStr}`, { x, y: yy, size: 8.5, font, color: TEXT });
  });
  y = top - 26 - 6 - 12 - 12 * 3 - 14;

  // Therapist — always pre-signed
  y -= 18;
  need(90);
  page.drawText('THERAPIST', { x: M, y, size: 8.5, font: bold, color: SAGE }); y -= 26;
  page.drawText('Gerarda Sullivan', { x: M, y, size: 20, font: script, color: FOREST }); y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: M + 200, y }, thickness: 0.5, color: LINE }); y -= 12;
  page.drawText('Gerarda Sullivan · Registered Member MBACP 416049', { x: M, y, size: 8.5, font, color: TEXT }); y -= 12;
  page.drawText(`Date: ${dateStr}`, { x: M, y, size: 8.5, font, color: TEXT }); y -= 24;

  // Audit trail
  rule();
  para('Electronic signature record', { size: 9, f: bold, color: MUTED, gap: 12 });
  para(`Signed electronically on ${signedAt} (UTC). Each Client typed their own full name and confirmed consent from their own email address.`, { size: 8, color: MUTED, gap: 11 });
  para(`IP address: ${ip}`, { size: 8, color: MUTED, gap: 11 });
  para(`Browser: ${userAgent}`, { size: 8, color: MUTED, gap: 11 });
  para(`Reference ${reference} · Agreement version ${CONTRACT_VERSION}`, { size: 8, color: MUTED, gap: 11 });

  return pdfDoc.save();
}

function readSigner(raw, idx) {
  const s = raw || {};
  const out = {
    fullName: clean(s.fullName, MAX.short), email: clean(s.email, 254).toLowerCase(),
    dob: clean(s.dob, 40), address: clean(s.address, MAX.long), phone: clean(s.phone, 40),
    emergencyName: clean(s.emergencyName, MAX.short), emergencyPhone: clean(s.emergencyPhone, 40),
    emergencyRelationship: clean(s.emergencyRelationship, MAX.short),
    gpName: clean(s.gpName, MAX.short), gpAddress: clean(s.gpAddress, MAX.long), gpPhone: clean(s.gpPhone, 40),
    place: clean(s.place, MAX.short)
  };
  const who = idx === 1 ? 'Client 2' : 'Client 1';
  if (out.fullName.length < 2) return { error: `${who}: please enter your full name.` };
  if (!isValidEmail(out.email)) return { error: `${who}: please enter a valid email address.` };
  if (!out.dob) return { error: `${who}: please enter your date of birth.` };
  if (!out.address) return { error: `${who}: please enter your address.` };
  if (!out.phone) return { error: `${who}: please enter your phone number.` };
  if (!out.emergencyName || !out.emergencyPhone || !out.emergencyRelationship) return { error: `${who}: please complete your emergency contact details.` };
  if (!out.place) return { error: `${who}: please enter the town / country you are signing from.` };
  return { value: out };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return fail(405, 'Method not allowed');

  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return fail(400, 'Invalid submission.'); }
  if (p.companyWebsite) return fail(400, 'Submission rejected.');
  if (typeof p.msSinceLoad === 'number' && p.msSinceLoad < 2500) return fail(400, 'Please take a moment to review the agreement before signing.');
  if (p.agreed !== true) return fail(400, 'Please confirm you agree before signing.');

  const rawSigners = Array.isArray(p.signers) ? p.signers.slice(0, 2) : [];
  if (rawSigners.length < 1) return fail(400, 'Please complete the signing form.');
  const signers = [];
  for (let i = 0; i < rawSigners.length; i++) {
    const r = readSigner(rawSigners[i], i);
    if (r.error) return fail(400, r.error);
    signers.push(r.value);
  }
  if (signers.length === 2) {
    if (signers[0].email === signers[1].email) return fail(400, 'Each person must use their own, different email address.');
    if (signers[0].fullName.toLowerCase() === signers[1].fullName.toLowerCase()) return fail(400, 'Please enter each person’s own full name.');
  }
  const shared = { presentingIssues: clean(p.presentingIssues, MAX.text) };

  const isTest = (process.env.CONTEXT || 'production') !== 'production';
  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown';
  const userAgent = clean(event.headers['user-agent'] || 'unknown', 300);
  const reference = makeReference();
  const signedAtDate = new Date();
  const signedAt = signedAtDate.toISOString();
  const signedAtDisplay = signedAtDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' at ' + signedAtDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

  let pdfBytes;
  try {
    pdfBytes = await buildPdf({ signers, shared, ip, userAgent, reference, signedAt, isTest });
  } catch (err) {
    console.error('PDF generation failed', err);
    return fail(500, 'Could not generate your signed agreement. Please try again.');
  }

  // Audit trail + "already signed" records (non-fatal if storage hiccups;
  // test deploys write under a separate prefix so they never pollute real records).
  try {
    const store = getStore('signed-agreements');
    const prefix = isTest ? 'test/' : '';
    await store.setJSON(`${prefix}${reference}.json`, { reference, signers, shared, ip, userAgent, signedAt, contractVersion: CONTRACT_VERSION });
    await store.set(`${prefix}${reference}.pdf`, Buffer.from(pdfBytes));
    const idx = getStore('signed-clients');
    for (const s of signers) {
      await idx.setJSON(`${prefix}${emailHash(s.email)}.json`, { reference, contractVersion: CONTRACT_VERSION, signedAt });
    }
  } catch (err) {
    console.error('Blob storage failed', err);
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
    const attachment = { filename: `${reference}-signed-agreement.pdf`, content: Buffer.from(pdfBytes), contentType: 'application/pdf' };
    const tag = isTest ? '[TEST] ' : '';

    for (const s of signers) {
      await transporter.sendMail({
        from: `Gerarda Sullivan Counselling <${gmailUser}>`,
        to: s.email,
        subject: `${tag}Your signed therapy agreement (${reference})`,
        text: `Hi ${s.fullName},\n\nThank you for signing your therapy agreement${signers.length === 2 ? ' together with ' + (s === signers[0] ? signers[1] : signers[0]).fullName : ''}. A copy is attached for your records.\n\nReference: ${reference}\nSigned: ${signedAtDisplay}\n\nIf anything looks wrong, just reply to this email.\n\nWarm wishes,\nGerarda${isTest ? '\n\n(This is a test from a preview version of the website.)' : ''}`,
        attachments: [attachment]
      });
    }

    if (!isTest) {
      await transporter.sendMail({
        from: `Website <${gmailUser}>`,
        to: notifyEmail,
        subject: `New signed agreement: ${signers.map((s) => s.fullName).join(' & ')} (${reference})`,
        text: `${signers.map((s) => `${s.fullName} (${s.email})`).join(' and ')} signed the therapy agreement.\n\nReference: ${reference}\nSigned: ${signedAtDisplay}\nIP: ${ip}\n\nA copy is attached.`,
        attachments: [attachment]
      });
    }
  } catch (err) {
    console.error('Email delivery failed', err);
    return fail(500, 'Your agreement was recorded, but the confirmation email failed to send. Please contact info@gerarda-sullivan-counselling.com to confirm.');
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, reference, signedAtDisplay, test: isTest }) };
};

exports._buildPdf = buildPdf; // exported for local testing only
