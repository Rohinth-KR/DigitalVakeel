# ============================================================
#  notifier.py  —  Digital-Vakeel Notification Engine
#  Sends real WhatsApp (Twilio Sandbox) + Email (Resend API)
#  3 legal notice templates matching the MSMED Act trigger days
# ============================================================

import os
import json
import requests
from datetime import datetime

# ─────────────────────────────────────────────
#  CONFIG (from env vars — never hardcode in prod)
# ─────────────────────────────────────────────

TWILIO_SID      = os.environ.get("TWILIO_SID",    "")
TWILIO_TOKEN    = os.environ.get("TWILIO_TOKEN",  "")
TWILIO_WA_FROM  = os.environ.get("TWILIO_FROM",   "whatsapp:+14155238886")  # Twilio Sandbox

RESEND_API_KEY  = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL      = os.environ.get("FROM_EMAIL",     "onboarding@resend.dev")
FROM_NAME       = os.environ.get("FROM_NAME",      "Digital-Vakeel Legal")


# ─────────────────────────────────────────────
#  WHATSAPP NOTICE TEMPLATES
# ─────────────────────────────────────────────

def _wa_template(invoice: dict, template_no: int) -> str:
    """Build WhatsApp message text for each trigger day."""
    inv_no   = invoice.get("invoice_no", "N/A")
    seller   = invoice.get("seller_name", "The Seller")
    buyer    = invoice.get("buyer_name", "Your Company")
    amount   = invoice.get("amount", 0)
    interest = invoice.get("interest_accrued", 0)
    total    = amount + interest
    due_date = invoice.get("due_date", "")
    udyam    = invoice.get("udyam_id", "N/A")

    fmt_amt  = f"₹{amount:,.0f}"
    fmt_tot  = f"₹{total:,.0f}"

    if template_no == 1:
        return (
            f"📢 *Payment Reminder — MSMED Act 2006*\n\n"
            f"Dear {buyer},\n\n"
            f"This is a formal reminder from *{seller}* (Udyam: {udyam}).\n\n"
            f"Invoice *{inv_no}* of *{fmt_amt}* was due on {due_date} and remains unpaid.\n\n"
            f"As per *Section 15 & 16 of the MSMED Act 2006*, compound interest at 19.5% p.a. is now accruing.\n\n"
            f"📌 *Total now due: {fmt_tot}*\n\n"
            f"Please arrange payment at the earliest to avoid further legal action.\n\n"
            f"— Digital-Vakeel Legal Enforcement System"
        )
    elif template_no == 2:
        return (
            f"⚖️ *FORMAL LEGAL NOTICE — MSMED Act 2006*\n\n"
            f"To: {buyer}\n"
            f"From: {seller} (Udyam: {udyam})\n\n"
            f"*SUBJECT: Overdue Payment — Invoice {inv_no}*\n\n"
            f"Despite our earlier reminder, Invoice *{inv_no}* of *{fmt_amt}* remains unpaid.\n\n"
            f"You are hereby notified under Section 18 of the MSMED Act 2006 to pay the outstanding amount of *{fmt_tot}* (including statutory interest) within *7 days*.\n\n"
            f"Failure to comply will result in filing a formal complaint at the MSME Facilitation Council.\n\n"
            f"— Digital-Vakeel Legal Enforcement System"
        )
    else:  # template_no == 3
        return (
            f"🚨 *FINAL NOTICE — MSME SAMADHAAN FILING IMMINENT*\n\n"
            f"To: {buyer}\n\n"
            f"This is your FINAL notice. Invoice *{inv_no}* of *{fmt_amt}* is critically overdue.\n\n"
            f"Total amount due (with compound interest): *{fmt_tot}*\n\n"
            f"⚠️ A formal complaint will be filed on the *MSME Samadhaan Portal* within 24 hours if payment is not received.\n\n"
            f"Once filed, the matter will be referred to the MSME Facilitation Council and you will be liable for full dues plus legal costs.\n\n"
            f"— Digital-Vakeel Legal Enforcement System"
        )


# ─────────────────────────────────────────────
#  EMAIL HTML TEMPLATES
# ─────────────────────────────────────────────

def _email_template(invoice: dict, template_no: int) -> tuple[str, str]:
    """Returns (subject, html_body) for each template."""
    inv_no   = invoice.get("invoice_no", "N/A")
    seller   = invoice.get("seller_name", "The Seller")
    buyer    = invoice.get("buyer_name", "Your Company")
    amount   = invoice.get("amount", 0)
    interest = invoice.get("interest_accrued", 0)
    total    = amount + interest
    due_date = invoice.get("due_date", "")
    udyam    = invoice.get("udyam_id", "N/A")

    fmt_amt  = f"₹{amount:,.0f}"
    fmt_int  = f"₹{interest:,.0f}"
    fmt_tot  = f"₹{total:,.0f}"

    # --- shared HTML wrapper ---
    def html_wrap(badge_color: str, badge_text: str, title: str, body_html: str) -> str:
        return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body {{ font-family: 'Segoe UI', Arial, sans-serif; background:#F7F9FC; margin:0; padding:20px; }}
    .card {{ max-width:600px; margin:0 auto; background:#fff; border-radius:12px;
             border:1px solid #E2E8F0; overflow:hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }}
    .header {{ background:#0C1A2E; padding:28px 32px; }}
    .logo {{ color:#00C9B8; font-size:22px; font-weight:800; }}
    .tagline {{ color:rgba(255,255,255,0.4); font-size:11px; margin-top:4px; }}
    .badge {{ display:inline-block; padding:6px 16px; border-radius:100px;
              background:{badge_color}20; color:{badge_color}; font-weight:700;
              font-size:12px; border:1px solid {badge_color}40; margin:20px 32px 0; }}
    .content {{ padding:28px 32px; }}
    h1 {{ color:#1A2744; font-size:20px; margin:0 0 8px; }}
    .subtitle {{ color:#64748B; font-size:13px; margin-bottom:24px; }}
    .table {{ width:100%; border-collapse:collapse; margin:20px 0; }}
    .table td {{ padding:10px 12px; border-bottom:1px solid #E2E8F0; font-size:13px; }}
    .table td:first-child {{ color:#64748B; font-weight:600; width:40%; }}
    .table td:last-child {{ color:#1A2744; font-weight:500; }}
    .total-row td {{ background:#FFF7ED; font-size:15px; font-weight:700; border-bottom:none; }}
    .total-row td:last-child {{ color:#D97706; }}
    .alert {{ background:#FEF2F2; border:1px solid #FECACA; border-radius:8px;
              padding:14px 16px; margin:20px 0; font-size:13px; color:#991B1B; }}
    .footer {{ background:#F7F9FC; padding:18px 32px; border-top:1px solid #E2E8F0;
               font-size:11px; color:#94A3B8; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo">⚖ Digital-Vakeel</div>
      <div class="tagline">MSME PAYMENT ENFORCEMENT SYSTEM</div>
    </div>
    <div class="badge">{badge_text}</div>
    <div class="content">
      <h1>{title}</h1>
      {body_html}
    </div>
    <div class="footer">
      This notice has been generated automatically by Digital-Vakeel under MSMED Act 2006.
      Seller: {seller} &nbsp;|&nbsp; Udyam ID: {udyam}
    </div>
  </div>
</body>
</html>"""

    if template_no == 1:
        subject = f"Payment Reminder: Invoice {inv_no} — {fmt_amt} Overdue"
        body = html_wrap(
            "#F59E0B", "⚠️ PAYMENT REMINDER",
            f"Invoice {inv_no} is Overdue",
            f"""
            <p class="subtitle">From {seller} to {buyer}</p>
            <table class="table">
              <tr><td>Invoice No.</td><td>{inv_no}</td></tr>
              <tr><td>Invoice Date</td><td>{invoice.get('invoice_date','')}</td></tr>
              <tr><td>Due Date</td><td>{due_date}</td></tr>
              <tr><td>Principal Amount</td><td>{fmt_amt}</td></tr>
              <tr><td>Interest Accrued (19.5% p.a.)</td><td>{fmt_int}</td></tr>
              <tr class="total-row"><td>Total Amount Due</td><td>{fmt_tot}</td></tr>
            </table>
            <div class="alert">
              As per <strong>Section 15 &amp; 16 of the MSMED Act 2006</strong>, compound interest at 19.5% p.a.
              is accruing daily on the overdue amount. Please arrange payment immediately.
            </div>
            """
        )
        return subject, body

    elif template_no == 2:
        subject = f"FORMAL LEGAL NOTICE: Invoice {inv_no} — Action Required Within 7 Days"
        body = html_wrap(
            "#EF4444", "⚖️ FORMAL LEGAL NOTICE",
            f"Formal Legal Notice — Invoice {inv_no}",
            f"""
            <p class="subtitle">Issued by {seller} (Udyam: {udyam})</p>
            <p style="font-size:13px;color:#1A2744;line-height:1.7;">
              Despite prior reminders, Invoice <strong>{inv_no}</strong> of <strong>{fmt_amt}</strong>
              from {seller} remains unpaid. This constitutes a violation of Section 15 of the MSMED Act 2006.
            </p>
            <table class="table">
              <tr><td>Invoice No.</td><td>{inv_no}</td></tr>
              <tr><td>Principal Amount</td><td>{fmt_amt}</td></tr>
              <tr><td>Statistical Interest</td><td>{fmt_int}</td></tr>
              <tr class="total-row"><td>Total Due Immediately</td><td>{fmt_tot}</td></tr>
            </table>
            <div class="alert">
              <strong>NOTICE:</strong> Under Section 18 of the MSMED Act 2006, you have <strong>7 days</strong>
              to remit the full amount. Failure will result in a formal complaint being filed with the
              MSME Facilitation Council, where you shall be liable for all dues plus legal costs.
            </div>
            """
        )
        return subject, body

    else:  # 3
        subject = f"FINAL NOTICE — MSME Samadhaan Filing in 24 Hours: Invoice {inv_no}"
        body = html_wrap(
            "#7C3AED", "🚨 FINAL ESCALATION NOTICE",
            f"Final Notice — MSME Samadhaan Filing Imminent",
            f"""
            <p class="subtitle">Invoice {inv_no} | {buyer}</p>
            <p style="font-size:13px;color:#1A2744;line-height:1.7;">
              This is the <strong>final notice</strong> before formal legal proceedings begin.
              Invoice <strong>{inv_no}</strong> remains critically overdue.
            </p>
            <table class="table">
              <tr><td>Invoice No.</td><td>{inv_no}</td></tr>
              <tr class="total-row"><td>Total Due (Final)</td><td>{fmt_tot}</td></tr>
            </table>
            <div class="alert" style="background:#F5F3FF;border-color:#C4B5FD;color:#4C1D95;">
              ⚠️ A formal complaint will be filed on the <strong>MSME Samadhaan Portal</strong> within
              <strong>24 hours</strong>. Once filed, the Facilitation Council will summon your company
              and the matter becomes part of the public legal record.
            </div>
            <p style="font-size:12px;color:#64748B;">
              To stop this filing immediately, transfer <strong>{fmt_tot}</strong> to the seller's
              registered bank account and send proof of payment.
            </p>
            """
        )
        return subject, body


# ─────────────────────────────────────────────
#  SEND WHATSAPP (Twilio Sandbox)
# ─────────────────────────────────────────────

def send_whatsapp(to_phone: str, invoice: dict, template_no: int) -> dict:
    """
    Send a WhatsApp message via Twilio Sandbox.
    to_phone: e.g. "+919876543210"
    """
    try:
        from twilio.rest import Client
        client = Client(TWILIO_SID, TWILIO_TOKEN)

        # Ensure proper format
        to_wa = f"whatsapp:{to_phone}" if not to_phone.startswith("whatsapp:") else to_phone

        message = client.messages.create(
            body=_wa_template(invoice, template_no),
            from_=TWILIO_WA_FROM,
            to=to_wa,
        )
        print(f"✅ WhatsApp sent | SID: {message.sid} | To: {to_phone} | Template: {template_no}")
        return {"success": True, "sid": message.sid}

    except Exception as e:
        print(f"❌ WhatsApp failed: {e}")
        return {"success": False, "error": str(e)}


# ─────────────────────────────────────────────
#  SEND EMAIL (Resend API)
# ─────────────────────────────────────────────

def send_email(to_email: str, invoice: dict, template_no: int) -> dict:
    """
    Send a legal notice email via Resend API.
    to_email: buyer's email address
    """
    try:
        subject, html = _email_template(invoice, template_no)

        response = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": f"{FROM_NAME} <{FROM_EMAIL}>",
                "to": [to_email],
                "subject": subject,
                "html": html,
            },
            timeout=10,
        )

        data = response.json()
        if response.status_code in (200, 201):
            print(f"✅ Email sent | ID: {data.get('id')} | To: {to_email} | Template: {template_no}")
            return {"success": True, "id": data.get("id")}
        else:
            print(f"❌ Email failed: {data}")
            return {"success": False, "error": str(data)}

    except Exception as e:
        print(f"❌ Email exception: {e}")
        return {"success": False, "error": str(e)}


# ─────────────────────────────────────────────
#  DISPATCH NOTICE (combined — tries both)
# ─────────────────────────────────────────────

def dispatch_notice(invoice: dict, template_no: int, channels: list = None) -> dict:
    """
    Send notice on all requested channels.
    channels: list of 'email' | 'whatsapp' (default: ['email'])
    Returns dict of results per channel.
    """
    if channels is None:
        channels = ["email"]

    results = {}
    buyer_contact = invoice.get("buyer_contact", "")

    for channel in channels:
        if channel == "email":
            if "@" in buyer_contact:
                results["email"] = send_email(buyer_contact, invoice, template_no)
            else:
                results["email"] = {"success": False, "error": "No valid buyer email on file"}

        elif channel == "whatsapp":
            # buyer_contact may be a phone if it starts with + or digits
            if buyer_contact.startswith("+") or buyer_contact.lstrip().isdigit():
                results["whatsapp"] = send_whatsapp(buyer_contact, invoice, template_no)
            else:
                results["whatsapp"] = {"success": False, "error": "No valid phone number on file (buyer_contact is an email)"}

    return results
