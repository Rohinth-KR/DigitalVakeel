// ============================================================
//  api.js  —  Digital-Vakeel Frontend API Client
//  Includes auth (signup/login), protected routes with JWT,
//  and chat history functions.
// ============================================================

const BASE_URL = "http://localhost:5000";

// ─────────────────────────────────────────────
//  TOKEN MANAGEMENT
// ─────────────────────────────────────────────

export function getToken() {
  return localStorage.getItem("dv_token");
}

export function setToken(token) {
  localStorage.setItem("dv_token", token);
}

export function removeToken() {
  localStorage.removeItem("dv_token");
  localStorage.removeItem("dv_user");
}

export function getStoredUser() {
  const u = localStorage.getItem("dv_user");
  return u ? JSON.parse(u) : null;
}

export function setStoredUser(user) {
  localStorage.setItem("dv_user", JSON.stringify(user));
}


// ─────────────────────────────────────────────
//  API FETCH HELPER (with JWT)
// ─────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers,
      ...options,
      // For FormData, remove Content-Type so browser sets it
      ...(options.body instanceof FormData ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    const json = await res.json();

    // Handle expired token
    if (res.status === 401 || res.status === 422) {
      removeToken();
      window.location.reload();
      return null;
    }

    if (!res.ok || !json.ok) {
      throw new Error(json.error || `API error: ${res.status}`);
    }
    return json.data;

  } catch (err) {
    if (err.message.includes("Failed to fetch")) {
      console.warn("⚠️  Flask server not running.");
      return null;
    }
    throw err;
  }
}


// ─────────────────────────────────────────────
//  AUTH FUNCTIONS
// ─────────────────────────────────────────────

export async function signup(name, email, password) {
  const res = await fetch(`${BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error || "Signup failed");
  }
  setToken(json.data.token);
  setStoredUser(json.data.user);
  return json.data;
}

export async function login(email, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error || "Login failed");
  }
  setToken(json.data.token);
  setStoredUser(json.data.user);
  return json.data;
}

export function logout() {
  removeToken();
}


// ─────────────────────────────────────────────
//  INVOICE FUNCTIONS (JWT-protected)
// ─────────────────────────────────────────────

export async function createInvoice(formData) {
  return apiFetch("/invoices", {
    method: "POST",
    body: JSON.stringify(formData),
  });
}

export async function getAllInvoices() {
  return apiFetch("/invoices");
}

export async function getInvoice(invoiceId) {
  return apiFetch(`/invoices/${invoiceId}`);
}

export async function markPaid(invoiceId, paidAmount) {
  return apiFetch(`/invoices/${invoiceId}/pay`, {
    method: "POST",
    body: JSON.stringify({ paid_amount: paidAmount }),
  });
}

export async function getSummary() {
  return apiFetch("/summary");
}


// ─────────────────────────────────────────────
//  OCR (JWT-protected)
// ─────────────────────────────────────────────

export async function extractInvoicePDF(pdfFile) {
  const formData = new FormData();
  formData.append("file", pdfFile);
  const token = getToken();

  try {
    const res = await fetch(`${BASE_URL}/ocr/extract`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "OCR failed");
    return json.data;
  } catch (err) {
    console.error("OCR Error:", err);
    return null;
  }
}


// ─────────────────────────────────────────────
//  CHAT FUNCTIONS (JWT-protected)
// ─────────────────────────────────────────────

export async function sendChatMessage(question) {
  return apiFetch("/chat", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export async function getChatHistory() {
  return apiFetch("/chat/history");
}

export async function clearChatHistory() {
  return apiFetch("/chat/history", { method: "DELETE" });
}

export async function getChatSuggestions() {
  try {
    const res = await fetch(`${BASE_URL}/chat/suggestions`);
    const json = await res.json();
    return json.data?.suggestions || [];
  } catch {
    return [];
  }
}


// ─────────────────────────────────────────────
//  NOTICE & PDF FUNCTIONS (JWT-protected)
// ─────────────────────────────────────────────

/**
 * Manually send a legal notice for an invoice.
 * @param {string} invoiceId
 * @param {number} templateNo - 1, 2, or 3 (auto-picked if null)
 * @param {string[]} channels - ['email'] | ['whatsapp'] | ['email','whatsapp']
 */
export async function sendNotice(invoiceId, templateNo = null, channels = ["email"]) {
  return apiFetch(`/invoices/${invoiceId}/send-notice`, {
    method: "POST",
    body: JSON.stringify({ template_no: templateNo, channels }),
  });
}

/**
 * Get all notices sent for an invoice.
 */
export async function getNotices(invoiceId) {
  return apiFetch(`/invoices/${invoiceId}/notices`);
}

/**
 * Trigger PDF download for an invoice case file.
 * Opens the PDF in a new browser tab (browser handles download).
 */
export async function exportCasePDF(invoiceId) {
  const token = getToken();
  const url   = `${BASE_URL}/invoices/${invoiceId}/export-pdf`;
  // We open with token in header — use a fetch + blob approach
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("PDF generation failed");
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `DigitalVakeel_Case_${invoiceId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

