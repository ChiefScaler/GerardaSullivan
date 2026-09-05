// netlify/functions/sign-contract.js
//
// Handles a submission from sign-contract.html:
//   1. Validates the input and runs two lightweight anti-spam checks
//      (a honeypot field, and a minimum time-on-page check).
//   2. Builds a PDF of the signed agreement using pdf-lib (the CONTRACT_TEXT
//      below is the single source of truth for what goes IN THE PDF — it is
//      the authoritative copy; sign-contract.html's on-page text must be
//      kept in sync with it by hand until this becomes a CMS content file).
//   3. Emails the signed PDF to the client and to the practice inbox via
//      Gmail SMTP (nodemailer) — no third-party e-signature subscription.
//   4. Stores a permanent audit record (metadata + the PDF itself) in
//      Netlify Blobs, which is bundled with the Netlify plan already in use
//      — no separate database service to pay for or manage.
//
// Required environment variables (set in Netlify → Project configuration →
// Environment variables — never commit these):
//   PRACTICE_GMAIL_USER          the Gmail/Workspace address to send from
//   PRACTICE_GMAIL_APP_PASSWORD  a 16-character Google "App Password" for
//                                 that account (requires 2-Step Verification
//                                 to be turned on for the account first)
//   PRACTICE_NOTIFY_EMAIL        (optional) where the practice's own copy
//                                 goes — defaults to info@gerarda-sullivan-counselling.com

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const nodemailer = require('nodemailer');
const { getStore } = require('@netlify/blobs');

const CONTRACT_VERSION = 'placeholder-v1-2026-09-05';

const CONTRACT_TEXT = [
  {
    heading: '1. Parties & Scope of Services',
    body: 'This agreement is between Gerarda Sullivan, BACP-registered counsellor and psychotherapist ("the Therapist"), and the Client named above, and covers one-to-one online counselling sessions delivered by video call.'
  },
  {
    heading: '2. Sessions, Fees & Payment',
    body: 'Individual sessions are 50 minutes at £70, and couples sessions are 50 minutes at £150. Payment is taken at the time of booking via the practice’s booking system. Fees are reviewed periodically and the Client will be given [notice period to be confirmed] of any change.'
  },
  {
    heading: '3. Cancellation & Rescheduling',
    body: 'The Client agrees to give at least [24/48 hours — to confirm] notice to cancel or reschedule a session. Sessions cancelled with less notice, or missed without notice, are charged in full.'
  },
  {
    heading: '4. Confidentiality & Its Limits',
    body: 'Everything discussed in session is confidential, in line with the BACP Ethical Framework and UK GDPR. Confidentiality may be broken where the Therapist believes there is a serious risk of harm to the Client or others, where required by law, or during clinical supervision (where the Client is never identified by name).'
  },
  {
    heading: '5. Use of AI Tools in Practice Administration',
    body: '[Clause pending legal review] — this section will set out, in plain language, which administrative tools use AI (for example, appointment scheduling or note-taking support), what they are and are not used for, and that no session content is ever used to train any AI system.'
  },
  {
    heading: '6. Data Protection & Records',
    body: 'Client records are stored securely in line with UK GDPR, kept only as long as professionally required, and never shared without consent except where confidentiality is lawfully limited under Section 4 above.'
  },
  {
    heading: '7. Ending Therapy',
    body: 'Either party may end the therapeutic relationship at any time. Where possible, the Therapist will offer a final session to support a considered ending.'
  },
  {
    heading: '8. Complaints',
    body: 'Any concerns about the service received can be raised directly with the Therapist in the first instance, or with the BACP under its Professional Conduct Procedure.'
  },
  {
    heading: '9. Agreement',
    body: 'By typing your name and submitting the signing form, the Client confirms that they have read and understood this agreement in full and agree to be bound by its terms.'
  }
];

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function makeReference() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GSC-${datePart}-${randomPart}`;
}

async function buildPdf({ fullName, email, ip, userAgent, reference, signedAt }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  const pageMargin = 56;
  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const maxLineWidth = pageWidth - pageMargin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - pageMargin;

  function newPageIfNeeded(space) {
    if (y - space < pageMargin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - pageMargin;
    }
  }

  function wrapText(text, useFont, size) {
    const words = text.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (useFont.widthOfTextAtSize(trial, size) > maxLineWidth) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = trial;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawText(text, { size = 10, useFont = font, color = rgb(0.16, 0.2, 0.1), gap = 14 } = {}) {
    const lines = wrapText(text, useFont, size);
    for (const line of lines) {
      newPageIfNeeded(gap);
      page.drawText(line, { x: pageMargin, y, size, font: useFont, color });
      y -= gap;
    }
  }

  // Title block
  drawText('Gerarda Sullivan Counselling & Psychotherapy', { size: 10, useFont: font, color: rgb(0.29, 0.45, 0.32), gap: 16 });
  drawText('Therapy Service Agreement', { size: 18, useFont: boldFont, color: rgb(0.1, 0.23, 0.16), gap: 26 });
  drawText(`Reference: ${reference}`, { size: 9, useFont: font, color: rgb(0.54, 0.52, 0.44), gap: 20 });

  // Contract body
  for (const section of CONTRACT_TEXT) {
    newPageIfNeeded(40);
    drawText(section.heading, { size: 12, useFont: boldFont, color: rgb(0.1, 0.23, 0.16), gap: 16 });
    drawText(section.body, { size: 10, useFont: font, gap: 13 });
    y -= 8;
  }

  // Signature block
  newPageIfNeeded(140);
  y -= 10;
  page.drawLine({
    start: { x: pageMargin, y },
    end: { x: pageWidth - pageMargin, y },
    thickness: 0.75,
    color: rgb(0.68, 0.75, 0.68)
  });
  y -= 28;
  drawText(`Electronically signed by: ${fullName}`, { size: 14, useFont: italicFont, color: rgb(0.1, 0.23, 0.16), gap: 20 });
  drawText(`Email: ${email}`, { size: 9, gap: 13 });
  drawText(`Signed at: ${signedAt} (UTC)`, { size: 9, gap: 13 });
  drawText(`IP address: ${ip}`, { size: 9, gap: 13 });
  drawText(`Browser: ${userAgent}`, { size: 8, color: rgb(0.54, 0.52, 0.44), gap: 13 });
  drawText(`Agreement version: ${CONTRACT_VERSION}`, { size: 8, color: rgb(0.54, 0.52, 0.44), gap: 20 });

  return pdfDoc.save();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid submission.' }) };
  }

  const { fullName, email, companyWebsite, msSinceLoad } = payload;

  // Anti-spam: honeypot field must stay empty, and a human can't fill in
  // the form in under ~2.5 seconds.
  if (companyWebsite) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Submission rejected.' }) };
  }
  if (typeof msSinceLoad === 'number' && msSinceLoad < 2500) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Please take a moment to review the agreement before signing.' }) };
  }

  if (!fullName || fullName.trim().length < 2) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Please enter your full name.' }) };
  }
  if (!email || !isValidEmail(email)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Please enter a valid email address.' }) };
  }

  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown';
  const userAgent = event.headers['user-agent'] || 'unknown';
  const reference = makeReference();
  const signedAtDate = new Date();
  const signedAt = signedAtDate.toISOString();
  const signedAtDisplay = signedAtDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' at ' + signedAtDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

  let pdfBytes;
  try {
    pdfBytes = await buildPdf({ fullName: fullName.trim(), email: email.trim(), ip, userAgent, reference, signedAt });
  } catch (err) {
    console.error('PDF generation failed', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Could not generate your signed agreement. Please try again.' }) };
  }

  // Audit trail — stored in Netlify Blobs (included with the Netlify plan,
  // no extra service to sign up for).
  try {
    const store = getStore('signed-agreements');
    await store.setJSON(`${reference}.json`, {
      reference, fullName: fullName.trim(), email: email.trim(), ip, userAgent,
      signedAt, contractVersion: CONTRACT_VERSION
    });
    await store.set(`${reference}.pdf`, Buffer.from(pdfBytes));
  } catch (err) {
    // Don't fail the whole signing over a storage hiccup — email delivery
    // (below) is the primary record the client and practice actually rely on.
    console.error('Blob storage failed', err);
  }

  // Email delivery
  const gmailUser = process.env.PRACTICE_GMAIL_USER;
  const gmailPass = process.env.PRACTICE_GMAIL_APP_PASSWORD;
  const notifyEmail = process.env.PRACTICE_NOTIFY_EMAIL || 'info@gerarda-sullivan-counselling.com';

  if (!gmailUser || !gmailPass) {
    console.error('Missing PRACTICE_GMAIL_USER / PRACTICE_GMAIL_APP_PASSWORD env vars');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Email delivery is not yet configured. Please contact info@gerarda-sullivan-counselling.com directly.' }) };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass }
    });

    const attachment = {
      filename: `${reference}-signed-agreement.pdf`,
      content: Buffer.from(pdfBytes),
      contentType: 'application/pdf'
    };

    await transporter.sendMail({
      from: `Gerarda Sullivan Counselling <${gmailUser}>`,
      to: email.trim(),
      subject: `Your signed therapy agreement (${reference})`,
      text: `Hi ${fullName.trim()},\n\nThank you for signing your therapy agreement. A copy is attached for your records.\n\nReference: ${reference}\nSigned: ${signedAtDisplay}\n\nIf anything looks wrong, just reply to this email.\n\nWarm wishes,\nGerarda`,
      attachments: [attachment]
    });

    await transporter.sendMail({
      from: `Website <${gmailUser}>`,
      to: notifyEmail,
      subject: `New signed agreement: ${fullName.trim()} (${reference})`,
      text: `${fullName.trim()} (${email.trim()}) signed their therapy agreement.\n\nReference: ${reference}\nSigned: ${signedAtDisplay}\nIP: ${ip}\n\nA copy is attached.`,
      attachments: [attachment]
    });
  } catch (err) {
    console.error('Email delivery failed', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Your agreement was recorded, but the confirmation email failed to send. Please contact info@gerarda-sullivan-counselling.com to confirm.' }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, reference, signedAtDisplay })
  };
};
