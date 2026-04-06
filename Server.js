/**
 * i-Ruma Mail Server
 * Node.js + Express + Nodemailer
 *
 * Install:  npm install express nodemailer multer cors dotenv
 * Setup:    Create .env file (see bottom of this file)
 * Run:      node Server.js
 */

require('dotenv').config();
const express    = require('express');
const nodemailer = require('nodemailer');
const multer     = require('multer');
const cors       = require('cors');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Middleware ─────────────────────────────────────────────── */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

/* ── Multer — in-memory file storage ───────────────────────── */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only PDF and Word documents are allowed.'));
    },
});

/* ── Nodemailer transporter ─────────────────────────────────── */
const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/* ══════════════════════════════════════════════════════════════
   SHARED — Gmail-style email wrapper
   Wraps any inner HTML content with the standard i-Ruma
   email shell (logo header, white body, grey footer)
══════════════════════════════════════════════════════════════ */
function emailShell(innerHtml) {
    const now = new Date().toLocaleString('en-MY', {
        timeZone:  'Asia/Kuala_Lumpur',
        weekday:   'long',
        year:      'numeric',
        month:     'long',
        day:       'numeric',
        hour:      '2-digit',
        minute:    '2-digit',
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>i-Ruma</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#202124;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;">

          <!-- ── HEADER LOGO BAR ── -->
          <tr>
            <td style="background:#0055bb;padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">i-Ruma</span>
                    <span style="font-size:12px;color:rgba(255,255,255,0.7);margin-left:8px;">Property Management</span>
                  </td>
                  <td align="right">
                    <span style="font-size:11px;color:rgba(255,255,255,0.6);">hello@i-ruma.com</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── BODY CONTENT (injected per email) ── -->
          <tr>
            <td style="padding:32px;">
              ${innerHtml}
            </td>
          </tr>

          <!-- ── DIVIDER ── -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid #e8eaed;margin:0;"/>
            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td style="padding:20px 32px 28px;background:#f8f9fa;border-top:none;">
              <p style="margin:0 0 6px;font-size:12px;color:#80868b;">
                This email was sent by <strong>i-Ruma Solutions Sdn. Bhd.</strong>
              </p>
              <p style="margin:0 0 6px;font-size:12px;color:#80868b;">
                No 809, Block A, Kelana Centre Point, No 3, Jalan SS7/19, Kelana Jaya, Petaling Jaya 47301, Selangor, Malaysia
              </p>
              <p style="margin:0;font-size:11px;color:#9aa0a6;">${now} MYT</p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}

/* ══════════════════════════════════════════════════════════════
   ROUTE 1 — Contact Form
   POST /api/contact
   Body: { from_name, phone, reply_to, message }
══════════════════════════════════════════════════════════════ */
app.post('/api/contact', async (req, res) => {
    const { from_name, phone, reply_to, message, recaptcha } = req.body;

    if (!recaptcha) {
      return res.status(400).json({ ok: false, error: 'reCAPTCHA verification is required.' });
    }

    try {
      const axios = require('axios');

      const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
      // 6Ldzt6IsAAAAACnf0KYwiWYNbFAyekQofJffNRwj
      const secretKey = process.env.RECAPTCHA_SECRET_KEY;   // Your Secret Key

      // Google reCAPTCHA `siteverify` 需要用 x-www-form-urlencoded 形式提交到 POST body
      // 否则经常会拿到 `error-codes: ["bad-request"]`
      const form = new URLSearchParams();
      form.append('secret', secretKey);
      form.append('response', recaptcha);
      form.append('remoteip', req.ip || req.socket.remoteAddress || '');

      const verification = await axios.post(verifyUrl, form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      
      if (!verification.data.success) {
        console.warn('reCAPTCHA verify failed:', verification.data);
        return res.status(400).json({ ok: false, error: 'reCAPTCHA verification failed. Please try again.' });
      }
    } catch (err) {
      console.error('reCAPTCHA verify error:', err);
      return res.status(500).json({ ok:false, error: 'reCAPTCHA service error. Please try again later.' });
    }

    if (!from_name || !reply_to || !message) {
        return res.status(400).json({ ok: false, error: 'Missing required fields.' });
    }

    /* ── Inner content ── */
    const inner = `
      <!-- Greeting -->
      <p style="font-size:16px;font-weight:700;margin:0 0 4px;color:#202124;">New Contact Form Enquiry</p>
      <p style="font-size:13px;color:#5f6368;margin:0 0 24px;">Someone has sent a message via the i-Ruma website contact form.</p>

      <!-- Detail rows -->
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Name</td>
          <td style="padding:10px 0;color:#202124;font-weight:700;border-bottom:1px solid #f1f3f4;">${from_name}</td>
        </tr>

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Phone</td>
          <td style="padding:10px 0;color:#202124;border-bottom:1px solid #f1f3f4;">${phone || '—'}</td>
        </tr>

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Email</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f3f4;">
            <a href="mailto:${reply_to}" style="color:#1a73e8;text-decoration:none;">${reply_to}</a>
          </td>
        </tr>

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;">Message</td>
          <td style="padding:10px 0;color:#202124;line-height:1.7;">${message.replace(/\n/g, '<br>')}</td>
        </tr>

      </table>

      <!-- Reply CTA -->
      <div style="margin-top:28px;">
        <a href="mailto:${reply_to}?subject=Re: Your enquiry to i-Ruma"
           style="display:inline-block;background:#0055bb;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:4px;font-size:14px;font-weight:600;">
          &#8617;&nbsp; Reply to ${from_name}
        </a>
      </div>`;

    const mailOptions = {
        from:    `"i-Ruma Contact Form" <${process.env.SMTP_USER}>`,
        to:      process.env.MAIL_TO || 'hello@i-ruma.com',
        replyTo: reply_to,
        subject: `[Contact] New enquiry from ${from_name}`,
        html:    emailShell(inner),
    };

    try {
        await transporter.sendMail(mailOptions);
        return res.json({ ok: true, message: 'Message sent successfully.' });
    } catch (err) {
        console.error('Contact mail error:', err);
        return res.status(500).json({ ok: false, error: 'Failed to send email. Please try again.' });
    }
});

/* ══════════════════════════════════════════════════════════════
   ROUTE 2 — Job Application (with resume attachment)
   POST /api/apply
   FormData: { applicant_name, applicant_email, job_title, message, resume (file) }
══════════════════════════════════════════════════════════════ */
app.post('/api/apply', upload.single('resume'), async (req, res) => {
    const { applicant_name, applicant_email, job_title, message } = req.body;

    if (!applicant_name || !applicant_email || !job_title) {
        return res.status(400).json({ ok: false, error: 'Missing required fields.' });
    }

    const attachments = [];
    if (req.file) {
        attachments.push({
            filename:    req.file.originalname,
            content:     req.file.buffer,
            contentType: req.file.mimetype,
        });
    }

    /* ── Inner content ── */
    const inner = `
      <!-- Greeting -->
      <p style="font-size:16px;font-weight:700;margin:0 0 4px;color:#202124;">New Job Application</p>
      <p style="font-size:13px;color:#5f6368;margin:0 0 4px;">
        A candidate has applied for a position via the i-Ruma Careers page.
      </p>
      <!-- Position badge -->
      <p style="margin:0 0 24px;">
        <span style="display:inline-block;background:#e8f0fe;color:#1a73e8;font-size:12px;font-weight:700;padding:4px 12px;border-radius:12px;letter-spacing:0.3px;">
          ${job_title}
        </span>
      </p>

      <!-- Detail rows -->
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Applicant</td>
          <td style="padding:10px 0;color:#202124;font-weight:700;border-bottom:1px solid #f1f3f4;">${applicant_name}</td>
        </tr>

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Email</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f3f4;">
            <a href="mailto:${applicant_email}" style="color:#1a73e8;text-decoration:none;">${applicant_email}</a>
          </td>
        </tr>

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Position</td>
          <td style="padding:10px 0;color:#202124;border-bottom:1px solid #f1f3f4;">${job_title}</td>
        </tr>

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Message</td>
          <td style="padding:10px 0;color:#202124;line-height:1.7;border-bottom:1px solid #f1f3f4;">
            ${message ? message.replace(/\n/g, '<br>') : '<span style="color:#9aa0a6;">No message provided.</span>'}
          </td>
        </tr>

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;">Resume</td>
          <td style="padding:10px 0;color:#202124;">
            ${req.file
                ? `<span style="display:inline-flex;align-items:center;gap:6px;background:#f8f9fa;border:1px solid #e0e0e0;border-radius:6px;padding:6px 12px;font-size:13px;">
                     &#128206; <strong>${req.file.originalname}</strong>
                     <span style="color:#80868b;">(${(req.file.size / 1024).toFixed(1)} KB)</span>
                   </span>
                   <p style="margin:6px 0 0;font-size:12px;color:#80868b;">See attached file above.</p>`
                : '<span style="color:#9aa0a6;">No resume attached.</span>'
            }
          </td>
        </tr>

      </table>

      <!-- Action buttons -->
      <div style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap;">
        <a href="mailto:${applicant_email}?subject=Re: Your application for ${encodeURIComponent(job_title)} at i-Ruma"
           style="display:inline-block;background:#0055bb;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:4px;font-size:14px;font-weight:600;">
          &#8617;&nbsp; Reply to Applicant
        </a>
        <a href="mailto:${applicant_email}?subject=Interview Invitation — ${encodeURIComponent(job_title)} at i-Ruma&body=Dear ${encodeURIComponent(applicant_name)},%0D%0A%0D%0AThank you for your application..."
           style="display:inline-block;background:#ffffff;color:#0055bb;text-decoration:none;padding:10px 24px;border-radius:4px;font-size:14px;font-weight:600;border:1px solid #0055bb;">
          &#128197;&nbsp; Invite for Interview
        </a>
      </div>`;

    const mailOptions = {
        from:        `"i-Ruma Careers" <${process.env.SMTP_USER}>`,
        to:          process.env.MAIL_TO || 'hello@i-ruma.com',
        replyTo:     applicant_email,
        subject:     `[Application] ${job_title} — ${applicant_name}`,
        html:        emailShell(inner),
        attachments,
    };

    try {
        await transporter.sendMail(mailOptions);
        return res.json({ ok: true, message: 'Application sent successfully.' });
    } catch (err) {
        console.error('Apply mail error:', err);
        return res.status(500).json({ ok: false, error: 'Failed to send application. Please try again.' });
    }
});

/* ── Start server ───────────────────────────────────────────── */
if (process.env.NODE_ENV === 'production') {
  app.listen(PORT, () => {
    console.log(`✅ i-Ruma mail server running at http://localhost:${PORT}`);
  });
}

/*
 * .env file should contain:
 * ─────────────────────────────
 * PORT=3000
 * SMTP_HOST=smtp.gmail.com
 * SMTP_PORT=587
 * SMTP_USER=yongqi060121@gmail.com
 * SMTP_PASS=kenxhjpuledqsqzd
 * MAIL_TO=yongqi060121@gmail.com
 */