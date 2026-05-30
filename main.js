// ===================================
// GERARDA SULLIVAN — MAIN JS
// ===================================




// ---- Inject chatbot widget ----
(function() {
  const chatHTML = `
  <div id="chat-bubble" title="Quick questions" style="position:fixed;bottom:24px;right:24px;width:52px;height:52px;background:#3a5a7a;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:9998;box-shadow:0 4px 16px rgba(40,80,110,0.3);transition:transform 0.2s ease;">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
  </div>
  <div id="chat-panel" style="position:fixed;bottom:88px;right:24px;width:320px;max-height:460px;background:#fff;border-radius:12px;box-shadow:0 8px 40px rgba(44,74,62,0.18);border:1px solid rgba(74,141,181,0.2);z-index:9997;display:none;flex-direction:column;overflow:hidden;">
    <div style="background:#3a5a7a;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <p style="color:#fff;font-weight:500;font-size:0.875rem;margin:0;">Quick questions</p>
        <p style="color:rgba(255,255,255,0.65);font-size:0.75rem;margin:0;">About services, fees & booking</p>
      </div>
      <button id="chat-close-btn" style="background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.7);font-size:1.2rem;line-height:1;padding:0;">&times;</button>
    </div>
    <div id="chat-msgs" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;min-height:120px;max-height:240px;"></div>
    <div id="chat-chips" style="padding:0 12px 10px;display:flex;flex-wrap:wrap;gap:6px;"></div>
    <div style="padding:10px 12px;border-top:1px solid rgba(74,141,181,0.15);display:flex;gap:8px;">
      <input id="chat-input" type="text" placeholder="Type a question..." style="flex:1;border:1px solid rgba(74,141,181,0.3);border-radius:20px;padding:7px 12px;font-size:0.825rem;outline:none;font-family:inherit;"/>
      <button id="chat-send-btn" style="background:#3a5a7a;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>
    </div>
  </div>`;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = chatHTML;
  document.body.appendChild(wrapper);

  const KB = {
    fees: 'Individual therapy is £70 per 50-minute session. Couples counselling is £150 per 50-minute session. A free 15-minute consultation is also available — no obligation, just a chance to ask questions and see if working together feels right.',
    book: 'You can book directly online: free 15-min consultation → https://calendar.app.google/1yniNk9xHVaWzoUQ8 | Individual therapy → https://calendar.app.google/Kbg3UNAz7JTk24cW6 | Couples counselling → https://calendar.app.google/tPLepxPLuq8z8Sd17. Or use the contact form on the Contact page and Gerarda will be in touch within 24–48 hours.',
    confidential: 'Yes — everything shared in sessions is confidential. There are rare legal exceptions (e.g. risk of serious harm) and Gerarda will always try to discuss concerns with you first.',
    online: 'All sessions are currently online via a secure, encrypted video platform. You can join from wherever you feel comfortable — UK and international clients welcome.',
    approach: 'Gerarda uses an integrative approach combining Person-Centred Therapy, CBT, and Attachment Theory — tailored to your unique needs and pace.',
    services: 'Gerarda works with anxiety, low mood, trauma, grief, relationships, burnout, self-esteem, and more. Visit the Services page for the full list.',
    first: 'The first session is gentle and exploratory — a chance to talk about what brings you to therapy and decide whether working together feels right. No pressure to commit.',
    privacy: 'All personal data is handled in line with UK GDPR. Your information is never sold or used for marketing. See the Privacy Policy page for full details.',
    nervous: 'Feeling nervous is completely normal. You can come exactly as you are — Gerarda will move at your pace, starting wherever you are.',
    relationships: 'Yes — Gerarda offers relationship and couples therapy at £150 per 50-minute session, as well as individual sessions at £70. She also works with other close connections such as parent and adult child, and siblings.',
  };

  function showChips() {
    const chips = document.getElementById('chat-chips');
    if (!chips) return;
    const topics = ['Fees','Book a session','Confidentiality','Online sessions','First session','Relationships','Nervous about starting'];
    chips.innerHTML = topics.map(t => `<button class="chat-chip" style="background:#f7f3ec;border:1px solid rgba(176,196,212,0.35);color:#2d3f52;font-size:0.75rem;padding:4px 10px;border-radius:20px;cursor:pointer;font-family:inherit;">${t}</button>`).join('');
    chips.querySelectorAll('.chat-chip').forEach(btn => {
      btn.addEventListener('click', function() {
        chips.innerHTML = '';
        addMsg(this.textContent, 'user');
        setTimeout(() => addMsg(getReply(this.textContent), 'bot'), 500);
      });
    });
  }

  function addMsg(text, cls) {
    const box = document.getElementById('chat-msgs');
    if (!box) return;
    const m = document.createElement('div');
    m.style.cssText = cls === 'bot'
      ? 'background:#f7f3ec;color:#2c4a3e;padding:8px 12px;border-radius:12px 12px 12px 3px;font-size:0.85rem;line-height:1.55;max-width:88%;align-self:flex-start;'
      : 'background:#3a5a7a;color:#fff;padding:8px 12px;border-radius:12px 12px 3px 12px;font-size:0.85rem;line-height:1.55;max-width:88%;align-self:flex-end;';
    m.textContent = text;
    box.appendChild(m);
    box.scrollTop = box.scrollHeight;
  }

  function getReply(q) {
    q = q.toLowerCase();
    if (/fee|cost|price|pay|how much|£|gbp|eur|€/.test(q)) return KB.fees;
    if (/book|start|contact|consult|appoint|get in touch/.test(q)) return KB.book;
    if (/confid|private|secret|safe|data/.test(q)) return KB.confidential;
    if (/online|video|virtual|remote|platform/.test(q)) return KB.online;
    if (/first|initial|begin|start/.test(q)) return KB.first;
    if (/nervous|anxious|scared|worry|unsure/.test(q)) return KB.nervous;
    if (/relation|couple|partner|family|parent/.test(q)) return KB.relationships;
    if (/approach|method|cbt|person|attach|integrat/.test(q)) return KB.approach;
    if (/service|help|treat|work with|issue|problem/.test(q)) return KB.services;
    if (/privacy|gdpr|data|policy/.test(q)) return KB.privacy;
    return 'I\'m not able to answer that specifically here. Please use the contact form on the Contact page and Gerarda will get back to you within 24–48 hours.';
  }

  function toggleChat() {
    const panel = document.getElementById('chat-panel');
    const bubble = document.getElementById('chat-bubble');
    if (!panel) return;
    const isOpen = panel.style.display === 'flex';
    panel.style.display = isOpen ? 'none' : 'flex';
    panel.style.flexDirection = 'column';
    bubble.style.transform = isOpen ? 'scale(1)' : 'scale(0.95)';
    setTimeout(() => { bubble.style.transform = 'scale(1)'; }, 200);
    if (!isOpen && document.getElementById('chat-msgs').children.length === 0) {
      setTimeout(() => {
        addMsg('Hi! I can help with quick questions about services, fees, and booking. What would you like to know?', 'bot');
        showChips();
      }, 200);
    }
  }

  function sendChat() {
    const inp = document.getElementById('chat-input');
    const text = inp.value.trim();
    if (!text) return;
    document.getElementById('chat-chips').innerHTML = '';
    addMsg(text, 'user');
    inp.value = '';
    setTimeout(() => addMsg(getReply(text), 'bot'), 500);
  }

  // Attach chatbot event listeners — no inline onclick
  document.getElementById('chat-bubble').addEventListener('click', toggleChat);
  document.getElementById('chat-close-btn').addEventListener('click', toggleChat);
  document.getElementById('chat-send-btn').addEventListener('click', sendChat);
  document.getElementById('chat-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendChat();
  });
})();

// ---- Navbar scroll effect ----
document.addEventListener('DOMContentLoaded', function() {
  var navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', function() {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    });
  }
});

// ---- Mobile hamburger — wrapped in DOMContentLoaded ----
document.addEventListener('DOMContentLoaded', function() {
  var hamburger = document.getElementById('hamburger');
  var navLinks = document.getElementById('nav-links');

  if (!hamburger || !navLinks) return;

  function closeMenu() {
    navLinks.classList.remove('open');
    hamburger.querySelectorAll('span').forEach(function(s) {
      s.style.transform = ''; s.style.opacity = '';
    });
  }

  function openMenu() {
    navLinks.classList.add('open');
    var spans = hamburger.querySelectorAll('span');
    if (spans[0]) spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
    if (spans[1]) spans[1].style.opacity = '0';
    if (spans[2]) spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
  }

  hamburger.addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();
    if (navLinks.classList.contains('open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  navLinks.querySelectorAll('a').forEach(function(link) {
    link.addEventListener('click', function() {
      closeMenu();
    });
  });

  document.addEventListener('click', function(e) {
    if (navLinks.classList.contains('open')) {
      if (!navLinks.contains(e.target) && !hamburger.contains(e.target)) {
        closeMenu();
      }
    }
  });
});

// ---- Set active nav link ----
document.addEventListener('DOMContentLoaded', function() {
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(function(link) {
    if (link.getAttribute('href') === currentPage || (currentPage === '' && link.getAttribute('href') === 'index.html')) {
      link.classList.add('active');
    }
  });
});

// ---- FAQ Accordion ----
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const answer = item.querySelector('.faq-answer');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(openItem => {
      openItem.classList.remove('open');
      openItem.querySelector('.faq-answer').style.maxHeight = null;
    });
    if (!isOpen) {
      item.classList.add('open');
      answer.style.maxHeight = answer.scrollHeight + 'px';
    }
  });
});

// ---- Contact form — let Netlify handle submission natively ----
const contactForm = document.getElementById('contact-form');
if (contactForm) {
  // Allow native Netlify form submission — no preventDefault
}

// ---- Smooth reveal on scroll ----
const revealEls = document.querySelectorAll('.card, .step, .approach-block, .blog-card, .faq-item');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  revealEls.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = `opacity 0.5s ease ${i * 0.08}s, transform 0.5s ease ${i * 0.08}s`;
    observer.observe(el);
  });
}
