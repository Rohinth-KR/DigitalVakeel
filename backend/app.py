# ============================================================
#  app.py  —  Digital-Vakeel Flask API Server
#  Features: JWT Auth, Per-User Data, RAG Chat with History
#  Run this with: python app.py
# ============================================================

import requests
from flask import Flask, request, jsonify
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity
)
import bcrypt
import json
import os
import re
from datetime import datetime, timedelta
from invoice_engine import Invoice, calculate

app = Flask(__name__)

# ─────────────────────────────────────────────
#  JWT CONFIG
# ─────────────────────────────────────────────
app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET", "digital-vakeel-secret-key-2026")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=24)
jwt = JWTManager(app)

# ─────────────────────────────────────────────
#  DATABASE
# ─────────────────────────────────────────────
from database import (
    init_db, create_user, get_user_by_email, get_user_by_id,
    save_chat_message, get_chat_history, clear_chat_history,
    save_invoice_db, get_invoices_for_user, get_invoice_by_id, mark_invoice_paid_db,
    log_notice, get_notices,
)


# ─────────────────────────────────────────────
#  RAG ENGINE
# ─────────────────────────────────────────────
rag_engine = None

def init_rag():
    global rag_engine
    try:
        from rag_engine import RAGEngine
        rag_engine = RAGEngine()
        if rag_engine.is_ready():
            print("✅ RAG Legal Assistant is READY!")
        else:
            print("⚠️  RAG engine loaded but vector store not found.")
    except Exception as e:
        print(f"⚠️  RAG engine failed: {e}")

init_rag()

OCR_SERVICE_URL = os.environ.get("OCR_SERVICE_URL", "http://localhost:8000/extract")


# ─────────────────────────────────────────────
#  CORS
# ─────────────────────────────────────────────

@app.after_request
def after_request(response):
    response.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        from flask import make_response
        resp = make_response()
        resp.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return resp, 200


# ─────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────

def success(data, status=200):
    return jsonify({"ok": True, "data": data}), status

def error(message, status=400):
    return jsonify({"ok": False, "error": message}), status


# ═════════════════════════════════════════════
#  AUTH ROUTES
# ═════════════════════════════════════════════

@app.route("/auth/signup", methods=["POST"])
def signup():
    body = request.get_json()
    if not body:
        return error("Request body required")

    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    # Validate
    if not name or len(name) < 2:
        return error("Name must be at least 2 characters")
    if not email or "@" not in email:
        return error("Valid email is required")
    if len(password) < 6:
        return error("Password must be at least 6 characters")

    # Hash password
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    # Create user
    user = create_user(name, email, password_hash)
    if not user:
        return error("Email already registered. Please login.", status=409)

    # Generate JWT
    token = create_access_token(identity=str(user["id"]))

    return success({
        "token": token,
        "user": {"id": user["id"], "name": user["name"], "email": user["email"]},
    }, status=201)


@app.route("/auth/login", methods=["POST"])
def login():
    body = request.get_json()
    if not body:
        return error("Request body required")

    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    if not email or not password:
        return error("Email and password are required")

    # Find user
    user = get_user_by_email(email)
    if not user:
        return error("Invalid email or password", status=401)

    # Check password
    if not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        return error("Invalid email or password", status=401)

    # Generate JWT
    token = create_access_token(identity=str(user["id"]))

    return success({
        "token": token,
        "user": {"id": user["id"], "name": user["name"], "email": user["email"]},
    })


@app.route("/auth/me", methods=["GET"])
@jwt_required()
def get_me():
    """Get current user info from JWT token."""
    user_id = int(get_jwt_identity())
    user = get_user_by_id(user_id)
    if not user:
        return error("User not found", status=404)
    return success(user)


# ═════════════════════════════════════════════
#  HEALTH CHECK
# ═════════════════════════════════════════════

@app.route("/", methods=["GET"])
def health():
    return success({
        "service": "Digital-Vakeel API",
        "status": "running",
        "timestamp": datetime.now().isoformat(),
        "version": "2.0.0",
    })


# ═════════════════════════════════════════════
#  INVOICE ROUTES (protected, per-user)
# ═════════════════════════════════════════════

@app.route("/invoices", methods=["POST"])
@jwt_required()
def create_invoice():
    user_id = int(get_jwt_identity())
    body = request.get_json()

    if not body:
        return error("Request body must be JSON")

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

    required = ["seller_name", "buyer_name", "invoice_no", "invoice_date", "amount"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return error(f"Missing required fields: {', '.join(missing)}")

    try:
        amount = float(data["amount"])
        if amount <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return error("Amount must be a positive number")

    try:
        datetime.strptime(data["invoice_date"], "%Y-%m-%d")
    except Exception:
        return error("invoice_date must be in YYYY-MM-DD format")

    invoice = Invoice(
        seller_name=data["seller_name"].strip(),
        buyer_name=data["buyer_name"].strip(),
        invoice_no=data["invoice_no"].strip(),
        invoice_date=data["invoice_date"],
        amount=amount,
        udyam_id=data.get("udyam_id", "").strip(),
        buyer_contact=data.get("buyer_contact", "").strip(),
        buyer_gstin=data.get("buyer_gstin", "").strip(),
    )

    # Save to SQLite (per-user)
    invoice_dict = invoice.to_dict()
    save_invoice_db(user_id, invoice_dict)

    return success(invoice_dict, status=201)


@app.route("/invoices", methods=["GET"])
@jwt_required()
def list_invoices():
    user_id = int(get_jwt_identity())
    invoices = get_invoices_for_user(user_id)
    # Recalculate live values
    results = []
    for inv_data in invoices:
        try:
            inv = Invoice(
                seller_name=inv_data["seller_name"],
                buyer_name=inv_data["buyer_name"],
                invoice_no=inv_data["invoice_no"],
                invoice_date=inv_data["invoice_date"],
                amount=inv_data["amount"],
                udyam_id=inv_data.get("udyam_id", ""),
                buyer_contact=inv_data.get("buyer_contact", ""),
                buyer_gstin=inv_data.get("buyer_gstin", ""),
            )
            inv.id = inv_data["id"]
            if inv_data["paid"]:
                inv.paid = True
                inv.paid_date = inv_data.get("paid_date")
            results.append(inv.to_dict())
        except Exception:
            results.append(inv_data)
    return success(results)


@app.route("/invoices/<invoice_id>", methods=["GET"])
@jwt_required()
def get_one(invoice_id):
    user_id = int(get_jwt_identity())
    inv = get_invoice_by_id(invoice_id.upper(), user_id)
    if not inv:
        return error(f"Invoice '{invoice_id}' not found", status=404)
    return success(inv)


@app.route("/invoices/<invoice_id>/pay", methods=["POST"])
@jwt_required()
def pay_invoice(invoice_id):
    user_id = int(get_jwt_identity())
    inv = get_invoice_by_id(invoice_id.upper(), user_id)
    if not inv:
        return error(f"Invoice '{invoice_id}' not found", status=404)
    if inv["paid"]:
        return error("Already marked as paid", status=400)

    mark_invoice_paid_db(invoice_id.upper(), user_id, datetime.now().isoformat())
    return success({"message": "Payment confirmed. All notices stopped."})


# ─────────────────────────────────────────────
#  SEND NOTICE (manual trigger)
# ─────────────────────────────────────────────

@app.route("/invoices/<invoice_id>/send-notice", methods=["POST"])
@jwt_required()
def send_notice(invoice_id):
    """Manually send a legal notice for an invoice (email and/or whatsapp)."""
    from notifier import dispatch_notice

    user_id = int(get_jwt_identity())
    body    = request.get_json() or {}

    inv = get_invoice_by_id(invoice_id.upper(), user_id)
    if not inv:
        return error(f"Invoice '{invoice_id}' not found", status=404)
    if inv.get("paid"):
        return error("Cannot send notice for a paid invoice", status=400)

    # Determine template based on overdue days, or allow override
    template_no = body.get("template_no")
    channels    = body.get("channels", ["email"])  # default: email only

    if not template_no:
        # Auto-pick template from days overdue
        try:
            from invoice_engine import Invoice
            i_obj = Invoice(
                seller_name=inv["seller_name"], buyer_name=inv["buyer_name"],
                invoice_no=inv["invoice_no"],   invoice_date=inv["invoice_date"],
                amount=inv["amount"],
            )
            days_overdue = i_obj.days_overdue
        except Exception:
            days_overdue = 0

        if days_overdue >= 22:
            template_no = 3
        elif days_overdue >= 15:
            template_no = 2
        else:
            template_no = 1

    # Build a rich invoice dict with calculated values for templates
    try:
        from invoice_engine import Invoice, calculate
        i_obj = Invoice(
            seller_name=inv["seller_name"],  buyer_name=inv["buyer_name"],
            invoice_no=inv["invoice_no"],    invoice_date=inv["invoice_date"],
            amount=float(inv["amount"]),
            udyam_id=inv.get("udyam_id",""), buyer_contact=inv.get("buyer_contact",""),
            buyer_gstin=inv.get("buyer_gstin",""),
        )
        i_obj.id = inv["id"]
        calc_invoice = calculate(i_obj)
        invoice_dict = calc_invoice.to_dict()
    except Exception:
        invoice_dict = inv

    # Dispatch
    results = dispatch_notice(invoice_dict, template_no, channels)

    # Log each channel result to DB
    sent_to = invoice_dict.get("buyer_contact", "unknown")
    for channel, result in results.items():
        status_str = "sent" if result.get("success") else "failed"
        error_msg  = result.get("error") if not result.get("success") else None
        log_notice(
            invoice_id=inv["id"],
            user_id=user_id,
            notice_type=channel,
            template_no=template_no,
            sent_to=sent_to,
            status=status_str,
            error_msg=error_msg,
        )

    print(f"📬 Notice [{user_id}] Invoice {invoice_id} | Template {template_no} | {results}")
    return success({
        "template_no": template_no,
        "channels":    channels,
        "results":     results,
    })


# ─────────────────────────────────────────────
#  GET NOTICES for an invoice
# ─────────────────────────────────────────────

@app.route("/invoices/<invoice_id>/notices", methods=["GET"])
@jwt_required()
def invoice_notices(invoice_id):
    """Get all notices sent for a specific invoice."""
    user_id  = int(get_jwt_identity())
    inv = get_invoice_by_id(invoice_id.upper(), user_id)
    if not inv:
        return error(f"Invoice '{invoice_id}' not found", status=404)

    notices = get_notices(invoice_id.upper(), user_id)
    return success({"notices": notices})


# ─────────────────────────────────────────────
#  EXPORT CASE PDF
# ─────────────────────────────────────────────

@app.route("/invoices/<invoice_id>/export-pdf", methods=["GET"])
@jwt_required()
def export_pdf(invoice_id):
    """Generate and stream the legal case PDF bundle."""
    from flask import Response
    from pdf_generator import generate_case_pdf

    user_id = int(get_jwt_identity())
    inv = get_invoice_by_id(invoice_id.upper(), user_id)
    if not inv:
        return error(f"Invoice '{invoice_id}' not found", status=404)

    # Enrich with calculated values
    try:
        from invoice_engine import Invoice, calculate
        i_obj = Invoice(
            seller_name=inv["seller_name"],  buyer_name=inv["buyer_name"],
            invoice_no=inv["invoice_no"],    invoice_date=inv["invoice_date"],
            amount=float(inv["amount"]),
            udyam_id=inv.get("udyam_id",""), buyer_contact=inv.get("buyer_contact",""),
            buyer_gstin=inv.get("buyer_gstin",""),
        )
        i_obj.id = inv["id"]
        if inv.get("paid"):
            i_obj.paid = True
        calc_invoice = calculate(i_obj)
        invoice_dict = calc_invoice.to_dict()
    except Exception:
        invoice_dict = inv

    notices = get_notices(invoice_id.upper(), user_id)
    pdf_bytes = generate_case_pdf(invoice_dict, notices)

    filename = f"DigitalVakeel_Case_{invoice_id.upper()}.pdf"
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Length": str(len(pdf_bytes)),
        },
    )




# ═════════════════════════════════════════════
#  CHAT ROUTES (protected, with history)
# ═════════════════════════════════════════════

@app.route("/chat", methods=["POST"])
@jwt_required()
def chat():
    user_id = int(get_jwt_identity())
    body = request.get_json()

    if not body or not body.get("question"):
        return error("Please provide a 'question' field", status=400)

    question = body["question"].strip()
    if len(question) < 3:
        return error("Question is too short", status=400)
    if len(question) > 1000:
        return error("Question is too long (max 1000 chars)", status=400)

    if not rag_engine or not rag_engine.is_ready():
        return error("Legal assistant is not available.", status=503)

    print(f"💬 Chat [{user_id}]: {question}")
    result = rag_engine.ask(question)

    # Save to chat history
    if result.get("success"):
        save_chat_message(user_id, question, result["answer"], result.get("sources", []))

    return success(result)


@app.route("/chat/history", methods=["GET"])
@jwt_required()
def chat_history_route():
    user_id = int(get_jwt_identity())
    history = get_chat_history(user_id, limit=50)
    return success({"history": history})


@app.route("/chat/history", methods=["DELETE"])
@jwt_required()
def clear_history_route():
    user_id = int(get_jwt_identity())
    clear_chat_history(user_id)
    return success({"message": "Chat history cleared"})


@app.route("/chat/suggestions", methods=["GET"])
def chat_suggestions():
    from rag_engine import SUGGESTED_QUESTIONS
    return success({"suggestions": SUGGESTED_QUESTIONS})


# ═════════════════════════════════════════════
#  OCR EXTRACT
# ═════════════════════════════════════════════

@app.route("/ocr/extract", methods=["POST"])
@jwt_required()
def ocr_extract():
    if "file" not in request.files:
        return error("No file uploaded", status=400)

    file = request.files["file"]
    if file.filename == "":
        return error("Empty filename", status=400)

    try:
        files = {"file": (file.filename, file.stream, file.content_type)}
        ocr_response = requests.post(OCR_SERVICE_URL, files=files)
        ocr_data = ocr_response.json()
        fields = ocr_data.get("fields", {})

        def clean_value(text):
            if not text:
                return ""
            if ":" in text:
                return text.split(":", 1)[1].strip()
            return text.strip()

        def extract_amount(text):
            if not text:
                return 0
            numbers = re.findall(r'[\d,]+\.?\d*', text)
            if numbers:
                return float(numbers[0].replace(',', ''))
            return 0

        def convert_date(text):
            cleaned = clean_value(text)
            if not cleaned:
                return ""
            try:
                return datetime.strptime(cleaned, "%d-%m-%Y").strftime("%Y-%m-%d")
            except Exception:
                return cleaned

        mapped = {
            "seller_name": clean_value(fields.get("SELLER_NAME", "")),
            "buyer_name": clean_value(fields.get("BUYER_NAME", "")),
            "invoice_no": clean_value(fields.get("INVOICE_NUMBER", "")),
            "invoice_date": convert_date(fields.get("INVOICE_DATE", "")),
            "amount": extract_amount(fields.get("INVOICE_AMOUNT", "")),
            "udyam_id": clean_value(fields.get("UDYAM_ID", "")),
            "buyer_gstin": clean_value(fields.get("BUYER_GSTIN", "")),
            "buyer_contact": clean_value(fields.get("BUYER_EMAIL", "")),
        }

        return success(mapped)

    except Exception as e:
        return error(f"OCR extraction failed: {str(e)}", status=500)


# ═════════════════════════════════════════════
#  SUMMARY (protected)
# ═════════════════════════════════════════════

@app.route("/summary", methods=["GET"])
@jwt_required()
def summary():
    user_id = int(get_jwt_identity())
    invoices = get_invoices_for_user(user_id)
    total = len(invoices)
    overdue = sum(1 for i in invoices if not i["paid"])
    paid = sum(1 for i in invoices if i["paid"])
    total_amount = sum(i["amount"] for i in invoices)
    return success({
        "total_invoices": total,
        "overdue_count": overdue,
        "paid_count": paid,
        "total_principal": round(total_amount, 2),
    })


# ═════════════════════════════════════════════
#  START SERVER
# ═════════════════════════════════════════════

if __name__ == "__main__":
    print("\n" + "=" * 50)
    print("  Digital-Vakeel API Server v2.0")
    print("  Running at: http://localhost:5000")
    print("=" * 50)
    print("\n  Auth routes:")
    print("  POST /auth/signup                   → register")
    print("  POST /auth/login                    → login")
    print("  GET  /auth/me                       → current user")
    print("\n  Protected routes (JWT required):")
    print("  POST /invoices                      → create invoice")
    print("  GET  /invoices                      → list user invoices")
    print("  POST /chat                          → RAG legal assistant")
    print("  GET  /chat/history                  → chat history")
    print("  DELETE /chat/history                → clear history")
    print("  POST /ocr/extract                   → OCR extract")
    print("\n  Press CTRL+C to stop.\n")
    app.run(debug=True, port=5000)
