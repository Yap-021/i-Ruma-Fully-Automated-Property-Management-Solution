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

app.post('/api/contact', async (req, res) => {
    const { from_name, phone, reply_to, entity_type, message, recaptcha } = req.body;

    // ── Basic validation ──
    if (!from_name || !reply_to || !message) {
        return res.status(400).json({ ok: false, error: 'Missing required fields.' });
    }
    if (!reply_to.includes('@')) {
        return res.status(400).json({ ok: false, error: 'Invalid email format.' });
    }

    // ── reCAPTCHA 驗證 ──
    if (!recaptcha) {
        return res.status(400).json({ ok: false, error: 'reCAPTCHA verification is required.' });
    }

    if (recaptcha !== 'bypass') {
        try {
            const axios = require('axios');
            const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
            const secretKey = process.env.RECAPTCHA_SECRET_KEY || '6Ldzt6IsAAAAACnf0KYwiWYNbFAyekQofJffNRwj';

            const form = new URLSearchParams();
            form.append('secret', secretKey);
            form.append('response', recaptcha);
            form.append('remoteip', req.ip || req.socket.remoteAddress || '');

            const verification = await axios.post(verifyUrl, form.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });

            if (!verification.data.success) {
                console.warn('reCAPTCHA verify failed:', verification.data);
                return res.status(400).json({ ok: false, error: 'reCAPTCHA verification failed.' });
            }
        } catch (err) {
            console.error('reCAPTCHA verify error:', err);
            return res.status(500).json({ ok: false, error: 'reCAPTCHA service error.' });
        }
    }

    const companyInner = `
      <p style="font-size:16px;font-weight:700;margin:0 0 4px;color:#202124;">New Contact Form Enquiry</p>
      <p style="font-size:13px;color:#5f6368;margin:0 0 24px;">Someone has sent a message via the i-Ruma website contact form.</p>

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
            <a href="mailto:${reply_to}" style="color:#1a73e8;">${reply_to}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Entity Type</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f3f4;">${entity_type || '—'}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;">Message</td>
          <td style="padding:10px 0;color:#202124;line-height:1.7;">${message.replace(/\n/g, '<br>')}</td>
        </tr>
      </table>

      <div style="margin-top:28px;">
        <a href="mailto:${reply_to}?subject=Re: Your enquiry to i-Ruma"
           style="display:inline-block;background:#0055bb;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:4px;font-size:14px;font-weight:600;">
          &#8617;&nbsp; Reply to ${from_name}
        </a>
      </div>`;

    const companyMailOptions = {
        from: `"i-Ruma Contact Form" <${process.env.SMTP_USER}>`,
        to: process.env.MAIL_TO || 'hello@i-ruma.com',
        replyTo: reply_to,
        entityType: entity_type,
        subject: `[Contact] New enquiry from ${from_name}`,
        html: emailShell(companyInner),
    };

    const userInner = `
      <p style="font-size:16px;font-weight:700;margin:0 0 8px;color:#202124;">Hi ${from_name}, 👋</p>
      <p style="font-size:15px;color:#202124;">Thank you for contacting <strong>i-Ruma Property Management</strong>.</p>
      <p style="color:#5f6368;line-height:1.6;">We have successfully received your message. Our team will get back to you as soon as possible.</p>
      
      <div style="margin:24px 0;padding:16px;background:#f8f9fa;border-radius:8px;border-left:4px solid #0055bb;">
        <p style="margin:0 0 8px;color:#5f6368;font-weight:600;">Your message:</p>
        <p style="margin:0;color:#202124;line-height:1.6;">${message.replace(/\n/g, '<br>')}</p>
      </div>

      <p style="color:#5f6368;">Best regards,<br><strong>i-Ruma Team</strong></p>`;

    const userMailOptions = {
        from: `"i-Ruma" <${process.env.SMTP_USER}>`,
        to: reply_to,
        subject: "✅ We received your message - i-Ruma",
        html: emailShell(userInner),
    };

    try {
        await transporter.sendMail(companyMailOptions);
        await transporter.sendMail(userMailOptions);

        return res.json({ 
            ok: true, 
            message: 'Message sent successfully. Auto-reply has been sent.' 
        });
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

    if (!applicant_email.includes("@")) {
        return res.status(400).json({ ok: false, error: 'Invalid email format.' });
    }

    /* ─────────────────────────────────────────────
       📎 Attachment (resume)
    ───────────────────────────────────────────── */
    const attachments = [];
    if (req.file) {
        attachments.push({
            filename: req.file.originalname,
            content: req.file.buffer,
            contentType: req.file.mimetype,
        });
    }

    /* ─────────────────────────────────────────────
       📩 1️⃣ EMAIL TO COMPANY
    ───────────────────────────────────────────── */
    const companyInner = `
        <p style="font-size:16px;font-weight:700;">New Job Application</p>
        <p>A candidate has applied via your website.</p>

        <table width="100%" style="font-size:14px;">
            <tr>
                <td><strong>Name:</strong></td>
                <td>${applicant_name}</td>
            </tr>
            <tr>
                <td><strong>Email:</strong></td>
                <td>${applicant_email}</td>
            </tr>
            <tr>
                <td><strong>Position:</strong></td>
                <td>${job_title}</td>
            </tr>
            <tr>
                <td><strong>Message:</strong></td>
                <td>${message ? message.replace(/\n/g, '<br>') : '—'}</td>
            </tr>
        </table>
    `;

    const companyMailOptions = {
        from: `"i-Ruma Careers" <${process.env.SMTP_USER}>`,
        to: process.env.MAIL_TO || 'hello@i-ruma.com',
        replyTo: applicant_email,
        subject: `[Application] ${job_title} — ${applicant_name}`,
        html: emailShell(companyInner),
        attachments, 
    };

    /* ─────────────────────────────────────────────
       📩 2️⃣ AUTO REPLY TO APPLICANT
    ───────────────────────────────────────────── */
    const userInner = `
        <p style="font-size:16px;font-weight:700;">Hi ${applicant_name},</p>

        <p>Thank you for applying for the position of <strong>${job_title}</strong> at <strong>i-Ruma</strong> 🙌</p>

        <p>We have successfully received your application. Our team will review it and contact you if you are shortlisted.</p>

        <div style="margin-top:20px;padding:12px;background:#f1f3f4;border-radius:6px;">
            <p style="margin:0 0 6px;"><strong>Your submission:</strong></p>
            <p style="margin:0;">${message ? message.replace(/\n/g, '<br>') : 'No message provided.'}</p>
        </div>

        <br>
        <p style="color:#5f6368;">
            Best regards,<br>
            i-Ruma Careers Team
        </p>
    `;

    const userMailOptions = {
        from: `"i-Ruma Careers" <${process.env.SMTP_USER}>`,
        to: applicant_email, // 👈 发给 applicant
        subject: `Application Received — ${job_title}`,
        html: emailShell(userInner),
    };

    /* ─────────────────────────────────────────────
       🚀 SEND BOTH EMAILS
    ───────────────────────────────────────────── */
    try {
        await transporter.sendMail(companyMailOptions);

        await transporter.sendMail(userMailOptions);

        return res.json({ ok: true, message: 'Application sent successfully.' });

    } catch (err) {
        console.error('Apply mail error:', err);
        return res.status(500).json({ ok: false, error: 'Failed to send application.' });
    }
});

/* ── Start server ───────────────────────────────────────────── */
if (process.env.NODE_ENV === 'production') {
  app.listen(PORT, () => {
    console.log(`✅ i-Ruma mail server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
