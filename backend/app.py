# ============================================================
#  app.py  —  Digital-Vakeel Flask API Server
#  Run this with: python app.py
#  The React frontend (Person D) talks to this server.
# ============================================================
import requests
from flask import Flask, request, jsonify
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import json
import os
from invoice_engine import (
    Invoice, save_invoice, get_invoice,
    get_all_invoices, mark_paid, check_triggers, calculate
)
from datetime import datetime

app = Flask(__name__)
OCR_SERVICE_URL = os.environ.get("OCR_SERVICE_URL", "http://localhost:8000/extract")

# ─────────────────────────────────────────────────────────────
#  CORS  —  Allows React (localhost:3000) to call this server
#  Without this, the browser will block every request.
#
#  Install on YOUR machine first:
#    pip install flask-cors
#
#  Then uncomment these two lines:
#  from flask_cors import CORS
#  CORS(app)
#
#  OR use the manual CORS headers below (works without installing anything)
# ─────────────────────────────────────────────────────────────

def add_cors(response):
    """Add CORS headers to every response so React can talk to us."""
    response.headers["Access-Control-Allow-Origin"]  = "http://localhost:3000"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

@app.after_request
def after_request(response):
    return add_cors(response)

@app.before_request
def handle_preflight():
    """
    Browsers send an OPTIONS 'preflight' request before every real request.
    We must respond with 200 OK or the real request never gets sent.
    """
    if request.method == "OPTIONS":
        from flask import make_response
        resp = make_response()
        resp.headers["Access-Control-Allow-Origin"]  = "http://localhost:3000"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return resp, 200


# ─────────────────────────────────────────────────────────────
#  HELPER
# ─────────────────────────────────────────────────────────────

def success(data, status=200):
    """Standard success response wrapper."""
    return jsonify({"ok": True,  "data": data}), status

def error(message, status=400):
    """Standard error response wrapper."""
    return jsonify({"ok": False, "error": message}), status


def _clean_value(value):
    if value is None:
        return ""
    return str(value).strip()


def _extract_amount(value):
    cleaned = _clean_value(value)
    if not cleaned:
        return None
    digits = "".join(ch for ch in cleaned if ch.isdigit() or ch in ".,")
    if not digits:
        return None
    try:
        return float(digits.replace(",", ""))
    except ValueError:
        return None


def _normalize_date(value):
    raw = _clean_value(value)
    if not raw:
        return ""
    if ":" in raw:
        raw = raw.split(":", 1)[1].strip()

    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


def map_extracted_fields(fields):
    """Map extractor keys to Digital-Vakeel invoice schema."""
    return {
        "sellerName": _clean_value(fields.get("SELLER_NAME")),
        "buyerName": _clean_value(fields.get("BUYER_NAME")),
        "invoiceNo": _clean_value(fields.get("INVOICE_NUMBER")).replace("Invoice No:", "").strip(),
        "invoiceDate": _normalize_date(fields.get("INVOICE_DATE")),
        "amount": _extract_amount(fields.get("INVOICE_AMOUNT")),
        "udyamId": _clean_value(fields.get("UDYAM_ID")),
        "buyerGstin": _clean_value(fields.get("BUYER_GSTIN")),
        "buyerContact": _clean_value(fields.get("BUYER_EMAIL")),
    }


# ─────────────────────────────────────────────────────────────
#  ROUTE 1 — Health Check
#  GET /
#  Person D calls this to confirm the server is running.
#  Test in browser: http://localhost:5000/
# ─────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def health():
    return success({
        "service":   "Digital-Vakeel API",
        "status":    "running",
        "timestamp": datetime.now().isoformat(),
        "version":   "1.0.0",
    })


# ─────────────────────────────────────────────────────────────
#  ROUTE 2 — Create Invoice
#  POST /invoices
#  Called when person submits the Upload screen form (Person D).
#
#  Request body (JSON):
#  {
#    "seller_name":   "Arjun Textiles",
#    "buyer_name":    "Mega-Retail Corp",
#    "invoice_no":    "INV-2025-101",
#    "invoice_date":  "2025-02-01",
#    "amount":        500000,
#    "udyam_id":      "UDYAM-TN-07-0012345",   (optional)
#    "buyer_gstin":   "27AABCU9603R1ZM",        (optional)
#    "buyer_contact": "finance@megaretail.com"  (optional)
#  }
#
#  Response: full invoice object with calculated fields
# ─────────────────────────────────────────────────────────────
@app.route("/invoices", methods=["POST"])
def create_invoice():
    body = request.get_json()
    print("📥 Incoming invoice data:", body)

    if not body:
        return error("Request body must be JSON")

    # Map camelCase → snake_case
    data = {
        "seller_name": body.get("sellerName") or body.get("seller_name"),
        "buyer_name": body.get("buyerName") or body.get("buyer_name"),
        "invoice_no": body.get("invoiceNo") or body.get("invoice_no"),
        "invoice_date": body.get("invoiceDate") or body.get("invoice_date"),
        "amount": body.get("amount"),
        "udyam_id": body.get("udyamId") or body.get("udyam_id", ""),
        "buyer_contact": body.get("buyerContact") or body.get("buyer_contact", ""),
        "buyer_gstin": body.get("buyerGstin") or body.get("buyer_gstin", ""),
    }

    # Validate required fields
    required = ["seller_name", "buyer_name", "invoice_no", "invoice_date", "amount"]
    missing = [f for f in required if not data.get(f)]

    if missing:
        return error(f"Missing required fields: {', '.join(missing)}")

    # Validate amount
    try:
        amount = float(data["amount"])
        if amount <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return error("Amount must be a positive number")

    # Validate date format
    try:
        datetime.strptime(data["invoice_date"], "%Y-%m-%d")
    except Exception:
        return error("invoice_date must be in YYYY-MM-DD format")

    invoice = Invoice(
        seller_name   = data["seller_name"].strip(),
        buyer_name    = data["buyer_name"].strip(),
        invoice_no    = data["invoice_no"].strip(),
        invoice_date  = data["invoice_date"],
        amount        = amount,
        udyam_id      = data["udyam_id"].strip(),
        buyer_contact = data["buyer_contact"].strip(),
        buyer_gstin   = data["buyer_gstin"].strip(),
    )

    saved = save_invoice(invoice)
    return success(saved.to_dict(), status=201)


# ─────────────────────────────────────────────────────────────
#  ROUTE 3 — Get All Invoices
#  GET /invoices
#  Called by Person D's Dashboard to load the invoice list.
#  All values are recalculated live (interest, status, days).
# ─────────────────────────────────────────────────────────────

@app.route("/invoices", methods=["GET"])
def list_invoices():
    invoices = get_all_invoices()
    return success([inv.to_dict() for inv in invoices])


# ─────────────────────────────────────────────────────────────
#  ROUTE 4 — Get Single Invoice
#  GET /invoices/<invoice_id>
#  Called by Dashboard to load one invoice's full detail.
#
#  Example: GET /invoices/A3B7C2D1
# ─────────────────────────────────────────────────────────────

@app.route("/invoices/<invoice_id>", methods=["GET"])
def get_one(invoice_id):
    invoice = get_invoice(invoice_id.upper())
    if not invoice:
        return error(f"Invoice '{invoice_id}' not found", status=404)
    return success(invoice.to_dict())


# ─────────────────────────────────────────────────────────────
#  ROUTE 5 — Mark Invoice as Paid  ← THE MOST IMPORTANT ROUTE
#  POST /invoices/<invoice_id>/pay
#  Called when the seller presses "Mark as Paid" in Person D's UI.
#  Freezes interest, stops all further notices (tells Person C to stop).
#
#  Request body (JSON):
#  {
#    "paid_amount": 505342   ← the actual amount the buyer sent
#  }
# ─────────────────────────────────────────────────────────────
@app.route("/invoices/<invoice_id>/pay", methods=["POST"])
def pay_invoice(invoice_id):
    # Parse JSON safely
    body = request.get_json(silent=True) or {}

    # IMPORTANT: invoice_id is the INTERNAL id (e.g. E56B8CF1)
    invoice_key = invoice_id.upper()
    invoice = get_invoice(invoice_key)

    if not invoice:
        return error(f"Invoice '{invoice_id}' not found", status=404)

    if invoice.paid:
        return error("This invoice is already marked as paid", status=400)

    # Determine paid amount
    try:
        paid_amount = body.get("paid_amount")
        if paid_amount is None:
            paid_amount = invoice.total_due
        else:
            paid_amount = float(paid_amount)

        if paid_amount <= 0:
            raise ValueError
    except Exception:
        return error("Invalid paid_amount", status=400)

    # Mark invoice as paid
    updated = mark_paid(invoice_key, paid_amount)

    return success(
        {
            **updated.to_dict(),
            "message": f"Payment of ₹{paid_amount:,.2f} confirmed. All notices stopped."
        },
        status=200
    )

# ─────────────────────────────────────────────────────────────
#  ROUTE 6 — Get Triggers for an Invoice
#  GET /invoices/<invoice_id>/triggers
#  Person C calls this to know which messages to send today.
#  If triggers list is non-empty, C fires the corresponding templates.
# ─────────────────────────────────────────────────────────────

@app.route("/invoices/<invoice_id>/triggers", methods=["GET"])
def get_triggers(invoice_id):
    invoice = get_invoice(invoice_id.upper())
    if not invoice:
        return error(f"Invoice '{invoice_id}' not found", status=404)

    triggers = check_triggers(invoice)
    return success({
        "invoice_id":    invoice.id,
        "days_overdue":  invoice.days_overdue,
        "status":        invoice.status,
        "triggers":      triggers,
        "has_triggers":  len(triggers) > 0,
    })


# ─────────────────────────────────────────────────────────────
#  ROUTE 7 — Get All Pending Triggers (for Person C's scheduler)
#  GET /triggers/today
#  Person C calls this ONCE per day to get all invoices
#  that need a message sent today.
# ─────────────────────────────────────────────────────────────

@app.route("/triggers/today", methods=["GET"])
def todays_triggers():
    all_invoices    = get_all_invoices()
    pending         = []

    for inv in all_invoices:
        triggers = check_triggers(inv)
        if triggers:
            pending.append({
                "invoice":  inv.to_dict(),
                "triggers": triggers,
            })

    return success({
        "date":          datetime.now().date().isoformat(),
        "total_checked": len(all_invoices),
        "total_pending": len(pending),
        "items":         pending,
    })


# ─────────────────────────────────────────────────────────────
#  ROUTE 8 — Log a Sent Notification
#  POST /invoices/<invoice_id>/notices
#  After Person C sends a WhatsApp/email, it calls this to
#  record it on the invoice. Person D shows these in the UI.
#
#  Request body:
#  {
#    "template_no": 1,
#    "channel":     "whatsapp",
#    "sent_to":     "finance@megaretail.com",
#    "sent_at":     "2025-03-18T10:30:00"
#  }
# ─────────────────────────────────────────────────────────────

@app.route("/invoices/<invoice_id>/notices", methods=["POST"])
def log_notice(invoice_id):
    body    = request.get_json() or {}
    invoice = get_invoice(invoice_id.upper())

    if not invoice:
        return error(f"Invoice '{invoice_id}' not found", status=404)

    notice = {
        "template_no": body.get("template_no"),
        "channel":     body.get("channel"),
        "sent_to":     body.get("sent_to"),
        "sent_at":     body.get("sent_at", datetime.now().isoformat()),
    }

    # Load raw DB record and append notice
    from invoice_engine import _load_db, _save_db
    db = _load_db()
    if invoice_id.upper() in db:
        db[invoice_id.upper()]["notices_sent"].append(notice)
        _save_db(db)

    return success({"logged": True, "notice": notice})


# ─────────────────────────────────────────────────────────────
#  ROUTE 9 — Dashboard Summary Stats
#  GET /summary
#  Called by Person D's Dashboard header to show aggregate numbers.
# ─────────────────────────────────────────────────────────────

@app.route("/summary", methods=["GET"])
def summary():
    invoices = get_all_invoices()

    total_principal = sum(i.amount         for i in invoices)
    total_interest  = sum(i.interest_accrued for i in invoices)
    total_due       = sum(i.total_due       for i in invoices if not i.paid)
    overdue_count   = sum(1 for i in invoices if i.days_overdue > 0 and not i.paid)
    paid_count      = sum(1 for i in invoices if i.paid)

    return success({
        "total_invoices":    len(invoices),
        "overdue_count":     overdue_count,
        "paid_count":        paid_count,
        "total_principal":   round(total_principal, 2),
        "total_interest":    round(total_interest, 2),
        "total_outstanding": round(total_due, 2),
    })

# ─────────────────────────────────────────────────────────────
#  ROUTE 10 — OCR Extract Invoice from PDF
#  POST /ocr/extract
#  Receives PDF, calls Person C's OCR API, returns extracted data
# ─────────────────────────────────────────────────────────────

@app.route("/ocr/extract", methods=["POST"])
def ocr_extract():
    if "file" not in request.files:
        return error("No file uploaded", status=400)
    
    file = request.files["file"]
    if file.filename == "":
        return error("Empty filename", status=400)
    
    # Forward PDF to Person C's OCR API
    try:
        files = {"file": (file.filename, file.stream, file.content_type)}
        ocr_response = requests.post("http://localhost:8000/extract", files=files)
        ocr_data = ocr_response.json()
        print("DEBUG - OCR raw response:", ocr_data)
        
        # Get the fields dict from OCR response
        fields = ocr_data.get("fields", {})

        # Extract and clean values (OCR includes labels, we need just values)
        def clean_value(text):
            """Remove label prefixes like 'Invoice No: ' from values"""
            if not text:
                return ""
            # Split by colon and take the last part
            if ":" in text:
                return text.split(":", 1)[1].strip()
            return text.strip()

        # Extract amount number from text like "Rs. 1,72,515.00"
        def extract_amount(text):
            if not text:
                return 0
            # Remove everything except digits and decimal point
            import re
            numbers = re.findall(r'[\d,]+\.?\d*', text)
            if numbers:
                return float(numbers[0].replace(',', ''))
            return 0
        def convert_date(text):
            """Convert DD-MM-YYYY to YYYY-MM-DD"""
            cleaned = clean_value(text)
            if not cleaned:
                return ""
            try:
                # Parse DD-MM-YYYY
                from datetime import datetime
                date_obj = datetime.strptime(cleaned, "%d-%m-%Y")
                # Return as YYYY-MM-DD
                return date_obj.strftime("%Y-%m-%d")
            except:
                return cleaned  # Return as-is if parsing fails
        # Map OCR fields to our invoice format
        mapped = {
            "seller_name":   clean_value(fields.get("SELLER_NAME", "")),
            "buyer_name":    clean_value(fields.get("BUYER_NAME", "")),
            "invoice_no":    clean_value(fields.get("INVOICE_NUMBER", "")),
            "invoice_date":  convert_date(fields.get("INVOICE_DATE", "")),
            "amount":        extract_amount(fields.get("INVOICE_AMOUNT", "")),
            "udyam_id":      clean_value(fields.get("UDYAM_ID", "")),
            "buyer_gstin":   clean_value(fields.get("BUYER_GSTIN", "")),
            "buyer_contact": clean_value(fields.get("BUYER_EMAIL", "")),
        }
        
        return success(mapped)
        
    except Exception as e:
        return error(f"OCR extraction failed: {str(e)}", status=500)

# ─────────────────────────────────────────────────────────────
#  START SERVER
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n" + "=" * 50)
    print("  Digital-Vakeel API Server")
    print("  Running at: http://localhost:5000")
    print("  React app should be at: http://localhost:3000")
    print("=" * 50)
    print("\n  Available routes:")
    print("  GET  /                              → health check")
    print("  POST /invoices                      → create invoice")
    print("  GET  /invoices                      → list all invoices")
    print("  GET  /invoices/<id>                 → get one invoice")
    print("  POST /invoices/<id>/pay             → mark as paid")
    print("  GET  /invoices/<id>/triggers        → check today's triggers")
    print("  GET  /triggers/today                → all pending triggers")
    print("  POST /invoices/<id>/notices         → log a sent notice")
    print("  GET  /summary                       → dashboard stats")
    print("\n  Press CTRL+C to stop.\n")
    print("  POST /ocr/extract                   → extract invoice from PDF")
    app.run(debug=True, port=5000)
