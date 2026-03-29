# ============================================================
#  database.py  —  Digital-Vakeel Supabase Database
#  Uses Supabase (PostgreSQL) for users, invoices, and chat.
#  NO SQLite — cloud database!
# ============================================================

import os
import json
from supabase import create_client, Client

# ─────────────────────────────────────────────
#  SUPABASE CONFIG
# ─────────────────────────────────────────────

SUPABASE_URL = os.environ.get(
    "SUPABASE_URL",
    "https://smngqeqtmywdrpzpdcyy.supabase.co"
)
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtbmdxZXF0bXl3ZHJwenBkY3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3ODExNjksImV4cCI6MjA5MDM1NzE2OX0.6y43tjNZk3HYonSmAh1SAw95dgWAzhPaGSgXm2Qsdaw"
)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def init_db():
    """Tables are already created via Supabase migrations. Just confirm connection."""
    try:
        supabase.table("users").select("id").limit(1).execute()
        print("✅ Supabase database connected")
    except Exception as e:
        print(f"⚠️  Supabase connection issue: {e}")


# ─────────────────────────────────────────────
#  USER FUNCTIONS
# ─────────────────────────────────────────────

def create_user(name, email, password_hash):
    """Create a new user. Returns user dict or None if email exists."""
    try:
        result = supabase.table("users").insert({
            "name": name,
            "email": email,
            "password_hash": password_hash,
        }).execute()

        if result.data:
            user = result.data[0]
            return {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "created_at": user["created_at"],
            }
        return None
    except Exception as e:
        # Unique constraint violation = email already exists
        if "duplicate" in str(e).lower() or "23505" in str(e):
            return None
        raise


def get_user_by_email(email):
    """Get user by email. Returns dict or None."""
    result = supabase.table("users").select("*").eq("email", email).execute()
    if result.data:
        return result.data[0]
    return None


def get_user_by_id(user_id):
    """Get user by ID. Returns dict or None."""
    result = supabase.table("users").select(
        "id, name, email, created_at"
    ).eq("id", user_id).execute()
    if result.data:
        return result.data[0]
    return None


# ─────────────────────────────────────────────
#  CHAT HISTORY FUNCTIONS
# ─────────────────────────────────────────────

def save_chat_message(user_id, question, answer, sources=None):
    """Save a chat Q&A pair for a user."""
    supabase.table("chat_history").insert({
        "user_id": user_id,
        "question": question,
        "answer": answer,
        "sources": sources or [],
    }).execute()


def get_chat_history(user_id, limit=50):
    """Get chat history for a user, oldest first."""
    result = supabase.table("chat_history").select(
        "question, answer, sources, created_at"
    ).eq("user_id", user_id).order(
        "created_at", desc=False
    ).limit(limit).execute()

    return result.data or []


def clear_chat_history(user_id):
    """Delete all chat history for a user."""
    supabase.table("chat_history").delete().eq("user_id", user_id).execute()


# ─────────────────────────────────────────────
#  INVOICE FUNCTIONS (per-user)
# ─────────────────────────────────────────────

def save_invoice_db(user_id, invoice_data):
    """Save an invoice for a user."""
    supabase.table("invoices").upsert({
        "id": invoice_data.get("id", ""),
        "user_id": user_id,
        "invoice_no": invoice_data.get("invoice_no", ""),
        "invoice_date": invoice_data.get("invoice_date", ""),
        "seller_name": invoice_data.get("seller_name", ""),
        "buyer_name": invoice_data.get("buyer_name", ""),
        "amount": invoice_data.get("amount", 0),
        "paid": invoice_data.get("paid", False),
        "paid_date": invoice_data.get("paid_date"),
        "buyer_gstin": invoice_data.get("buyer_gstin", ""),
        "buyer_contact": invoice_data.get("buyer_contact", ""),
        "udyam_id": invoice_data.get("udyam_id", ""),
        "notices": invoice_data.get("notices", []),
    }).execute()


def get_invoices_for_user(user_id):
    """Get all invoices for a user."""
    result = supabase.table("invoices").select("*").eq(
        "user_id", user_id
    ).order("created_at", desc=True).execute()

    return result.data or []


def get_invoice_by_id(invoice_id, user_id):
    """Get a single invoice (must belong to the user)."""
    result = supabase.table("invoices").select("*").eq(
        "id", invoice_id
    ).eq("user_id", user_id).execute()

    if result.data:
        return result.data[0]
    return None


def mark_invoice_paid_db(invoice_id, user_id, paid_date):
    """Mark an invoice as paid."""
    supabase.table("invoices").update({
        "paid": True,
        "paid_date": paid_date,
    }).eq("id", invoice_id).eq("user_id", user_id).execute()


# ─────────────────────────────────────────────
#  NOTICE LOG FUNCTIONS
# ─────────────────────────────────────────────

def log_notice(invoice_id, user_id, notice_type, template_no, sent_to, status="sent", error_msg=None):
    """Log a sent notice to the notices table."""
    supabase.table("notices").insert({
        "invoice_id":  invoice_id,
        "user_id":     user_id,
        "type":        notice_type,   # 'email' | 'whatsapp'
        "template_no": template_no,
        "sent_to":     sent_to,
        "status":      status,
        "error_msg":   error_msg,
    }).execute()


def get_notices(invoice_id, user_id):
    """Get all notices sent for an invoice."""
    result = supabase.table("notices").select("*").eq(
        "invoice_id", invoice_id
    ).eq("user_id", user_id).order("sent_at", desc=False).execute()
    return result.data or []


# Initialize on import
init_db()

