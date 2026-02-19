// ============================================================
//  api.js  —  Digital-Vakeel Frontend API Client
//  Person D drops this file into src/api.js
//  Then replaces all useState dummy data calls with these functions.
//
//  HOW TO USE:
//  import { createInvoice, getInvoice, markPaid } from './api';
// ============================================================

const BASE_URL = "http://localhost:5000";   // ← Person B's Flask server

// ─────────────────────────────────────────────────────────────
//  HELPER — all fetch calls go through here
// ─────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  try {
    const res  = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || `API error: ${res.status}`);
    }
    return json.data;

  } catch (err) {
    // If Flask isn't running, fall back to dummy data gracefully
    if (err.message.includes("Failed to fetch")) {
      console.warn("⚠️  Flask server not running. Using dummy data.");
      return null;   // caller checks for null and uses fallback
    }
    throw err;
  }
}


// ─────────────────────────────────────────────────────────────
//  INVOICE FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Create a new invoice.
 * Called when the Upload screen form is submitted.
 *
 * @param {Object} formData - matches the Invoice dataclass fields
 * @returns {Object} full invoice with calculated status, interest etc.
 */
export async function createInvoice(formData) {
  return apiFetch("/invoices", {
    method:  "POST",
    body:    JSON.stringify(formData),
  });
}

/**
 * Get all invoices (for dashboard list).
 * Returns array of invoice objects, all with live-calculated values.
 */
export async function getAllInvoices() {
  return apiFetch("/invoices");
}

/**
 * Get one invoice by ID.
 * @param {string} invoiceId - the short ID like "A3B7C2D1"
 */
export async function getInvoice(invoiceId) {
  return apiFetch(`/invoices/${invoiceId}`);
}

/**
 * Mark an invoice as paid. Stops all interest and notices.
 * Called when "Mark as Paid" button is clicked.
 *
 * @param {string} invoiceId
 * @param {number} paidAmount - actual amount the buyer sent
 */
export async function markPaid(invoiceId, paidAmount) {
  return apiFetch(`/invoices/${invoiceId}/pay`, {
    method: "POST",
    body:   JSON.stringify({ paid_amount: paidAmount }),
  });
}

/**
 * Get today's notification triggers for one invoice.
 * Person C uses this to know what to send.
 */
export async function getTriggers(invoiceId) {
  return apiFetch(`/invoices/${invoiceId}/triggers`);
}

/**
 * Get summary stats for the dashboard header.
 */
export async function getSummary() {
  return apiFetch("/summary");
}


// ─────────────────────────────────────────────────────────────
//  DUMMY DATA FALLBACK
//  Used when Flask isn't running yet (early development)
//  Person D uses this until Person B's server is ready.
// ─────────────────────────────────────────────────────────────

export const DUMMY_INVOICE = {
  id:            "DEMO0001",
  seller_name:   "Arjun Textiles",
  buyer_name:    "Mega-Retail Corp",
  invoice_no:    "INV-2025-101",
  invoice_date:  "2025-02-01",
  amount:        500000,
  udyam_id:      "UDYAM-TN-07-0012345",
  buyer_gstin:   "27AABCU9603R1ZM",
  buyer_contact: "finance@megaretail.com",
  paid:          false,
  status:        "LEGAL NOTICE SENT",
  days_overdue:  20,
  days_until_due: 0,
  interest_accrued: 5342.47,
  total_due:     505342.47,
  due_date:      "2025-03-17",
  notices_sent: [
    { template_no: 1, channel: "whatsapp", sent_to: "finance@megaretail.com", sent_at: "2025-03-18T09:00:00" },
    { template_no: 2, channel: "email",    sent_to: "finance@megaretail.com", sent_at: "2025-04-01T09:00:00" },
  ],
};
