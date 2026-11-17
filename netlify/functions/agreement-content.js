// netlify/functions/agreement-content.js
//
// SINGLE SOURCE OF TRUTH for the consent agreement wording.
// - The signed PDF (sign-contract.js) reads it directly.
// - The signing page reads it via /agreement.json, which .eleventy.js writes
//   from this file at build time.
// So the page and the PDF can never drift apart. To change the wording,
// edit THIS file only (and bump VERSION).
//
// Block types:  { lead?, p }  paragraph (optional bold lead-in)
//               { ul: [...] } bullet list

const VERSION = 'consent-v2-2026-11-draft';

const INTRO =
  'This Consent Agreement sets out the terms on which I, the Therapist, provide online counselling and psychotherapy services to you, the Client. It reflects UK law and the ethical requirements of the British Association for Counselling and Psychotherapy (BACP). Where two people attend together (for example, couples therapy), each is a Client and each signs separately.';

const SECTIONS = [
  {
    heading: '3. Therapist information',
    blocks: [
      { p: 'Gerarda Sullivan · BACP registration no. 416049 (Registered Member MBACP) · Phone (+44) 7741 756743 · info@gerarda-sullivan-counselling.com' }
    ]
  },
  {
    heading: '5. My professional approach',
    blocks: [
      { p: 'I am a therapist working with an Integrative Counselling and Psychotherapy approach, drawing on:' },
      { ul: [
        'Person-Centred Therapy – focusing on empathy, acceptance, and your own pace of growth.',
        'Cognitive Behavioural Therapy (CBT) – exploring how thoughts, feelings, and behaviours influence one another.',
        'Attachment Theory – understanding patterns of relationships and early experiences.'
      ] },
      { p: 'As a member of the British Association for Counselling and Psychotherapy (BACP), I adhere to their Ethical Framework for the Counselling Professions (2026), both of which can be found on the website: www.bacp.co.uk' }
    ]
  },
  {
    heading: '6. Online counselling explained',
    blocks: [
      { ul: [
        'Sessions with the Client will take place via Google Meet, an encrypted video platform. Appropriate security and data protection measures are maintained in accordance with applicable GDPR requirements.',
        'I offer online counselling and psychotherapy services, generally referred to as teletherapy via secure internet technology. This can include consultation, treatment, transfer of medical data, emails, telephone conversations and/or education using interactive audio, video, or data communications. Teletherapy has the same purpose or intention as counselling sessions conducted face-to-face and costs the same as face-to-face sessions. Research indicates positive efficacy for virtual counselling sessions. However, due to the nature of the technology used, teletherapy may be experienced differently than face-to-face treatment sessions.',
        'While security measures are in place, no online platform can be guaranteed 100% secure. You are encouraged to ensure privacy on your end (e.g., private room, secure internet, use of headphones). You are also responsible for a stable and secure connection on your end.',
        'On occasion, technical failures may interrupt service. In the event of a disconnection, I will attempt to reconnect for up to 10 minutes. If reconnection is not possible during a particular session, I will contact you by phone on the number you have provided to discuss arranging a new appointment.',
        'During our therapy sessions, I may determine that online counselling is not suitable for you. If I deem online counselling inappropriate, I will discuss referrals with you.'
      ] }
    ]
  },
  {
    heading: '7. Session structure',
    blocks: [
      { p: 'Sessions are 50 minutes long. Frequency and session times are agreed between us. If you are late in joining any session, such session will still end at the agreed time.' }
    ]
  },
  {
    heading: '8. Confidentiality',
    blocks: [
      { p: 'Information disclosed in sessions is confidential and held securely in accordance with BACP standards. Exceptions apply where disclosure is legally or ethically required. These include:' },
      { ul: [
        'Serious risk of harm to yourself or others.',
        'There are concerns about the safety of a child or vulnerable adult.',
        'Court order or legal requirement to disclose information.',
        'Serious criminal activity or public protection obligations.',
        'Lack of mental capacity requiring intervention to protect your welfare.'
      ] },
      { p: 'Where possible, I will discuss this with you before taking any action. In circumstances where I have serious concerns about your immediate safety, I am permitted to contact your nominated Emergency Contact person or GP / Primary Healthcare Provider using the details you have provided in this Consent Agreement.' },
      { lead: 'Couples and joint sessions:', p: 'information shared by either Client in a joint session is held within the therapy and is not kept confidential from the other Client.' }
    ]
  },
  {
    heading: '9. Use of artificial intelligence (AI)-based mental health platforms',
    blocks: [
      { lead: '9.1', p: 'Some Clients may independently choose to use AI-based platforms, applications or chatbots designed to provide mental health information, emotional support or psychotherapy-related guidance.' },
      { lead: '9.2', p: 'The Client understands that such platforms may provide inaccurate, misleading or inappropriate information, may not be operated or supervised by qualified mental health professionals, and may present risks concerning the privacy and confidentiality of personal information.' },
      { lead: '9.3', p: 'Any use of such platforms is entirely voluntary, at the Client’s own choice and responsibility, and is independent of the professional counselling and psychotherapy services provided by the Therapist.' },
      { lead: '9.4', p: 'The Therapist does not operate, control, endorse or supervise such platforms and accepts no responsibility for their content, accuracy, recommendations or consequences arising from their independent use by the Client.' },
      { lead: '9.5', p: 'The Client acknowledges that AI-based mental health platforms are not a substitute for professional counselling, psychotherapy or appropriate medical care.' }
    ]
  },
  {
    heading: '10. Data protection and client rights',
    blocks: [
      { p: 'Notes will be recorded by me for your file to help aid in your therapeutic journey along with your contact details. These will be stored securely in accordance with the Data Protection Act 2018 and UK General Data Protection Regulation (“GDPR”). Digital records are kept on an encrypted, password-protected device. Any paper records are stored in a locked cabinet. Only I have access to these records.' },
      { p: 'Records are retained for 7 years after therapy ends, in line with professional and insurance requirements, after which they will be securely destroyed. You have the right to access your records, request corrections, or ask for deletion where legally permissible.' },
      { p: 'In line with the British Association for Counselling and Psychotherapy (BACP) Ethical Framework, and to maintain good practice, I may anonymously discuss case material in professional supervision. This is a professional requirement for all counsellors and psychotherapists and provides a confidential space to reflect on my work, ensure safe and ethical practice, and support the quality of the therapy I offer.' }
    ]
  },
  {
    heading: '11. Boundaries & contact between sessions',
    blocks: [
      { p: 'Contact outside sessions is strictly limited to administrative matters (e.g., confirming or cancelling appointments).' },
      { p: 'I do not provide an emergency service. If you are in immediate crisis, please call 999 or contact the Samaritans (116 123).' },
      { p: 'If I have serious concerns for your immediate safety, I am permitted to contact your nominated Emergency Contact person or GP / Primary Healthcare Provider using the details you have provided in this Consent Agreement.' }
    ]
  },
  {
    heading: '12. Fees & cancellations',
    blocks: [
      { lead: '12.1 Private clients.', p: 'The fee for an individual session is £80. The fee for a couples session is £150. Payment is made online by card or Stripe via the secure payment link provided at booking, or by bank transfer where agreed, and is required no later than 24 hours before the session to confirm your appointment.' },
      { lead: '12.2 Insurance and third-party funded clients.', p: 'Where your sessions are funded by an insurer, case-management company or other third-party payer, I will invoice that payer directly for the sessions it has authorised, at the rates agreed with it, and you will not be asked to pay for those sessions. The payer may need to be told the dates of sessions attended and, where required, limited administrative information; I will share only the minimum necessary and will not disclose the content of your sessions without your consent, except where Section 8 applies. You remain responsible for any session that the payer declines or does not authorise.' },
      { lead: '12.3 Referred clients.', p: 'Where you have been referred to me by an organisation, employer or other referrer, fees are as set out in the arrangement with that organisation, which I will explain before we begin. Clause 12.2 applies to the extent that the referrer pays for your sessions.' },
      { lead: '12.4 Cancellations.', p: 'Cancellations or changes with less than 24 hours’ notice may be charged in full, whether you are a private, insurance-funded or referred client. Where a third-party payer does not cover a late cancellation or missed session, the charge may be passed to you.' },
      { lead: '12.5 Couples.', p: 'Where two Clients attend together, each is responsible for the fees for joint sessions, unless we agree otherwise in writing.' }
    ]
  },
  {
    heading: '13. Progress review',
    blocks: [
      { p: 'I will review your progress and goals after our first six (6) sessions, and at mutually agreed points thereafter. Reviews help ensure that therapy continues to meet your needs and that the approach remains effective. You are encouraged to share feedback freely so we can make any appropriate adjustments or discuss any concerns.' }
    ]
  },
  {
    heading: '14. Holidays & absences',
    blocks: [
      { p: 'I will give you advance notice of any holidays or absences I have planned. In case of illness, I will notify you as soon as possible and reschedule where feasible.' }
    ]
  },
  {
    heading: '15. Consent & signatures',
    blocks: [
      { p: 'I confirm that I have read and understood this Agreement and consent to receive virtual counselling/psychotherapy services under the terms stated herein. Where two Clients sign, each Client confirms and consents individually.' }
    ]
  }
];

module.exports = { VERSION, INTRO, SECTIONS };
