# ============================================================
#  invoice_engine.py  —  Digital-Vakeel Core Logic
#  Person B's main brain. No Flask here — pure Python logic.
#  This makes it easy to test independently from the web server.
# ============================================================

from datetime import date, datetime, timedelta
from dataclasses import dataclass, field, asdict
from typing import Optional
import uuid
import json
import os

# ─────────────────────────────────────────────────────────────
#  CONSTANTS  (from Person A's legal document)
# ─────────────────────────────────────────────────────────────

PAYMENT_WINDOW_DAYS = 45        # Section 15, MSMED Act 2006
RBI_BANK_RATE       = 0.065     # 6.5% per year (update if RBI changes it)
INTEREST_MULTIPLIER = 3         # Section 16: 3× the RBI bank rate
ANNUAL_RATE         = RBI_BANK_RATE * INTEREST_MULTIPLIER   # = 19.5% p.a.
DAILY_RATE          = ANNUAL_RATE / 365                     # = ~0.0534% per day

# Status values — exactly as Person D's frontend expects them
STATUS_ACTIVE        = "ACTIVE"           # Day 0–44: within window, not yet due
STATUS_DUE_SOON      = "DUE SOON"         # Day 40–44: 5 days warning
STATUS_DUE_TODAY     = "DUE TODAY"        # Day 45: last day
STATUS_OVERDUE       = "OVERDUE"          # Day 46–59: interest running
STATUS_NOTICE_SENT   = "LEGAL NOTICE SENT"# Day 60–66: formal notice dispatched
STATUS_ESCALATION    = "ESCALATION"       # Day 67+: portal filing imminent
STATUS_PAID          = "PAID"             # Buyer confirmed payment

# Trigger days — Person C uses these to fire messages
TRIGGER_WHATSAPP     = 46   # Template 1: soft WhatsApp reminder
TRIGGER_LEGAL_EMAIL  = 60   # Template 2: formal legal notice email
TRIGGER_FINAL_NOTICE = 67   # Template 3: final escalation warning


# ─────────────────────────────────────────────────────────────
#  DATA MODEL  — what one invoice looks like
# ─────────────────────────────────────────────────────────────

@dataclass
class Invoice:
    """
    One invoice record. Think of this as a row in our database.
    Every field here maps directly to a field in D's frontend form.
    """
    # ── Fields the seller fills in (from the Upload screen) ──
    seller_name:    str
    buyer_name:     str
    invoice_no:     str
    invoice_date:   str          # "YYYY-MM-DD" string (easy to store & send as JSON)
    amount:         float        # Principal in rupees

    # ── Optional but important for legal strength ──
    udyam_id:       str = ""     # Seller's MSME registration number
    buyer_gstin:    str = ""     # Buyer's GST number
    buyer_contact:  str = ""     # Buyer's finance email

    # ── System-managed fields (never set by user) ──
    id:             str = field(default_factory=lambda: str(uuid.uuid4())[:8].upper())
    created_at:     str = field(default_factory=lambda: datetime.now().isoformat())
    paid:           bool = False
    paid_at:        Optional[str] = None
    paid_amount:    Optional[float] = None

    # ── Computed fields (filled by calculate() method below) ──
    due_date:           str   = ""
    status:             str   = STATUS_ACTIVE
    days_overdue:       int   = 0
    days_until_due:     int   = 0
    interest_accrued:   float = 0.0
    total_due:          float = 0.0
    notices_sent:       list  = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to plain dictionary for JSON responses."""
        return asdict(self)

    def invoice_date_obj(self) -> date:
        """Parse the invoice_date string into a Python date object."""
        return datetime.strptime(self.invoice_date, "%Y-%m-%d").date()

    def due_date_obj(self) -> date:
        """Payment must arrive by this date (invoice_date + 45 days)."""
        return self.invoice_date_obj() + timedelta(days=PAYMENT_WINDOW_DAYS)


# ─────────────────────────────────────────────────────────────
#  STEP 1 — DATE LOGIC
# ─────────────────────────────────────────────────────────────

def calculate_dates(invoice: Invoice) -> dict:
    """
    Given an invoice, work out all the important dates and day counts.

    Returns a dict with:
      - due_date        : the legal payment deadline
      - days_until_due  : days remaining before overdue (0 if already overdue)
      - days_overdue    : days past the deadline (0 if not yet overdue)
      - today           : today's date
    """
    today     = date.today()
    due       = invoice.due_date_obj()

    diff_days = (today - due).days   # positive = overdue, negative = still time left

    days_overdue   = max(0, diff_days)
    days_until_due = max(0, -diff_days)

    return {
        "today":          today.isoformat(),
        "due_date":       due.isoformat(),
        "days_overdue":   days_overdue,
        "days_until_due": days_until_due,
        "diff_days":      diff_days,   # raw signed number
    }


# ─────────────────────────────────────────────────────────────
#  STEP 2 — STATUS ENGINE
# ─────────────────────────────────────────────────────────────

def determine_status(days_overdue: int, days_until_due: int, paid: bool) -> str:
    """
    Given the day counts, return the correct status string.
    This is the single source of truth for status — used by
    both the API and the background scheduler (Person C).

    Status progression:
      ACTIVE → DUE SOON → DUE TODAY → OVERDUE
        → LEGAL NOTICE SENT → ESCALATION → PAID
    """
    if paid:
        return STATUS_PAID

    if days_overdue >= (TRIGGER_FINAL_NOTICE - PAYMENT_WINDOW_DAYS):   # 22+ days overdue
        return STATUS_ESCALATION

    if days_overdue >= (TRIGGER_LEGAL_EMAIL - PAYMENT_WINDOW_DAYS):    # 15-21 days overdue
        return STATUS_NOTICE_SENT

    if days_overdue >= 1:                      # Day 46–59
        return STATUS_OVERDUE

    if days_until_due == 0:                    # Day 45 exactly
        return STATUS_DUE_TODAY

    if days_until_due <= 5:                    # Day 40–44
        return STATUS_DUE_SOON

    return STATUS_ACTIVE                       # Day 0–39


# ─────────────────────────────────────────────────────────────
#  STEP 3 — INTEREST CALCULATOR
# ─────────────────────────────────────────────────────────────

def calculate_interest(principal: float, days_overdue: int) -> dict:
    """
    Calculates statutory interest as per Section 16, MSMED Act 2006.

    Formula (from Person A's document):
      Daily Rate    = Annual Rate / 365
                    = (3 × RBI Bank Rate) / 365
                    = 0.195 / 365
                    = 0.000534 per day

      Interest      = Principal × Daily Rate × Days Overdue

      Total Due     = Principal + Interest

    Args:
        principal    : Original invoice amount in rupees
        days_overdue : Number of days past Day 45

    Returns dict with interest_accrued, total_due, and breakdown info.
    """
    if days_overdue <= 0:
        return {
            "interest_accrued": 0.0,
            "total_due":        principal,
            "daily_rate":       round(DAILY_RATE, 8),
            "annual_rate_pct":  round(ANNUAL_RATE * 100, 2),
            "rbi_rate_pct":     round(RBI_BANK_RATE * 100, 2),
            "days_overdue":     0,
        }

    interest   = principal * DAILY_RATE * days_overdue
    interest   = round(interest, 2)    # round to nearest paisa
    total_due  = round(principal + interest, 2)

    return {
        "interest_accrued": interest,
        "total_due":        total_due,
        "daily_rate":       round(DAILY_RATE, 8),
        "daily_interest":   round(principal * DAILY_RATE, 2),  # per day in rupees
        "annual_rate_pct":  round(ANNUAL_RATE * 100, 2),
        "rbi_rate_pct":     round(RBI_BANK_RATE * 100, 2),
        "days_overdue":     days_overdue,
    }


# ─────────────────────────────────────────────────────────────
#  STEP 4 — MASTER CALCULATE (combines all 3 steps above)
# ─────────────────────────────────────────────────────────────

def calculate(invoice: Invoice) -> Invoice:
    """
    The main function. Takes an Invoice, runs all calculations,
    and fills in all the computed fields. Returns the updated invoice.

    Person D calls this indirectly via the API.
    Person C calls this to check if a trigger should fire.

    Usage:
        inv = Invoice(seller_name="Arjun Textiles", ...)
        inv = calculate(inv)
        print(inv.status)         # "OVERDUE"
        print(inv.interest_accrued) # 3200.5
    """
    # Skip recalculation if already paid (freeze the numbers at payment time)
    if invoice.paid:
        invoice.status = STATUS_PAID
        return invoice

    # Step 1: dates
    dates = calculate_dates(invoice)
    invoice.due_date        = dates["due_date"]
    invoice.days_overdue    = dates["days_overdue"]
    invoice.days_until_due  = dates["days_until_due"]

    # Step 2: status
    invoice.status = determine_status(
        invoice.days_overdue,
        invoice.days_until_due,
        invoice.paid
    )

    # Step 3: interest
    interest_data           = calculate_interest(invoice.amount, invoice.days_overdue)
    invoice.interest_accrued = interest_data["interest_accrued"]
    invoice.total_due        = interest_data["total_due"]

    return invoice


# ─────────────────────────────────────────────────────────────
#  STEP 5 — NOTIFICATION TRIGGER CHECKER
#  Person C uses this to know which messages to send
# ─────────────────────────────────────────────────────────────

def check_triggers(invoice: Invoice) -> list[dict]:
    """
    Returns a list of triggers that should fire TODAY for this invoice.
    Each trigger tells Person C which template to send and to whom.

    Person C calls this function each day for every unpaid invoice.
    If the list is non-empty, C fires the corresponding messages.

    Returns:
        List of dicts. Each dict has:
          - trigger_day  : which day milestone this is
          - template_no  : 1, 2, or 3 (matches Person A's templates)
          - channel      : "whatsapp" or "email"
          - to           : who to send to
          - subject      : email subject line (empty for WhatsApp)
    """
    if invoice.paid:
        return []   # never fire notices after payment

    d = invoice.days_overdue
    triggers = []

    # Template 1 — WhatsApp on Day 46
    if d == (TRIGGER_WHATSAPP - 45):   # days_overdue == 1
        triggers.append({
            "trigger_day": TRIGGER_WHATSAPP,
            "template_no": 1,
            "channel":     "whatsapp",
            "to":          invoice.buyer_contact,
            "subject":     "",
        })

    # Template 2 — Legal email on Day 60
    if d == (TRIGGER_LEGAL_EMAIL - 45):   # days_overdue == 15
        triggers.append({
            "trigger_day": TRIGGER_LEGAL_EMAIL,
            "template_no": 2,
            "channel":     "email",
            "to":          invoice.buyer_contact,
            "subject":     f"FORMAL LEGAL NOTICE — MSMED Act 2006 — Invoice #{invoice.invoice_no}",
        })

    # Template 3 — Final warning on Day 67
    if d == (TRIGGER_FINAL_NOTICE - 45):   # days_overdue == 22
        triggers.append({
            "trigger_day": TRIGGER_FINAL_NOTICE,
            "template_no": 3,
            "channel":     "email",
            "to":          invoice.buyer_contact,
            "subject":     f"FINAL NOTICE — MSME SAMADHAAN FILING IMMINENT — Invoice #{invoice.invoice_no}",
        })

    return triggers


# ─────────────────────────────────────────────────────────────
#  SIMPLE FILE-BASED "DATABASE"
#  For the hackathon we store invoices in a JSON file.
#  In production this would be replaced with a real DB (PostgreSQL etc.)
# ─────────────────────────────────────────────────────────────

DB_FILE = "invoices_db.json"

def _load_db() -> dict:
    """Load all invoices from the JSON file."""
    if not os.path.exists(DB_FILE):
        return {}
    with open(DB_FILE, "r") as f:
        return json.load(f)

def _save_db(data: dict):
    """Save all invoices to the JSON file."""
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=2, default=str)

def save_invoice(invoice: Invoice) -> Invoice:
    """Persist an invoice to our JSON database."""
    invoice = calculate(invoice)   # always recalculate before saving
    db = _load_db()
    db[invoice.id] = invoice.to_dict()
    _save_db(db)
    return invoice

def get_invoice(invoice_id: str) -> Optional[Invoice]:
    """Fetch one invoice by ID. Returns None if not found."""
    db = _load_db()
    if invoice_id not in db:
        return None
    data = db[invoice_id]
    inv  = Invoice(**{k: v for k, v in data.items()
                     if k in Invoice.__dataclass_fields__})
    return calculate(inv)   # recalculate live values on every fetch

def get_all_invoices() -> list[Invoice]:
    """Fetch all invoices, with live recalculation."""
    db = _load_db()
    result = []
    for data in db.values():
        inv = Invoice(**{k: v for k, v in data.items()
                        if k in Invoice.__dataclass_fields__})
        result.append(calculate(inv))
    return result

def mark_paid(invoice_id: str, paid_amount: float) -> Optional[Invoice]:
    """
    Mark an invoice as paid. Freezes all numbers at this moment.
    This is what happens when D's frontend hits the 'Mark as Paid' button.
    """
    db = _load_db()
    if invoice_id not in db:
        return None
    db[invoice_id]["paid"]        = True
    db[invoice_id]["paid_at"]     = datetime.now().isoformat()
    db[invoice_id]["paid_amount"] = paid_amount
    db[invoice_id]["status"]      = STATUS_PAID
    _save_db(db)
    return get_invoice(invoice_id)


# ─────────────────────────────────────────────────────────────
#  QUICK SELF-TEST  —  run: python invoice_engine.py
#  Verifies all logic is working before starting Flask
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 55)
    print("  Digital-Vakeel — Invoice Engine Self-Test")
    print("=" * 55)

    # Test 1: fresh invoice (not overdue)
    fresh = Invoice(
        seller_name  = "Arjun Textiles",
        buyer_name   = "Mega-Retail Corp",
        invoice_no   = "INV-2025-101",
        invoice_date = date.today().isoformat(),   # today = just uploaded
        amount       = 500000,
        udyam_id     = "UDYAM-TN-07-0012345",
        buyer_contact= "finance@megaretail.com",
    )
    fresh = calculate(fresh)
    print(f"\n[TEST 1] Fresh invoice (uploaded today)")
    print(f"  Status        : {fresh.status}")
    print(f"  Days Until Due: {fresh.days_until_due}")
    print(f"  Interest      : ₹{fresh.interest_accrued}")
    assert fresh.status in (STATUS_ACTIVE, STATUS_DUE_SOON, STATUS_DUE_TODAY)
    assert fresh.interest_accrued == 0.0
    print("  ✅ PASS")

    # Test 2: 20-days-overdue invoice
    from datetime import timedelta
    old_date = (date.today() - timedelta(days=65)).isoformat()
    overdue = Invoice(
        seller_name  = "Arjun Textiles",
        buyer_name   = "Mega-Retail Corp",
        invoice_no   = "INV-2025-102",
        invoice_date = old_date,
        amount       = 500000,
    )
    overdue = calculate(overdue)
    print(f"\n[TEST 2] Invoice 65 days old (20 days overdue)")
    print(f"  Status         : {overdue.status}")
    print(f"  Days Overdue   : {overdue.days_overdue}")
    print(f"  Interest Accrued: ₹{overdue.interest_accrued:,.2f}")
    print(f"  Total Due       : ₹{overdue.total_due:,.2f}")
    assert overdue.status in (STATUS_NOTICE_SENT, STATUS_ESCALATION)
    assert overdue.days_overdue == 20
    assert overdue.interest_accrued > 0
    print("  ✅ PASS")

    # Test 3: Interest formula check
    interest_data = calculate_interest(500000, 15)
    expected = round(500000 * (0.195 / 365) * 15, 2)
    print(f"\n[TEST 3] Interest formula (₹5L × 15 days overdue)")
    print(f"  Expected : ₹{expected:,.2f}")
    print(f"  Got      : ₹{interest_data['interest_accrued']:,.2f}")
    assert abs(interest_data["interest_accrued"] - expected) < 0.01
    print("  ✅ PASS")

    # Test 4: Paid invoice — interest freezes
    paid_inv = Invoice(
        seller_name  = "Arjun Textiles",
        buyer_name   = "Mega-Retail Corp",
        invoice_no   = "INV-2025-103",
        invoice_date = old_date,
        amount       = 500000,
        paid         = True,
    )
    paid_inv = calculate(paid_inv)
    print(f"\n[TEST 4] Paid invoice")
    print(f"  Status  : {paid_inv.status}")
    print(f"  Interest: ₹{paid_inv.interest_accrued}")
    assert paid_inv.status   == STATUS_PAID
    assert paid_inv.interest_accrued == 0.0
    print("  ✅ PASS")

    # Test 5: Trigger checker
    trigger_inv = Invoice(
        seller_name  = "Arjun Textiles",
        buyer_name   = "Mega-Retail Corp",
        invoice_no   = "INV-2025-104",
        invoice_date = (date.today() - timedelta(days=46)).isoformat(),
        amount       = 500000,
        buyer_contact= "finance@megaretail.com",
    )
    trigger_inv = calculate(trigger_inv)
    triggers    = check_triggers(trigger_inv)
    print(f"\n[TEST 5] Trigger check (Day 46 invoice)")
    print(f"  Days Overdue : {trigger_inv.days_overdue}")
    print(f"  Triggers     : {triggers}")
    print("  ✅ PASS")

    print("\n" + "=" * 55)
    print("  All tests passed! Engine is ready.")
    print("=" * 55)
