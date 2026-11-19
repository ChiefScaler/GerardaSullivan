/* /consent — consent + booking flow. The signed PDF is built in the browser, then posted once to
   /.netlify/functions/consent-submit, which emails each signer (and Gerarda, on the live site) their copy.
   Nothing is stored on the server except a hashed 'already signed' record.
   The only network request is the static /agreement.json (the agreement text). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var LINKS = {
    individual: 'https://calendar.app.google/NaUD6xmu5YkTbSTM9',
    couples: 'https://calendar.app.google/d61wu3Y1FqCVvhwY7'
  };
  var plan = '', pay = '', unlocked = false, agreement = null, pdfUrl = null;
  var IS_LIVE = /(^|\.)gerarda-sullivan-counselling\.com$/.test(location.hostname);
  var loadedAt = Date.now(), emailsSent = [];

  var S1 = [
    ['fullName', 'Full name', 'text', 'name'],
    ['dob', 'Date of birth', 'date', 'bday'],
    ['address', 'Address', 'textarea', 'street-address'],
    ['phone', 'Phone number', 'tel', 'tel'],
    ['email', 'Email address', 'email', 'email']
  ];
  var S2 = [
    ['emName', 'Full Name', 'text'], ['emPhone', 'Phone Number', 'tel'], ['emRel', 'Relationship', 'text'],
    ['gpName', 'GP / Primary healthcare provider name', 'text'],
    ['gpAddress', 'GP / Primary healthcare provider address', 'text'],
    ['gpPhone', 'GP / Primary healthcare provider phone', 'tel']
  ];
  var REQ1 = ['fullName', 'dob', 'address', 'phone', 'email'];
  var REQ2 = ['emName', 'emPhone', 'emRel'];
  var isCouple = function () { return plan === '2'; };
  var nClients = function () { return isCouple() ? 2 : 1; };

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function val(id) { var el = $(id); return el ? el.value.trim() : ''; }
  function todayStr() { return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }

  /* ---------- rendering ---------- */
  function fieldHtml(i, f) {
    var id = 'c' + i + '_' + f[0];
    var attrs = ' id="' + id + '" data-i="' + i + '" data-k="' + f[0] + '"' + (f[3] ? ' autocomplete="' + f[3] + '"' : '');
    var rq = (REQ1.indexOf(f[0]) > -1 || REQ2.indexOf(f[0]) > -1) ? ' class="req"' : '';
    return f[2] === 'textarea' ? '<textarea' + attrs + rq + ' rows="2"></textarea>' : '<input' + attrs + rq + ' type="' + f[2] + '">';
  }
  function gridHtml(fields, req) {
    var h = '<div class="cgrid" style="grid-template-columns:200px 1fr 1fr"><span class="ch empty"></span><span class="ch">Client 1</span><span class="ch c2" hidden>Client 2 (couples only)</span>';
    fields.forEach(function (f) {
      var star = req.indexOf(f[0]) > -1 ? ' *' : '';
      h += '<span class="rl">' + esc(f[1]) + star + '</span><div>' + fieldHtml(0, f) + '</div><div class="c2" hidden>' + fieldHtml(1, f) + '</div>';
    });
    return h + '</div>';
  }
  function blockHtml(b) {
    if (b.ul) return '<ul>' + b.ul.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    if (b.table) return '<div class="facts">' + b.table.map(function (r) { return '<b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span>'; }).join('') + '</div>';
    return '<p>' + (b.lead ? '<strong>' + esc(b.lead) + '</strong> ' : '') + esc(b.p) + '</p>';
  }
  function renderAgreement(a) {
    agreement = a;
    var h = '<p>' + esc(a.INTRO) + '</p>';
    h += '<h3>1. Client information</h3>' + gridHtml(S1, REQ1);
    h += '<h3>2. Emergency contact information</h3>' + gridHtml(S2, REQ2);
    a.SECTIONS.forEach(function (s) {
      if (/^15\./.test(s.heading)) return;
      h += '<h3>' + esc(s.heading) + '</h3>';
      s.blocks.forEach(function (b) { h += blockHtml(b); });
      if (/^3\./.test(s.heading)) {
        h += '<h3>4. Presenting issues</h3><p>Please write a brief description of the concerns or issues you wish to work on:</p>' +
          '<textarea id="presenting" rows="4" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:var(--radius);font:inherit;font-size:0.9rem"></textarea>';
      }
    });
    h += '<p class="end-marker">End of agreement</p>';
    $('docScroll').innerHTML = h;
    var sec15 = a.SECTIONS.filter(function (s) { return /^15\./.test(s.heading); })[0];
    $('consentLead').textContent = sec15 ? sec15.blocks[0].p : '';
    applyCouple();
    setTimeout(checkScroll, 50);
  }

  function sigCardHtml(i) {
    return '<fieldset class="signer" data-i="' + i + '"><legend class="signer-title">CLIENT ' + (i + 1) + (i === 1 ? ' (couples only)' : '') + '</legend>' +
      '<div class="sigfield"><label for="p' + i + '_name">Full name (printed) *</label><input class="req" id="p' + i + '_name" data-i="' + i + '"></div>' +
      '<div class="sigfield"><label>Signature * <small>(type or draw)</small></label>' +
      '<div class="sig-tabs"><button type="button" class="on" data-tab="type" data-i="' + i + '">Type</button><button type="button" data-tab="draw" data-i="' + i + '">Draw</button></div>' +
      '<div id="p' + i + '_type"><input class="req" id="p' + i + '_sigtext" placeholder="Type your full name" data-i="' + i + '"><div class="signature-box" style="margin-top:10px"><span class="signature-preview" id="p' + i + '_prev"></span><span class="signature-placeholder" id="p' + i + '_ph">Your signature appears here</span></div></div>' +
      '<div id="p' + i + '_draw" hidden><canvas class="sigpad" id="p' + i + '_pad" width="640" height="260"></canvas><button type="button" class="sig-clear" data-clear="' + i + '">Clear</button></div></div>' +
      '<div class="sigfield"><label for="p' + i + '_place">Signed in (town / country) *</label><input class="req" id="p' + i + '_place"></div>' +
      '<div class="sigfield"><label>Date signed</label><input value="' + esc(todayStr()) + '" readonly></div>' +
      '<div class="agree-row"><input type="checkbox" id="p' + i + '_agree"><label for="p' + i + '_agree">I have read this agreement in full and agree to its terms</label></div></fieldset>';
  }

  var inked = [false, false], mode = ['type', 'type'];
  function initPad(i) {
    var c = $('p' + i + '_pad'), ctx = c.getContext('2d'), down = false;
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1a3a2a';
    function pos(e) { var r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; }
    c.addEventListener('pointerdown', function (e) { down = true; c.setPointerCapture(e.pointerId); var p = pos(e); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + 0.1, p[1] + 0.1); ctx.stroke(); inked[i] = true; validate(); });
    c.addEventListener('pointermove', function (e) { if (!down) return; var p = pos(e); ctx.lineTo(p[0], p[1]); ctx.stroke(); });
    ['pointerup', 'pointercancel'].forEach(function (t) { c.addEventListener(t, function () { down = false; }); });
  }
  function buildSigCards() {
    $('sigGrid').innerHTML = sigCardHtml(0) + sigCardHtml(1);
    initPad(0); initPad(1);
  }
  function applyCouple() {
    var two = isCouple();
    document.querySelectorAll('.c2').forEach(function (el) { el.hidden = !two; });
    document.querySelectorAll('.cgrid').forEach(function (g) { g.style.gridTemplateColumns = two ? '200px 1fr 1fr' : '200px 1fr'; });
    var cards = document.querySelectorAll('#sigGrid .signer');
    if (cards[1]) cards[1].hidden = !two;
    $('sigGrid').classList.toggle('two', two);
    $('signForm').dataset.couple = two ? '1' : '0';
    $('consentLead').dataset.couple = two ? '1' : '0';
    validate();
  }

  /* ---------- validation ---------- */
  function clientOk(i) {
    var ok = REQ1.every(function (k) { return val('c' + i + '_' + k); }) && REQ2.every(function (k) { return val('c' + i + '_' + k); });
    if (!ok) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('c' + i + '_email'))) return false;
    if (val('p' + i + '_name').length < 2 || !val('p' + i + '_place') || !$('p' + i + '_agree').checked) return false;
    var signed = mode[i] === 'draw' ? inked[i] : val('p' + i + '_sigtext').length > 1;
    return signed;
  }
  function payOk() {
    if (pay === 'self') return true;
    var sel = pay === 'insurer' ? '#payInsurer [data-pay]' : '#payReferral [data-pay]';
    return Array.prototype.every.call(document.querySelectorAll(sel), function (el) { return el.value.trim(); });
  }
  function problem() {
    if (!plan) return 'Choose who the therapy is for (step 1).';
    if (!pay) return 'Choose how your sessions will be paid for (step 2).';
    if (!payOk()) return 'Please complete the required payment details (step 2).';
    if (!unlocked) return 'Scroll to the end of the agreement to unlock signing.';
    if (!clientOk(0)) return 'Client 1: complete the required details in the agreement above, then sign below.';
    if (isCouple()) {
      if (!clientOk(1)) return 'Client 2: complete the required details in the agreement above, then sign below. Both clients must sign.';
      if (val('c0_email').toLowerCase() === val('c1_email').toLowerCase()) return 'Each person needs their own, different email address.';
    }
    return '';
  }
  /* ---------- highlighting ---------- */
  function elBad(el) {
    if (!el.closest('[hidden]') && !el.disabled) {
      var id = el.id, v = el.value.trim();
      if (/_email$/.test(id)) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
        if (id === 'c1_email' && isCouple() && v.toLowerCase() === val('c0_email').toLowerCase()) return true;
        return false;
      }
      if (/_sigtext$/.test(id)) { var i = +id.charAt(1); return mode[i] === 'type' && v.length < 2; }
      return !v;
    }
    return false;
  }
  function sigBad(i) { return mode[i] === 'draw' && !inked[i]; }
  function badEls() {
    var out = [];
    if (pay === 'insurer' || pay === 'referral') {
      document.querySelectorAll(pay === 'insurer' ? '#payInsurer [data-pay]' : '#payReferral [data-pay]').forEach(function (el) { if (!el.value.trim()) out.push(el); });
    }
    var n = isCouple() ? 2 : 1;
    for (var i = 0; i < n; i++) {
      document.querySelectorAll('#docScroll .req[id^="c' + i + '_"]').forEach(function (el) { if (elBad(el)) out.push(el); });
      ['name', 'sigtext', 'place'].forEach(function (k) { var el = $('p' + i + '_' + k); if (el && elBad(el)) out.push(el); });
      if (sigBad(i)) out.push($('p' + i + '_pad'));
      if (!$('p' + i + '_agree').checked) out.push($('p' + i + '_agree').parentNode);
    }
    return out;
  }
  function paint() {
    document.querySelectorAll('.req').forEach(function (el) {
      var bad = elBad(el);
      el.classList.toggle('ok', !bad && !el.closest('[hidden]'));
      if (!bad) el.classList.remove('invalid');
    });
    document.querySelectorAll('.agree-row, .sigpad').forEach(function (el) {
      var i = +(el.id ? el.id.charAt(1) : el.querySelector('input').id.charAt(1));
      var bad = el.classList.contains('sigpad') ? sigBad(i) : !el.querySelector('input').checked;
      if (!bad) el.classList.remove('invalid');
    });
  }
  function validate() {
    if (!$('submitBtn')) return;
    paint();
    var p = problem();
    $('submitNote').textContent = p || 'Everything is complete. You can sign now.';
  }

  /* ---------- scroll gate ---------- */
  function checkScroll() {
    var d = $('docScroll');
    if (!unlocked && d.scrollHeight > 200 && d.scrollTop + d.clientHeight >= d.scrollHeight - 12) {
      unlocked = true;
      $('signForm').classList.remove('locked');
      $('scrollNudge').classList.add('hidden');
      $('scrollProgress').textContent = 'Read in full';
      $('scrollProgress').classList.add('complete');
      validate();
    }
  }

  /* ---------- PDF (client-side only) ---------- */
  function safe(t) {
    return String(t).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
      .replace(/[^\x20-\x7e -ÿ]/g, '?');
  }
  async function buildPdf(data) {
    var L = window.PDFLib, doc = await L.PDFDocument.create();
    var font = await doc.embedFont(L.StandardFonts.Helvetica), bold = await doc.embedFont(L.StandardFonts.HelveticaBold), script = await doc.embedFont(L.StandardFonts.TimesRomanItalic);
    var rgb = L.rgb, FOREST = rgb(0.1, 0.23, 0.16), SAGE = rgb(0.29, 0.45, 0.32), TEXT = rgb(0.16, 0.2, 0.1), MUTED = rgb(0.54, 0.52, 0.44), LINE = rgb(0.68, 0.75, 0.68);
    var M = 56, W = 595.28, H = 841.89, CW = W - 2 * M, page, y;
    function addPage() { page = doc.addPage([W, H]); y = H - M; if (!IS_LIVE) page.drawText('TEST COPY - not a real agreement', { x: M, y: H - 28, size: 8, font: bold, color: rgb(0.7, 0.2, 0.2) }); }
    addPage();
    function need(s) { if (y - s < M) addPage(); }
    function wrap(t, f, size, w) {
      var out = [], cur = '';
      var words = [];
      safe(t).split(' ').forEach(function (word) {
        /* break very long unspaced tokens (long emails, URLs) so nothing runs off the page */
        while (f.widthOfTextAtSize(word, size) > w && word.length > 1) {
          var k = word.length; while (k > 1 && f.widthOfTextAtSize(word.slice(0, k), size) > w) k--;
          words.push(word.slice(0, k)); word = word.slice(k);
        }
        words.push(word);
      });
      words.forEach(function (word) { var tr = cur ? cur + ' ' + word : word; if (f.widthOfTextAtSize(tr, size) > w && cur) { out.push(cur); cur = word; } else cur = tr; });
      if (cur) out.push(cur); return out;
    }
    function para(t, o) {
      o = o || {}; var size = o.size || 10, f = o.f || font, color = o.color || TEXT, gap = o.gap || 13, lead = o.lead;
      if (lead) {
        var lt = safe(lead) + ' ', lw = bold.widthOfTextAtSize(lt, size), lines = wrap(t, f, size, CW - lw);
        need(gap); page.drawText(lt, { x: M, y: y, size: size, font: bold, color: color });
        if (lines.length) page.drawText(lines[0], { x: M + lw, y: y, size: size, font: f, color: color });
        y -= gap;
        var rest = lines.slice(1).join(' ');
        if (rest) wrap(rest, f, size, CW).forEach(function (l) { need(gap); page.drawText(l, { x: M, y: y, size: size, font: f, color: color }); y -= gap; });
        return;
      }
      wrap(t, f, size, CW).forEach(function (l) { need(gap); page.drawText(l, { x: M, y: y, size: size, font: f, color: color }); y -= gap; });
    }
    function bullet(t) { wrap(t, font, 10, CW - 14).forEach(function (l, i) { need(13); if (!i) page.drawText('-', { x: M + 2, y: y, size: 10, font: font, color: SAGE }); page.drawText(l, { x: M + 14, y: y, size: 10, font: font, color: TEXT }); y -= 13; }); }
    function block(b) { if (b.ul) b.ul.forEach(bullet); else if (b.table) b.table.forEach(function (r) { para(r[1], { lead: r[0] }); }); else para(b.p, { lead: b.lead }); y -= 2; }
    function head(t) { need(40); para(t, { size: 11.5, f: bold, color: FOREST, gap: 16 }); }

    var n = data.clients.length, colW = n === 2 ? (CW - 130) / 2 : CW - 130;
    function row(label, vals) {
      var cells = vals.map(function (v) { return wrap(v || '-', font, 9, colW - 8); }), rows = Math.max.apply(null, cells.map(function (c) { return c.length; }).concat([1]));
      need(rows * 12 + 8); page.drawText(safe(label), { x: M, y: y, size: 8.5, font: bold, color: FOREST });
      cells.forEach(function (ls, i) { ls.forEach(function (l, j) { page.drawText(l, { x: M + 130 + i * colW, y: y - j * 12, size: 9, font: font, color: TEXT }); }); });
      y -= rows * 12 + 10;
    }
    function colHead() { if (n === 2) { page.drawText('Client 1', { x: M + 130, y: y, size: 8.5, font: bold, color: SAGE }); page.drawText('Client 2', { x: M + 130 + colW, y: y, size: 8.5, font: bold, color: SAGE }); y -= 14; } }
    var col = function (k) { return data.clients.map(function (c) { return c[k]; }); };

    var tm = await doc.embedFont(L.StandardFonts.TimesRoman);
    page.drawText('Gerarda Sullivan', { x: M, y: y - 14, size: 22, font: tm, color: FOREST });
    page.drawText('COUNSELLING & PSYCHOTHERAPY', { x: M, y: y - 30, size: 8, font: font, color: SAGE });
    try {
      var bb = await (await fetch('/images/bacp-pdf.png')).arrayBuffer();
      var bimg = await doc.embedPng(bb), bh = 40, bw = bh * bimg.width / bimg.height;
      page.drawImage(bimg, { x: W - M - bw, y: y - 36, width: bw, height: bh });
    } catch (e) { /* logo is decorative; never block signing */ }
    y -= 56;
    para('Client & Therapist Informed Consent Agreement', { size: 17, f: bold, color: FOREST, gap: 24 });
    para('Virtual (telehealth) counselling & psychotherapy', { size: 9, color: MUTED, gap: 14 });
    para('Agreement version: ' + data.version + '   |   Signed: ' + data.date, { size: 8, color: MUTED, gap: 18 });
    para(data.intro, { gap: 13 }); y -= 8;
    head('Session type and payment');
    para(data.plan === '2' ? 'Couples (GBP 150 per session)' : 'Individual (GBP 80 per session)');
    para(data.payText); y -= 8;
    head('1. Client information'); colHead();
    row('Full name', col('fullName')); row('Date of birth', col('dob')); row('Address', col('address')); row('Phone number', col('phone')); row('Email address', col('email'));
    y -= 6; head('2. Emergency contact information'); colHead();
    row('Full name', col('emName')); row('Phone number', col('emPhone')); row('Relationship', col('emRel'));
    row('GP / provider name', col('gpName')); row('GP / provider address', col('gpAddress')); row('GP / provider phone', col('gpPhone'));
    y -= 6;
    data.sections.forEach(function (s) {
      if (/^15\./.test(s.heading)) return;
      head(s.heading.toUpperCase()); s.blocks.forEach(block);
      if (/^3\./.test(s.heading)) { head('4. PRESENTING ISSUES'); para(data.presenting || '(none given)'); y -= 6; }
      y -= 6;
    });
    var s15 = data.sections.filter(function (s) { return /^15\./.test(s.heading); })[0];
    need(250); page.drawLine({ start: { x: M, y: y }, end: { x: W - M, y: y }, thickness: 0.75, color: LINE }); y -= 16;
    head(s15.heading.toUpperCase()); para(s15.blocks[0].p, { gap: 14 }); y -= 14;
    var sw = n === 2 ? CW / 2 : CW, top = y;
    for (var i = 0; i < n; i++) {
      var c = data.clients[i], x = M + i * sw, yy = top;
      page.drawText(n === 2 ? 'CLIENT ' + (i + 1) : 'CLIENT', { x: x, y: yy, size: 8.5, font: bold, color: SAGE }); yy -= 56;
      if (c.sigImg) {
        var img = await doc.embedPng(c.sigImg), dims = img.scale(1), sc = Math.min(180 / dims.width, 48 / dims.height);
        page.drawImage(img, { x: x, y: yy - 2, width: dims.width * sc, height: dims.height * sc });
      } else page.drawText(safe(c.sigText), { x: x, y: yy + 6, size: 22, font: script, color: FOREST, maxWidth: sw - 14 });
      yy -= 6; page.drawLine({ start: { x: x, y: yy }, end: { x: x + sw - 20, y: yy }, thickness: 0.5, color: LINE }); yy -= 12;
      ['Full name: ' + c.printed, 'Signed in: ' + c.place, 'Date signed: ' + data.date].forEach(function (t) { wrap(t, font, 8.5, sw - 24).forEach(function (l) { page.drawText(l, { x: x, y: yy, size: 8.5, font: font, color: TEXT }); yy -= 12; }); });
    }
    y = top - 56 - 6 - 12 - 36 - 24; need(165);
    page.drawText('THERAPIST', { x: M, y: y, size: 8.5, font: bold, color: SAGE }); y -= 72;
    try {
      var sigBytes = await (await fetch('/images/gerarda-signature.png')).arrayBuffer();
      var sigPng = await doc.embedPng(sigBytes), sw0 = 150, sh0 = sw0 * sigPng.height / sigPng.width;
      page.drawImage(sigPng, { x: M, y: y - 4, width: sw0, height: sh0 });
    } catch (e) { page.drawText('Gerarda Sullivan', { x: M, y: y, size: 22, font: script, color: FOREST }); }
    y -= 6;
    page.drawLine({ start: { x: M, y: y }, end: { x: M + 200, y: y }, thickness: 0.5, color: LINE }); y -= 12;
    page.drawText('Gerarda Sullivan - Registered Member MBACP 416049', { x: M, y: y, size: 8.5, font: font, color: TEXT }); y -= 12;
    page.drawText('Date: ' + data.date, { x: M, y: y, size: 8.5, font: font, color: TEXT });
    return doc.save();
  }

  /* ---------- submit + thank-you ---------- */
  function collect() {
    var clients = [];
    for (var i = 0; i < nClients(); i++) {
      var c = { printed: val('p' + i + '_name'), place: val('p' + i + '_place') };
      REQ1.concat(['emName', 'emPhone', 'emRel', 'gpName', 'gpAddress', 'gpPhone']).forEach(function (k) { c[k] = val('c' + i + '_' + k); });
      if (c.dob) { var d = new Date(c.dob); if (!isNaN(d)) c.dob = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
      if (mode[i] === 'draw') c.sigImg = $('p' + i + '_pad').toDataURL('image/png'); else c.sigText = val('p' + i + '_sigtext');
      clients.push(c);
    }
    var payText = 'Paying myself.';
    if (pay === 'insurer') payText = 'Health insurer: ' + val('ins_insurer') + '; policy holder: ' + val('ins_holder') + '; membership/policy no.: ' + val('ins_member') + '; authorisation no.: ' + val('ins_auth') + (val('ins_sessions') ? '; sessions authorised: ' + val('ins_sessions') : '') + '.';
    if (pay === 'referral') payText = 'Referred by: ' + val('ref_org') + '; contact: ' + val('ref_contact') + ', ' + val('ref_details') + (val('ref_ref') ? '; reference: ' + val('ref_ref') : '') + '.';
    return { version: agreement.VERSION, intro: agreement.INTRO, sections: agreement.SECTIONS, date: todayStr(), plan: plan, payText: payText, presenting: val('presenting'), clients: clients };
  }
  function showThanks() {
    var h = '';
    if (pay === 'self') {
      var couples = isCouple();
      h = '<a class="btn btn-primary" id="bookBtn" href="' + (couples ? LINKS.couples : LINKS.individual) + '" target="_blank" rel="noopener">' +
        (couples ? 'Book your first couples session (&pound;150)' : 'Book your first session (&pound;80)') + '</a>' +
        '<p class="note">Keep your confirmation email: you\'ll use this same link for every future session.</p>' +
        (IS_LIVE ? '' : '<p class="demo-note">Test version: please don\'t complete a booking.</p>');
    } else {
      h = '<p class="note" id="waitMsg">Thank you. Gerarda will check your ' + (pay === 'insurer' ? 'insurance' : 'referral') + ' details and email you your personal booking link within 2 working days. You won\'t be charged at booking; Gerarda invoices your ' + (pay === 'insurer' ? 'insurer' : 'organisation') + ' directly.</p>';
    }
    var to = emailsSent.join(' and ');
    h = '<p class="note">We\'ve emailed a signed copy to ' + esc(to) + '. If you can\'t see it, check your junk folder.</p>' + h;
    $('nextSteps').innerHTML = h;
    $('agreementWrap').hidden = true; $('step1').hidden = true; $('step2').hidden = true;
    $('successCard').style.display = 'block';
    $('successCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------- events ---------- */
  document.querySelectorAll('input[name="plan"]').forEach(function (r) { r.addEventListener('change', function () { plan = r.value; revealAgreement(); applyCouple(); }); });
  document.querySelectorAll('input[name="pay"]').forEach(function (r) {
    r.addEventListener('change', function () {
      pay = r.value; $('payInsurer').hidden = pay !== 'insurer'; $('payReferral').hidden = pay !== 'referral'; revealAgreement(); validate();
    });
  });
  function revealAgreement() { if (plan && pay) { $('agreementWrap').hidden = false; setTimeout(checkScroll, 50); } }

  document.addEventListener('input', function (e) {
    var t = e.target, m;
    if ((m = /^c(\d)_fullName$/.exec(t.id))) {
      var i = +m[1], p = $('p' + i + '_name'), s = $('p' + i + '_sigtext');
      if (p && !p.dataset.touched) p.value = t.value;
      if (s && !s.dataset.touched) { s.value = t.value; updatePreview(i); }
    }
    if ((m = /^p(\d)_name$/.exec(t.id))) t.dataset.touched = '1';
    if ((m = /^p(\d)_sigtext$/.exec(t.id))) { t.dataset.touched = '1'; updatePreview(+m[1]); }
    validate();
  });
  document.addEventListener('change', validate);
  function updatePreview(i) {
    var v = val('p' + i + '_sigtext');
    $('p' + i + '_prev').textContent = v; $('p' + i + '_prev').style.display = v ? 'block' : 'none'; $('p' + i + '_ph').style.display = v ? 'none' : 'block';
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.tab) {
      var i = +t.dataset.i; mode[i] = t.dataset.tab;
      $('p' + i + '_type').hidden = mode[i] !== 'type'; $('p' + i + '_draw').hidden = mode[i] !== 'draw';
      t.parentNode.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b === t); }); validate();
    }
    if (t.dataset && t.dataset.clear !== undefined) {
      var k = +t.dataset.clear, c = $('p' + k + '_pad'); c.getContext('2d').clearRect(0, 0, c.width, c.height); inked[k] = false; validate();
    }
  });
  $('docScroll').addEventListener('scroll', checkScroll);

  $('signForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var p = problem(); $('formError').style.display = 'none';
    if (p) {
      var bad = badEls();
      document.querySelectorAll('.invalid').forEach(function (el) { el.classList.remove('invalid'); });
      bad.forEach(function (el) { el.classList.add('invalid'); });
      $('formError').textContent = bad.length ? p + ' Missing items are highlighted in red (' + bad.length + ').' : p;
      $('formError').style.display = 'block';
      if (bad.length) {
        var first = bad[0];
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (first.focus && /INPUT|TEXTAREA/.test(first.tagName)) setTimeout(function () { first.focus({ preventScroll: true }); }, 450);
      }
      return;
    }
    var btn = $('submitBtn'), label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Signing and emailing your copy…';
    try {
      var data = collect();
      var bytes = await buildPdf(data);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      pdfUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      var bin = '', CH = 0x8000;
      for (var o = 0; o < bytes.length; o += CH) bin += String.fromCharCode.apply(null, bytes.subarray(o, o + CH));
      var body = {
        version: agreement.VERSION, plan: plan, pay: pay,
        clients: data.clients.map(function (c) { return { fullName: c.fullName, email: c.email }; }),
        hpTrap: ($('hpTrap') || {}).value || '', msSinceLoad: Date.now() - loadedAt,
        pdfBase64: btoa(bin)
      };
      var res = await fetch('/.netlify/functions/consent-submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var out = {}; try { out = await res.json(); } catch (e) {}
      if (!res.ok || !out.ok) throw new Error(out.error || 'send failed');
      emailsSent = body.clients.map(function (c) { return c.email; });
      showThanks();
    } catch (err) {
      $('formError').textContent = (err && err.message && err.message !== 'send failed' && !/Failed to fetch|NetworkError|Load failed/i.test(err.message)) ? err.message : 'Sorry, something went wrong signing your agreement. Please check your connection and try again.';
      $('formError').style.display = 'block';
      btn.innerHTML = label; validate();
    }
  });

  $('downloadBtn').addEventListener('click', function () {
    if (!pdfUrl) return;
    var a = document.createElement('a'); a.href = pdfUrl; a.download = 'Signed-consent-agreement.pdf'; document.body.appendChild(a); a.click(); a.remove();
  });

  $('therapistDate').textContent = todayStr();
  buildSigCards();
  if (IS_LIVE && $('testBanner')) $('testBanner').style.display = 'none';
  fetch('/agreement.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(renderAgreement).catch(function () {
    $('docScroll').innerHTML = '<p>Sorry, the agreement could not be loaded. Please refresh the page.</p>';
  });

  // Preselect plan from ?plan=individual|couples (links from the Fees / Services pages)
  var q = /[?&]plan=(individual|couples)/.exec(location.search);
  if (q) { var r = document.querySelector('input[name="plan"][value="' + (q[1] === 'couples' ? '2' : '1') + '"]'); if (r) { r.checked = true; plan = r.value; } }
})();
