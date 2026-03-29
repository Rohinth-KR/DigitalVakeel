# ============================================================
#  pdf_generator.py  —  Digital-Vakeel Case File PDF
#  Generates a professional legal case bundle using ReportLab
#  Includes: Cover, Invoice Details, Interest Calc, Notice Log, Legal Basis
# ============================================================

import io
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# ─────────────────────────────────────────────
#  COLOUR PALETTE  (matches frontend brand)
# ─────────────────────────────────────────────
BRAND      = colors.HexColor("#00C9B8")
DARK_BG    = colors.HexColor("#0C1A2E")
INK        = colors.HexColor("#1A2744")
MUTED      = colors.HexColor("#64748B")
BORDER     = colors.HexColor("#E2E8F0")
RED        = colors.HexColor("#EF4444")
AMBER      = colors.HexColor("#F59E0B")
GREEN      = colors.HexColor("#10B981")
LIGHT_BG   = colors.HexColor("#F7F9FC")
BRAND_LIGHT= colors.HexColor("#E6FAF9")

DAILY_RATE = 0.195 / 365   # 19.5% p.a.


def _calc_interest(amount: float, invoice_date: str, paid: bool) -> dict:
    if paid:
        return {"days_overdue": 0, "interest": 0.0, "total": amount}
    try:
        inv_dt  = datetime.strptime(invoice_date, "%Y-%m-%d")
        due_dt  = inv_dt.replace(day=inv_dt.day) 
        from datetime import date, timedelta
        due     = inv_dt.date() + timedelta(days=45)
        today   = date.today()
        days_ov = max(0, (today - due).days)
        interest= round(amount * DAILY_RATE * days_ov, 2)
        return {"days_overdue": days_ov, "interest": interest, "total": round(amount + interest, 2)}
    except Exception:
        return {"days_overdue": 0, "interest": 0.0, "total": amount}


def _fmt_inr(amount: float) -> str:
    """Format as Indian Rupees with comma separators.
    Uses 'Rs.' instead of the Unicode rupee glyph (not supported by built-in PDF fonts).
    """
    return f"Rs. {amount:,.2f}"


def generate_case_pdf(invoice: dict, notices: list) -> bytes:
    """
    Generate a full legal case PDF bundle.
    Returns raw PDF bytes for streaming.
    """
    buf     = io.BytesIO()
    W, H    = A4
    margin  = 2 * cm

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=margin, bottomMargin=margin,
        title=f"Legal Case File — {invoice.get('invoice_no', 'N/A')}",
        author="Digital-Vakeel Legal Enforcement System",
    )

    styles  = getSampleStyleSheet()

    # ── Custom paragraph styles ──
    def sty(name, parent="Normal", **kw):
        return ParagraphStyle(name, parent=styles[parent], **kw)

    S = {
        "cover_title": sty("ct", fontSize=28, textColor=BRAND, fontName="Helvetica-Bold",
                           spaceAfter=6, leading=34),
        "cover_sub":   sty("cs", fontSize=13, textColor=colors.white, fontName="Helvetica",
                           spaceAfter=4),
        "section_head":sty("sh", fontSize=13, textColor=INK, fontName="Helvetica-Bold",
                           spaceBefore=18, spaceAfter=8, leading=18),
        "label":       sty("lbl", fontSize=9, textColor=MUTED, fontName="Helvetica-Bold",
                           spaceAfter=2),
        "value":       sty("val", fontSize=11, textColor=INK, fontName="Helvetica",
                           spaceAfter=6),
        "body":        sty("body", fontSize=10, textColor=INK, leading=16, spaceAfter=6),
        "small":       sty("small", fontSize=8, textColor=MUTED, leading=12),
        "badge_red":   sty("br", fontSize=10, textColor=RED,   fontName="Helvetica-Bold"),
        "badge_green": sty("bg", fontSize=10, textColor=GREEN, fontName="Helvetica-Bold"),
        "badge_amber": sty("ba", fontSize=10, textColor=AMBER, fontName="Helvetica-Bold"),
        "mono":        sty("mono", fontSize=9, fontName="Courier", textColor=INK,
                           leading=14, spaceAfter=2),
    }

    inv_no    = invoice.get("invoice_no", "N/A")
    seller    = invoice.get("seller_name", "N/A")
    buyer     = invoice.get("buyer_name", "N/A")
    udyam     = invoice.get("udyam_id", "N/A")
    gstin     = invoice.get("buyer_gstin", "N/A")
    contact   = invoice.get("buyer_contact", "N/A")
    inv_date  = invoice.get("invoice_date", "")
    amount    = float(invoice.get("amount", 0))
    paid      = bool(invoice.get("paid", False))
    calc      = _calc_interest(amount, inv_date, paid)

    try:
        from datetime import date, timedelta
        inv_dt  = datetime.strptime(inv_date, "%Y-%m-%d")
        due_str = (inv_dt.date() + timedelta(days=45)).strftime("%d %b %Y")
        inv_str = inv_dt.strftime("%d %b %Y")
    except Exception:
        due_str = inv_str = inv_date

    generated_on = datetime.now().strftime("%d %B %Y, %I:%M %p")
    status_text  = "PAID" if paid else ("OVERDUE" if calc["days_overdue"] > 0 else "ACTIVE")

    # ══════════════════════════════════════════
    #  STORY ELEMENTS
    # ══════════════════════════════════════════
    story = []

    # ── COVER BLOCK ──────────────────────────
    cover_data = [
        [Paragraph("DIGITAL-VAKEEL", sty("ch", fontSize=9, textColor=BRAND,
                                          fontName="Helvetica-Bold", spaceAfter=0))],
        [Paragraph("MSME PAYMENT ENFORCEMENT SYSTEM", sty("chs", fontSize=8,
                                                      textColor=colors.HexColor("#4B6FA5"),
                                                      spaceAfter=0))],
        [Spacer(1, 0.35 * cm)],
        [Paragraph("Legal Case File", sty("cti", fontSize=28, textColor=colors.white,
                                          fontName="Helvetica-Bold", spaceAfter=0, leading=34))],
        [Spacer(1, 0.2 * cm)],
        [Paragraph(f"Invoice {inv_no}", sty("csb", fontSize=15, textColor=BRAND,
                                            fontName="Helvetica-Bold", spaceAfter=0))],
        [Spacer(1, 0.15 * cm)],
        [Paragraph(f"{seller}  ->  {buyer}", sty("cpar", fontSize=11,
                                                 textColor=colors.HexColor("#94A3B8"),
                                                 spaceAfter=0))],
        [Spacer(1, 0.2 * cm)],
        [Paragraph(f"Generated: {generated_on}  |  Status: {status_text}",
                   sty("cgen", fontSize=8, textColor=colors.HexColor("#64748B")))],
    ]
    cover_tbl = Table(cover_data, colWidths=[W - 2 * margin])
    cover_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), DARK_BG),
        ("TOPPADDING",    (0, 0), (-1, 0),  28),   # top breathing room for first row
        ("TOPPADDING",    (0, 1), (-1, -1), 2),    # tight padding for inner rows
        ("BOTTOMPADDING", (0, -1), (-1, -1), 28),  # bottom breathing room
        ("BOTTOMPADDING", (0, 0), (-1, -2), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 32),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 24),
    ]))
    story.append(cover_tbl)
    story.append(Spacer(1, 0.4 * cm))

    # ── SECTION 1: PARTIES ───────────────────
    story.append(Paragraph("1. Parties to the Dispute", S["section_head"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER))
    story.append(Spacer(1, 0.2 * cm))

    parties = [
        ["CLAIMANT (MSME Seller)", "RESPONDENT (Buyer)"],
        [seller, buyer],
        [f"Udyam Registration: {udyam}", f"GSTIN: {gstin}"],
        ["", f"Contact: {contact}"],
    ]
    pt = Table(parties, colWidths=[(W - 2 * margin) / 2] * 2)
    pt.setStyle(TableStyle([
        ("FONTNAME",  (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",  (0, 0), (-1, 0), 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
        ("FONTNAME",  (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTSIZE",  (0, 1), (-1, 1), 12),
        ("TEXTCOLOR", (0, 1), (-1, 1), INK),
        ("FONTSIZE",  (0, 2), (-1, -1), 9),
        ("TEXTCOLOR", (0, 2), (-1, -1), MUTED),
        ("BACKGROUND",(0, 0), (-1, -1), LIGHT_BG),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT_BG]),
        ("TOPPADDING",  (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("LINEAFTER",   (0, 0), (0, -1), 1, BORDER),
        ("BOX",         (0, 0), (-1, -1), 1, BORDER),
    ]))
    story.append(pt)

    # ── SECTION 2: INVOICE DETAILS ───────────
    story.append(Paragraph("2. Invoice Details", S["section_head"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER))
    story.append(Spacer(1, 0.2 * cm))

    inv_rows = [
        ["Field", "Value"],
        ["Invoice Number", inv_no],
        ["Invoice Date", inv_str],
        ["Statutory Due Date (Day 45)", due_str],
        ["Principal Amount", _fmt_inr(amount)],
        ["Days Overdue", str(calc["days_overdue"]) + " days"],
        ["Interest Accrued (19.5% p.a.)", _fmt_inr(calc["interest"])],
        ["TOTAL AMOUNT DUE", _fmt_inr(calc["total"])],
    ]
    it = Table(inv_rows, colWidths=[5.5 * cm, (W - 2 * margin - 5.5 * cm)])
    it.setStyle(TableStyle([
        ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (-1, 0), 9),
        ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
        ("BACKGROUND",  (0, 0), (-1, 0), INK),
        ("FONTSIZE",    (0, 1), (-1, -2), 10),
        ("TEXTCOLOR",   (0, 1), (0, -1), MUTED),
        ("FONTNAME",    (0, 1), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE",    (0, 1), (0, -1), 9),
        # Last row (total) — highlighted
        ("BACKGROUND",  (0, -1), (-1, -1), BRAND_LIGHT),
        ("FONTNAME",    (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE",    (0, -1), (-1, -1), 11),
        ("TEXTCOLOR",   (1, -1), (1, -1), AMBER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, LIGHT_BG]),
        ("GRID",        (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING",  (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
    ]))
    story.append(it)

    # ── SECTION 3: STATUTORY INTEREST CALC ──
    story.append(Paragraph("3. Statutory Interest Calculation", S["section_head"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER))
    story.append(Spacer(1, 0.2 * cm))

    calc_lines = [
        f"RBI Bank Rate (current)            =  6.5% per annum",
        f"Multiplier (Section 16, MSMED Act) =  3×",
        f"Applicable Interest Rate           =  19.5% per annum",
        f"Daily Interest Rate                =  19.5% ÷ 365 = 0.05342% per day",
        f"",
        f"Principal Amount                   =  {_fmt_inr(amount)}",
        f"Days Overdue (beyond Day 45)        =  {calc['days_overdue']} days",
        f"",
        f"Interest = {_fmt_inr(amount)} × 0.0005342 × {calc['days_overdue']}",
        f"         = {_fmt_inr(calc['interest'])}",
        f"",
        f"TOTAL DUE = {_fmt_inr(amount)} + {_fmt_inr(calc['interest'])}",
        f"          = {_fmt_inr(calc['total'])}",
    ]
    calc_tbl = Table(
        [[Paragraph(line if line else "\u00a0", S["mono"])] for line in calc_lines],
        colWidths=[W - 2 * margin]
    )
    calc_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), LIGHT_BG),
        ("BOX",          (0, 0), (-1, -1), 1, BORDER),
        ("LEFTPADDING",  (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
    ]))
    story.append(calc_tbl)

    # ── SECTION 4: NOTICE LOG ────────────────
    story.append(Paragraph("4. Evidence of Notices Sent", S["section_head"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER))
    story.append(Spacer(1, 0.2 * cm))

    if notices:
        notice_rows = [["#", "Type", "Template", "Sent To", "Status", "Date & Time"]]
        for i, n in enumerate(notices, 1):
            sent_at = n.get("sent_at", "")
            try:
                dt = datetime.fromisoformat(sent_at.replace("Z", "+00:00"))
                sent_at = dt.strftime("%d %b %Y %I:%M %p")
            except Exception:
                pass
            notice_rows.append([
                str(i),
                n.get("type", "").upper(),
                f"Template {n.get('template_no', '?')}",
                n.get("sent_to", "—"),
                n.get("status", "sent").upper(),
                sent_at,
            ])
        nt = Table(notice_rows, colWidths=[0.6*cm, 2.2*cm, 2.2*cm, 5*cm, 1.8*cm, None])
        nt.setStyle(TableStyle([
            ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",    (0, 0), (-1, 0), 9),
            ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
            ("BACKGROUND",  (0, 0), (-1, 0), INK),
            ("FONTSIZE",    (0, 1), (-1, -1), 8),
            ("TEXTCOLOR",   (0, 1), (-1, -1), INK),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
            ("GRID",        (0, 0), (-1, -1), 0.5, BORDER),
            ("TOPPADDING",  (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(nt)
    else:
        story.append(Paragraph(
            "No automated notices have been dispatched yet for this invoice.",
            sty("none", fontSize=10, textColor=MUTED, fontName="Helvetica-Oblique")
        ))

    # ── SECTION 5: LEGAL BASIS ───────────────
    story.append(Paragraph("5. Legal Basis", S["section_head"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER))
    story.append(Spacer(1, 0.2 * cm))

    legal_rows = [
        ["Section", "Provision", "Applicability"],
        ["Section 15", "Maximum 45-day payment window for MSME suppliers",
         "Due date was " + due_str],
        ["Section 16", "Compound interest at 3× RBI bank rate from Day 46",
         f"Interest: {_fmt_inr(calc['interest'])}"],
        ["Section 18", "Right to file reference to MSME Facilitation Council",
         "Eligible after Day 45"],
        ["MSME Samadhaan", "Government online dispute portal for delayed payments",
         "samadhaan.msme.gov.in"],
    ]
    lt = Table(legal_rows, colWidths=[3*cm, 8*cm, None])
    lt.setStyle(TableStyle([
        ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (-1, 0), 9),
        ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
        ("BACKGROUND",  (0, 0), (-1, 0), DARK_BG),
        ("FONTSIZE",    (0, 1), (-1, -1), 9),
        ("TEXTCOLOR",   (0, 1), (0, -1), BRAND),
        ("FONTNAME",    (0, 1), (0, -1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ("GRID",        (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING",  (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("VALIGN",      (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(lt)

    # ── SECTION 6: DECLARATION ──────────────
    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width="100%", thickness=2, color=BRAND))
    story.append(Spacer(1, 0.3 * cm))
    decl = (
        f"<b>Declaration:</b> This document has been automatically generated by <b>Digital-Vakeel</b>, "
        f"an AI-powered MSME payment enforcement system, on <b>{generated_on}</b>. "
        f"All calculations are based on the MSMED Act 2006 (Section 15 &amp; 16) using the RBI bank rate of 6.5% p.a. "
        f"This case file may be submitted as supporting evidence to the MSME Facilitation Council "
        f"or the MSME Samadhaan portal."
    )
    story.append(Paragraph(decl, sty("decl", fontSize=9, textColor=MUTED, leading=14,
                                      borderPadding=10)))

    # ─────────────────────────────────────────
    doc.build(story)
    return buf.getvalue()
