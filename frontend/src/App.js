import { useState, useEffect, useRef } from "react";
import { extractInvoicePDF } from './api';

// ─────────────────────────────────────────────
//  DESIGN TOKENS
// ─────────────────────────────────────────────
const T = {
  sidebar:  "#0C1A2E",
  sideAcc:  "#112240",
  brand:    "#00C9B8",
  brandDim: "#009E90",
  amber:    "#F59E0B",
  red:      "#EF4444",
  green:    "#10B981",
  blue:     "#3B82F6",
  content:  "#F7F9FC",
  white:    "#FFFFFF",
  ink:      "#1A2744",
  muted:    "#64748B",
  border:   "#E2E8F0",
  cardBg:   "#FFFFFF",
};

// ─────────────────────────────────────────────
//  DUMMY DATA
// ─────────────────────────────────────────────
const DUMMY_INVOICE = {
  sellerName:    "Arjun Textiles",
  buyerName:     "Mega-Retail Corp",
  invoiceNo:     "INV-2025-101",
  invoiceDate:   "2025-02-01",
  amount:        500000,
  udyamId:       "UDYAM-TN-07-0012345",
  buyerGstin:    "27AABCU9603R1ZM",
  buyerContact:  "finance@megaretail.com",
};

const DAILY_RATE = 0.195 / 365;

function calcStatus(invoiceDate, paid, amount = 0) {
  if (paid) return { status: "PAID", daysOverdue: 0, interest: 0, total: amount, daysUntilDue: 0 };
  const invoice  = new Date(invoiceDate);
  const due      = new Date(invoice); due.setDate(due.getDate() + 45);
  const today    = new Date();
  const diffMs   = today - due;
  const daysOver = Math.max(0, Math.floor(diffMs / 86400000));
  const daysLeft = Math.max(0, Math.ceil((due - today) / 86400000));

  let status = "ACTIVE";
  if (daysOver === 0 && daysLeft === 0) status = "DUE TODAY";
  else if (daysOver >= 22) status = "ESCALATION";
  else if (daysOver >= 15) status = "LEGAL NOTICE SENT";
  else if (daysOver >= 1)  status = "OVERDUE";
  else if (daysLeft <= 5)  status = "DUE SOON";

  const interest = Math.round(amount * DAILY_RATE * daysOver);
  return { status, daysOverdue: daysOver, daysUntilDue: daysLeft,
           interest, total: amount + interest };
}

function buildTimeline(invoiceDate) {
  const d0 = new Date(invoiceDate);
  const fmt = (d) => d.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
  const add = (base, n) => { const x = new Date(base); x.setDate(x.getDate()+n); return x; };
  return [
    { day: 0,  date: fmt(d0),        label:"Invoice Uploaded",        icon:"📄", color: T.brand,  status:"ACTIVE",             detail:"System extracted invoice data via OCR. Due date calculated automatically." },
    { day: 45, date: fmt(add(d0,45)),label:"Payment Due",              icon:"📅", color: T.amber,  status:"DUE",                detail:"45-day statutory window closes today. System sends soft reminder." },
    { day: 46, date: fmt(add(d0,46)),label:"Overdue — Interest Begins",icon:"⚠️", color: T.red,    status:"OVERDUE",            detail:"Statutory 3× compound interest starts accruing. WhatsApp reminder sent to Mega-Retail Finance Team." },
    { day: 60, date: fmt(add(d0,60)),label:"Formal Legal Notice Sent", icon:"⚖️", color: T.red,    status:"LEGAL NOTICE SENT",  detail:"Formal email notice dispatched to Mega-Retail Legal Dept + Finance Head. 7-day deadline set." },
    { day: 67, date: fmt(add(d0,67)),label:"Final Escalation Warning", icon:"🚨", color:"#7C3AED", status:"ESCALATION",          detail:"Final notice sent to CEO. MSME Samadhaan portal filing scheduled in 24 hours." },
    { day: 68, date: fmt(add(d0,68)),label:"Payment Received ✓",       icon:"✅", color: T.green,  status:"PAID",               detail:"₹5,12,400 received (principal + full statutory interest). Case closed." },
  ];
}

const NOTIFICATIONS = [
  { day: 46, type: "WhatsApp", icon: "💬", color: "#25D366", label: "WhatsApp Sent",   to: "Mega-Retail Finance Manager", template: 1 },
  { day: 60, type: "Email",    icon: "📧", color: T.red,     label: "Legal Email Sent",to: "Mega-Retail Legal Dept",      template: 2 },
  { day: 67, type: "Email",    icon: "🚨", color:"#7C3AED",  label: "Final Notice Sent",to:"Mega-Retail CEO + Legal",     template: 3 },
];

// ─────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────
const S = {
  app: {
    display:"flex", height:"100vh", fontFamily:"'Outfit', 'Segoe UI', sans-serif",
    background: T.content, overflow:"hidden",
  },
  sidebar: {
    width:240, background: T.sidebar, display:"flex", flexDirection:"column",
    padding:"0", flexShrink:0, position:"relative", overflow:"hidden",
  },
  sideGlow: {
    position:"absolute", top:-60, left:-60, width:200, height:200, borderRadius:"50%",
    background:"radial-gradient(circle, rgba(0,201,184,0.12) 0%, transparent 70%)",
    pointerEvents:"none",
  },
  sideLogoWrap: {
    padding:"28px 24px 20px", borderBottom:`1px solid rgba(255,255,255,0.06)`,
  },
  sideLogo: {
    fontFamily:"'Outfit', sans-serif", fontWeight:800, fontSize:20,
    color: T.brand, letterSpacing:"-0.3px", display:"flex", alignItems:"center", gap:8,
  },
  sideTagline: { fontSize:10, color:"rgba(255,255,255,0.35)", marginTop:4, letterSpacing:"0.5px" },
  sideNav: { padding:"20px 12px", flex:1 },
  sideSection: { fontSize:9, color:"rgba(255,255,255,0.3)", letterSpacing:"1.5px",
                 textTransform:"uppercase", padding:"0 12px", marginBottom:8, marginTop:16 },
  navItem: (active) => ({
    display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
    borderRadius:8, cursor:"pointer", marginBottom:2, transition:"all 0.15s",
    background: active ? "rgba(0,201,184,0.12)" : "transparent",
    border: active ? "1px solid rgba(0,201,184,0.2)" : "1px solid transparent",
    color: active ? T.brand : "rgba(255,255,255,0.55)",
    fontWeight: active ? 600 : 400, fontSize:13,
  }),
  navIcon: { fontSize:14, width:18, textAlign:"center" },
  sideFooter: {
    padding:"16px 24px", borderTop:`1px solid rgba(255,255,255,0.06)`,
    fontSize:10, color:"rgba(255,255,255,0.2)", letterSpacing:"0.3px",
  },
  main: { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  topbar: {
    height:60, background: T.white, borderBottom:`1px solid ${T.border}`,
    display:"flex", alignItems:"center", padding:"0 32px",
    justifyContent:"space-between", flexShrink:0,
  },
  topTitle: { fontWeight:700, fontSize:18, color: T.ink, letterSpacing:"-0.3px" },
  topSub:   { fontSize:12, color: T.muted, marginTop:1 },
  topRight: { display:"flex", alignItems:"center", gap:12 },
  topBadge: {
    padding:"4px 12px", borderRadius:100, fontSize:11, fontWeight:600,
    background:"rgba(0,201,184,0.1)", color: T.brand, border:`1px solid rgba(0,201,184,0.25)`,
  },
  scroll: { flex:1, overflowY:"auto", padding:"28px 32px" },
  card: (extra={}) => ({
    background: T.white, borderRadius:14, border:`1px solid ${T.border}`,
    boxShadow:"0 1px 4px rgba(0,0,0,0.05)", padding:24, ...extra,
  }),
  cardTitle: { fontWeight:700, fontSize:14, color: T.ink, marginBottom:16,
               display:"flex", alignItems:"center", gap:8 },
  statusBadge: (status) => {
    const map = {
      "ACTIVE":             { bg:"#EFF6FF", color:"#1D4ED8", border:"#BFDBFE" },
      "DUE TODAY":          { bg:"#FFFBEB", color:"#B45309", border:"#FDE68A" },
      "DUE SOON":           { bg:"#FFFBEB", color:"#B45309", border:"#FDE68A" },
      "OVERDUE":            { bg:"#FEF2F2", color:"#DC2626", border:"#FECACA" },
      "LEGAL NOTICE SENT":  { bg:"#FDF4FF", color:"#7C3AED", border:"#E9D5FF" },
      "ESCALATION":         { bg:"#FFF1F2", color:"#9F1239", border:"#FECDD3" },
      "PAID":               { bg:"#F0FDF4", color:"#15803D", border:"#BBF7D0" },
    };
    const c = map[status] || map["ACTIVE"];
    return { padding:"4px 12px", borderRadius:100, fontSize:11, fontWeight:700,
             background:c.bg, color:c.color, border:`1px solid ${c.border}`, display:"inline-block" };
  },
  label: { fontSize:12, fontWeight:600, color: T.muted, marginBottom:6,
           display:"block", letterSpacing:"0.3px" },
  input: {
    width:"100%", padding:"10px 14px", borderRadius:8, border:`1px solid ${T.border}`,
    fontSize:13, color: T.ink, background: T.white, outline:"none",
    transition:"border 0.15s", boxSizing:"border-box",
  },
  inputFocus: { border:`1px solid ${T.brand}`, boxShadow:`0 0 0 3px rgba(0,201,184,0.1)` },
  btnPrimary: {
    padding:"11px 24px", background:`linear-gradient(135deg, ${T.brand}, ${T.brandDim})`,
    color: T.white, border:"none", borderRadius:9, fontSize:13, fontWeight:700,
    cursor:"pointer", letterSpacing:"0.2px", transition:"all 0.15s",
    boxShadow:`0 4px 14px rgba(0,201,184,0.3)`,
  },
  btnGhost: {
    padding:"10px 20px", background:"transparent", color: T.muted,
    border:`1px solid ${T.border}`, borderRadius:9, fontSize:13,
    cursor:"pointer", transition:"all 0.15s",
  },
  statBox: (color) => ({
    background: T.white, borderRadius:12, border:`1px solid ${T.border}`,
    padding:"20px 22px", borderTop:`3px solid ${color}`,
    boxShadow:"0 1px 4px rgba(0,0,0,0.04)",
  }),
  statLabel: { fontSize:11, fontWeight:600, color: T.muted, letterSpacing:"0.5px",
               textTransform:"uppercase", marginBottom:6 },
  statValue: (color) => ({ fontSize:28, fontWeight:800, color, letterSpacing:"-0.5px", lineHeight:1 }),
  statSub:   { fontSize:11, color: T.muted, marginTop:4 },
  tlWrap: { position:"relative", paddingLeft:32 },
  tlLine: {
    position:"absolute", left:10, top:8, bottom:0, width:2,
    background:`linear-gradient(to bottom, ${T.brand}, rgba(0,201,184,0.05))`,
  },
  tlItem: { position:"relative", marginBottom:28 },
  tlDot: (color, active) => ({
    position:"absolute", left:-26, top:4, width:16, height:16, borderRadius:"50%",
    background: active ? color : T.border, border:`3px solid ${T.white}`,
    boxShadow: active ? `0 0 0 3px ${color}33` : "none", transition:"all 0.3s",
  }),
  tlDay: { fontSize:10, fontWeight:700, color: T.muted, letterSpacing:"0.5px",
           textTransform:"uppercase", marginBottom:2 },
  tlTitle: (active,color) => ({
    fontSize:13, fontWeight: active ? 700 : 500,
    color: active ? color : T.muted, marginBottom:2,
  }),
  tlDetail: { fontSize:11, color: T.muted, lineHeight:1.6 },
  notifPill: (color) => ({
    display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
    background:`${color}0D`, borderRadius:9, border:`1px solid ${color}33`,
    marginBottom:8,
  }),
  notifText: { fontSize:12, flex:1 },
  notifLabel: (color) => ({ fontSize:10, fontWeight:700, color, letterSpacing:"0.5px" }),
  dropZone: (dragging) => ({
    border:`2px dashed ${dragging ? T.brand : T.border}`,
    borderRadius:12, padding:"36px 24px", textAlign:"center",
    background: dragging ? "rgba(0,201,184,0.04)" : T.content,
    cursor:"pointer", transition:"all 0.2s", marginBottom:20,
  }),
  stepBar: { display:"flex", alignItems:"center", marginBottom:32, gap:0 },
  stepItem: (active, done) => ({
    display:"flex", alignItems:"center", gap:8, flex:1,
  }),
  stepDot: (active, done) => ({
    width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center",
    justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0,
    background: done ? T.brand : active ? T.ink : T.border,
    color: done || active ? T.white : T.muted,
    boxShadow: active ? `0 0 0 4px rgba(0,201,184,0.2)` : "none",
    transition:"all 0.3s",
  }),
  stepLabel: (active) => ({
    fontSize:11, fontWeight: active ? 700 : 400,
    color: active ? T.ink : T.muted, whiteSpace:"nowrap",
  }),
  stepLine: (done) => ({
    flex:1, height:2, background: done ? T.brand : T.border,
    margin:"0 4px", transition:"background 0.3s",
  }),
};

// ─────────────────────────────────────────────
//  COMPONENTS
// ─────────────────────────────────────────────

function Sidebar({ screen, setScreen }) {
  const navItems = [
    { id:"upload",    icon:"📤", label:"Upload Invoice" },
    { id:"dashboard", icon:"📊", label:"Dashboard" },
    { id:"timeline",  icon:"📅", label:"Timeline" },
  ];
  return (
    <div style={S.sidebar}>
      <div style={S.sideGlow}/>
      <div style={S.sideLogoWrap}>
        <div style={S.sideLogo}>
          <span>⚖</span> Digital-Vakeel
        </div>
        <div style={S.sideTagline}>MSME PAYMENT ENFORCEMENT AI</div>
      </div>
      <div style={S.sideNav}>
        <div style={S.sideSection}>Navigation</div>
        {navItems.map(n => (
          <div key={n.id} style={S.navItem(screen===n.id)} onClick={() => setScreen(n.id)}>
            <span style={S.navIcon}>{n.icon}</span>
            {n.label}
          </div>
        ))}
        <div style={S.sideSection}>Legal</div>
        <div style={S.navItem(false)}>
          <span style={S.navIcon}>📋</span> MSMED Act 2006
        </div>
        <div style={S.navItem(false)}>
          <span style={S.navIcon}>🏛️</span> Samadhaan Portal
        </div>
      </div>
      <div style={S.sideFooter}>
        v1.0 · Hackathon Demo<br/>
        Open-Source · Local AI
      </div>
    </div>
  );
}

// ── UPLOAD SCREEN ──────────────────────────────
function UploadScreen({ onSubmit }) {
  const [form, setForm] = useState({
    sellerName:"", buyerName:"", invoiceNo:"",
    invoiceDate:"", amount:"", udyamId:"", buyerContact:"",
  });
  const [focused, setFocused] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [step, setStep]     = useState(1);
  const [errors, setErrors] = useState({});
  const [ocrDone, setOcrDone] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef();

  const set = (k,v) => setForm(f => ({...f,[k]:v}));

  // ✅ NEW: PDF extraction handler
  const handlePDFExtraction = async (file) => {
    if (!file) return;
    
    setProcessing(true);
    setOcrDone(false);
    
    const extracted = await extractInvoicePDF(file);
    console.log("OCR returned:", extracted);
    
    setProcessing(false);

    if (extracted) {
      setForm({
        sellerName:   extracted.seller_name || "",
        buyerName:    extracted.buyer_name || "",
        invoiceNo:    extracted.invoice_no || "",
        invoiceDate:  extracted.invoice_date || "",
        amount:       extracted.amount ? String(extracted.amount) : "",
        udyamId:      extracted.udyam_id || "",
        buyerContact: extracted.buyer_contact || "",
      });
      setOcrDone(true);
    } else {
      alert("OCR extraction failed. Please enter details manually.");
    }
  };

  const validate = () => {
    const e = {};
    if (!form.sellerName) e.sellerName = "Required";
    if (!form.buyerName)  e.buyerName  = "Required";
    if (!form.invoiceNo)  e.invoiceNo  = "Required";
    if (!form.invoiceDate)e.invoiceDate= "Required";
    if (!form.amount || isNaN(Number(form.amount))) e.amount = "Enter a valid number";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => { if (validate()) setStep(2); };
  
  const handleSubmit = async () => {
    const payload = {
      ...form,
      amount: Number(form.amount),
    };
    const saved = await onSubmit(payload);
    if (saved) {
      setStep(3);
    }
  };

  const renderField = ({ label, k, type="text", placeholder="" }) => (
    <div style={{ marginBottom:16 }} key={k}>
      <label style={S.label}>{label}</label>
      <input
        type={type} placeholder={placeholder}
        value={form[k]} onChange={e => set(k, e.target.value)}
        onFocus={() => setFocused(k)} onBlur={() => setFocused(null)}
        style={{ ...S.input, ...(focused===k ? S.inputFocus : {}),
                 ...(errors[k] ? { border:`1px solid ${T.red}` } : {}) }}
      />
      {errors[k] && <div style={{fontSize:11,color:T.red,marginTop:4}}>{errors[k]}</div>}
    </div>
  );

  return (
    <div style={S.scroll}>
      {/* Step progress bar */}
      <div style={S.stepBar}>
        {["Invoice Details","Review","Submitted"].map((label,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={S.stepDot(step===i+1, step>i+1)}>
                {step>i+1 ? "✓" : i+1}
              </div>
              <span style={S.stepLabel(step===i+1)}>{label}</span>
            </div>
            {i<2 && <div style={S.stepLine(step>i+1)}/>}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
          {/* Left: OCR Upload */}
          <div>
            <div style={S.card()}>
              <div style={S.cardTitle}>📤 Upload Invoice Image</div>
              <div
                style={S.dropZone(dragging)}
                onDragOver={e=>{e.preventDefault();setDragging(true)}}
                onDragLeave={()=>setDragging(false)}
                onDrop={e=>{
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handlePDFExtraction(file);
                }}
                onClick={()=>fileRef.current?.click()}
              >
                <input 
                  ref={fileRef} 
                  type="file" 
                  accept="image/*,.pdf" 
                  style={{display:"none"}}
                  onChange={(e) => { if (e.target.files[0]) handlePDFExtraction(e.target.files[0]); }} 
                />
                
                {/* ✅ NEW: Dynamic loading state */}
                {processing ? (
                  <>
                    <div style={{fontSize:36,marginBottom:12}}>⏳</div>
                    <div style={{fontWeight:700,color:T.brand,fontSize:14,marginBottom:4}}>
                      Extracting invoice data...
                    </div>
                    <div style={{fontSize:12,color:T.muted}}>
                      Please wait while OCR processes your document
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{fontSize:36,marginBottom:12}}>🧾</div>
                    <div style={{fontWeight:700,color:T.ink,fontSize:14,marginBottom:4}}>
                      Drop invoice here or click to browse
                    </div>
                    <div style={{fontSize:12,color:T.muted}}>
                      PNG, JPG, PDF · Max 10MB
                    </div>
                  </>
                )}
              </div>

              {/* ✅ Success message */}
              {ocrDone && !processing && (
                <div style={{
                  padding:"10px 14px", background:"rgba(16,185,129,0.08)", borderRadius:8,
                  border:`1px solid rgba(16,185,129,0.25)`, fontSize:12, color:"#15803D",
                  display:"flex", alignItems:"center", gap:8, marginTop:16,
                }}>
                  ✅ <strong>OCR Complete</strong> — Invoice data extracted successfully
                </div>
              )}
            </div>
          </div>

          {/* Right: Manual form */}
          <div>
            <div style={S.card()}>
              <div style={S.cardTitle}>📝 Invoice Details</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
                {renderField({label: "SELLER NAME", k: "sellerName", placeholder: "e.g. Arjun Textiles"})}
                {renderField({label: "BUYER NAME", k: "buyerName", placeholder: "e.g. Mega-Retail Corp"})}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
                {renderField({label: "INVOICE NUMBER", k: "invoiceNo", placeholder: "INV-2025-101"})}
                {renderField({label: "INVOICE DATE", k: "invoiceDate", type: "date"})}
              </div>
              {renderField({label: "INVOICE AMOUNT (₹)", k: "amount", placeholder: "500000"})}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
                {renderField({label: "UDYAM ID (SELLER)", k: "udyamId", placeholder: "UDYAM-TN-07-..."})}
                {renderField({label: "BUYER CONTACT EMAIL", k: "buyerContact", type: "email"})}
              </div>

              <div style={{display:"flex",gap:10,marginTop:8}}>
                <button style={S.btnPrimary} onClick={handleNext}>
                  Continue to Review →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{maxWidth:600,margin:"0 auto"}}>
          <div style={S.card()}>
            <div style={S.cardTitle}>🔍 Review Invoice Details</div>
            <div style={{
              background:T.content, borderRadius:10, padding:20, marginBottom:20,
              border:`1px solid ${T.border}`,
            }}>
              {[
                ["Seller", form.sellerName], ["Buyer", form.buyerName],
                ["Invoice No.", form.invoiceNo], ["Invoice Date", form.invoiceDate],
                ["Amount", `₹${Number(form.amount).toLocaleString("en-IN")}`],
                ["Udyam ID", form.udyamId], ["Buyer Email", form.buyerContact],
              ].map(([label,val]) => (
                <div key={label} style={{
                  display:"flex", justifyContent:"space-between",
                  padding:"10px 0", borderBottom:`1px solid ${T.border}`,
                }}>
                  <span style={{fontSize:12,color:T.muted,fontWeight:600}}>{label}</span>
                  <span style={{fontSize:13,color:T.ink,fontWeight:500}}>{val || "—"}</span>
                </div>
              ))}
            </div>

            <div style={{
              padding:"14px 16px", background:"#FFFBEB", borderRadius:8,
              border:`1px solid #FDE68A`, marginBottom:20, fontSize:12,
              color:"#92400E",
            }}>
              <strong>⚖ Legal Note:</strong> By submitting, you confirm this invoice is from a
              registered MSME (Udyam ID verified). Digital-Vakeel will begin monitoring payment
              status as per Section 15, MSMED Act 2006.
            </div>

            <div style={{display:"flex",gap:10}}>
              <button style={S.btnGhost} onClick={()=>setStep(1)}>← Edit Details</button>
              <button style={S.btnPrimary} onClick={handleSubmit}>
                ✅ Submit & Start Monitoring
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{maxWidth:540,margin:"40px auto",textAlign:"center"}}>
          <div style={S.card({ padding:"48px 40px" })}>
            <div style={{fontSize:56,marginBottom:16}}>✅</div>
            <div style={{fontWeight:800,fontSize:22,color:T.ink,marginBottom:8}}>
              Invoice Submitted!
            </div>
            <div style={{fontSize:14,color:T.muted,marginBottom:8,lineHeight:1.6}}>
              <strong style={{color:T.ink}}>{form.invoiceNo}</strong> is now being monitored.
            </div>
            <div style={{
              padding:"12px 20px", background:"rgba(0,201,184,0.06)",
              borderRadius:8, border:`1px solid rgba(0,201,184,0.2)`,
              fontSize:13, color: T.brand, marginBottom:24, fontWeight:600,
            }}>
              Payment due by: {(() => {
                const d = new Date(form.invoiceDate);
                d.setDate(d.getDate()+45);
                return d.toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"});
              })()}
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button style={S.btnGhost} onClick={()=>setStep(1)}>
                ＋ Add Another Invoice
              </button>
              <button style={S.btnPrimary} onClick={()=>window.location.href="/"}>
                View Dashboard →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// (Dashboard and Timeline screens remain exactly the same - keeping them short here)
function DashboardScreen({ invoice }) {
  const timeline = buildTimeline(invoice.invoiceDate);
  const paid = invoice.paid === true;
  const liveInfo = calcStatus(invoice.invoiceDate, paid, invoice.amount);
  
  const handleMarkPaid = async () => {
    try {
      const res = await fetch(`http://localhost:5000/invoices/${invoice.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Payment failed");
      await res.json();
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const statusColor = {
    "ACTIVE":"#1D4ED8","DUE TODAY":T.amber,"DUE SOON":T.amber,
    "OVERDUE":T.red,"LEGAL NOTICE SENT":"#7C3AED","ESCALATION":"#9F1239","PAID":T.green,
  }[liveInfo.status] || T.brand;

  return (
    <div style={S.scroll}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
        <div style={S.statBox(statusColor)}>
          <div style={S.statLabel}>Current Status</div>
          <div style={{marginTop:6}}><span style={S.statusBadge(liveInfo.status)}>{liveInfo.status}</span></div>
          <div style={S.statSub}>{liveInfo.daysOverdue > 0 ? `${liveInfo.daysOverdue} days overdue` : liveInfo.daysUntilDue > 0 ? `${liveInfo.daysUntilDue} days remaining` : "Due today"}</div>
        </div>
        <div style={S.statBox(T.ink)}>
          <div style={S.statLabel}>Principal Amount</div>
          <div style={S.statValue(T.ink)}>₹{(invoice.amount/100000).toFixed(1)}L</div>
          <div style={S.statSub}>{invoice.invoiceNo}</div>
        </div>
        <div style={S.statBox(T.red)}>
          <div style={S.statLabel}>Interest Accrued</div>
          <div style={S.statValue(paid ? T.green : liveInfo.interest > 0 ? T.red : T.muted)}>
            ₹{liveInfo.interest.toLocaleString("en-IN")}
          </div>
          <div style={S.statSub}>@ 19.5% p.a. (3× RBI)</div>
        </div>
        <div style={S.statBox(paid ? T.green : T.amber)}>
          <div style={S.statLabel}>Total Now Due</div>
          <div style={S.statValue(paid ? T.green : T.amber)}>
            ₹{(liveInfo.total/100000).toFixed(2)}L
          </div>
          <div style={S.statSub}>Principal + Interest</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:20}}>
        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          <div style={S.card()}>
            <div style={S.cardTitle}>🧾 Invoice Details</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 24px"}}>
              {[
                ["Seller", invoice.sellerName], ["Buyer", invoice.buyerName],
                ["Invoice No.", invoice.invoiceNo],
                ["Invoice Date", new Date(invoice.invoiceDate).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})],
                ["Due Date", (() => { const d = new Date(invoice.invoiceDate); d.setDate(d.getDate()+45); return d.toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}); })()],
                ["Buyer GSTIN", invoice.buyerGstin || "—"],
              ].map(([l,v]) => (
                <div key={l} style={{padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                  <div style={{fontSize:10,color:T.muted,fontWeight:600,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2}}>{l}</div>
                  <div style={{fontSize:13,color:T.ink,fontWeight:500}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={S.card()}>
            <div style={S.cardTitle}>📐 Statutory Interest Calculation</div>
            <div style={{
              background: T.content, borderRadius:8, padding:16,
              fontFamily:"'Courier New', monospace", fontSize:12, color: T.muted,
              lineHeight:1.8, border:`1px solid ${T.border}`,
            }}>
              <div><span style={{color:T.muted}}>Principal          =</span> <strong style={{color:T.ink}}>₹{invoice.amount.toLocaleString("en-IN")}</strong></div>
              <div><span style={{color:T.muted}}>Annual Rate (3×RBI)=</span> <strong style={{color:T.ink}}>19.5% p.a.</strong></div>
              <div><span style={{color:T.muted}}>Daily Rate         =</span> <strong style={{color:T.ink}}>0.195 ÷ 365 = 0.0534%</strong></div>
              <div><span style={{color:T.muted}}>Days Overdue       =</span> <strong style={{color:liveInfo.daysOverdue>0?T.red:T.ink}}>{liveInfo.daysOverdue} days</strong></div>
              <div style={{borderTop:`1px solid ${T.border}`,marginTop:8,paddingTop:8}}>
                <span style={{color:T.muted}}>Interest           =</span> <strong style={{color:T.red}}> ₹{liveInfo.interest.toLocaleString("en-IN")}</strong>
              </div>
              <div><span style={{color:T.muted}}>TOTAL DUE          =</span> <strong style={{color:T.amber,fontSize:13}}> ₹{liveInfo.total.toLocaleString("en-IN")}</strong></div>
            </div>
          </div>

          <div style={S.card()}>
            <div style={S.cardTitle}>💳 Payment Actions</div>
            {paid ? (
              <div style={{
                padding:"16px", background:"rgba(16,185,129,0.08)", borderRadius:8,
                border:`1px solid rgba(16,185,129,0.25)`, textAlign:"center",
              }}>
                <div style={{fontSize:24,marginBottom:6}}>✅</div>
                <div style={{fontWeight:700,color:"#15803D",fontSize:14}}>Payment Confirmed</div>
                <div style={{fontSize:12,color:T.muted,marginTop:4}}>
                  All automated notices have been stopped.
                </div>
              </div>
            ) : (
              <div>
                <div style={{fontSize:13,color:T.muted,marginBottom:14,lineHeight:1.6}}>
                  When the buyer transfers the full amount, mark it as received to stop all automated notices and interest accrual.
                </div>
                <button
                  style={{...S.btnPrimary, background:`linear-gradient(135deg,${T.green},#059669)`}}
                  onClick={handleMarkPaid}
                >
                  ✅ Mark as Paid — ₹{liveInfo.total.toLocaleString("en-IN")}
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          <div style={S.card()}>
            <div style={S.cardTitle}>📬 Automated Notices</div>
            {NOTIFICATIONS.map(n => (
              <div key={n.day} style={S.notifPill(n.color)}>
                <span style={{fontSize:18}}>{n.icon}</span>
                <div style={{flex:1}}>
                  <div style={S.notifLabel(n.color)}>TEMPLATE {n.template} · DAY {n.day}</div>
                  <div style={S.notifText}>{n.label}</div>
                  <div style={{fontSize:10,color:T.muted}}>To: {n.to}</div>
                </div>
                <span style={{
                  fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:100,
                  background:`${n.color}20`,color:n.color,border:`1px solid ${n.color}40`,
                }}>SENT</span>
              </div>
            ))}
            <div style={{
              fontSize:11,color:T.muted,marginTop:8,padding:"8px 10px",
              background:T.content,borderRadius:6,border:`1px solid ${T.border}`,
            }}>
              ℹ️ All notices sent automatically. No personal contact needed.
            </div>
          </div>

          <div style={S.card()}>
            <div style={S.cardTitle}>⚖ Legal Standing</div>
            {[
              { label:"MSMED Act Section 15", val:"45-day limit VIOLATED", color:T.red },
              { label:"Formal Demand Made",   val:"Yes — 3 notices sent", color:T.green },
              { label:"Evidence Trail",        val:"Digitally timestamped", color:T.green },
              { label:"Samadhaan Eligible",    val:"Yes (after Day 67)", color:T.amber },
            ].map(row => (
              <div key={row.label} style={{
                display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"9px 0",borderBottom:`1px solid ${T.border}`,
              }}>
                <span style={{fontSize:12,color:T.muted}}>{row.label}</span>
                <span style={{fontSize:11,fontWeight:700,color:row.color}}>{row.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineScreen({ invoice }) {
  const events = buildTimeline(invoice.invoiceDate);
  const [activeIdx, setActiveIdx] = useState(null);

  return (
    <div style={S.scroll}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:24}}>
        <div style={S.card()}>
          <div style={S.cardTitle}>📅 Day-by-Day Story — {invoice.sellerName} vs {invoice.buyerName}</div>
          <div style={S.tlWrap}>
            <div style={S.tlLine}/>
            {events.map((ev,i) => (
              <div
                key={i} style={{ ...S.tlItem, cursor:"pointer" }}
                onClick={() => setActiveIdx(activeIdx===i ? null : i)}
              >
                <div style={S.tlDot(ev.color, true)}/>
                <div style={{
                  background: activeIdx===i ? `${ev.color}08` : T.white,
                  border: `1px solid ${activeIdx===i ? ev.color+"40" : T.border}`,
                  borderRadius:10, padding:"14px 16px", transition:"all 0.2s",
                }}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div style={{flex:1}}>
                      <div style={S.tlDay}>Day {ev.day} · {ev.date}</div>
                      <div style={{fontSize:14,fontWeight:700,color:ev.color,marginBottom:4}}>
                        {ev.icon} {ev.label}
                      </div>
                      <div style={{...S.statusBadge(ev.status),fontSize:9}}>{ev.status}</div>
                    </div>
                  </div>
                  {activeIdx===i && (
                    <div style={{
                      marginTop:12,paddingTop:12,borderTop:`1px solid ${T.border}`,
                      fontSize:12,color:T.muted,lineHeight:1.6,
                    }}>
                      {ev.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          <div style={S.card()}>
            <div style={S.cardTitle}>🔢 Key Milestones</div>
            {[
              { day:"Day 0",  label:"Invoice uploaded",       color: T.brand },
              { day:"Day 45", label:"Payment deadline",        color: T.amber },
              { day:"Day 46", label:"Interest starts (3×RBI)", color: T.red   },
              { day:"Day 60", label:"Formal legal notice",     color: T.red   },
              { day:"Day 67", label:"Portal filing warning",   color:"#7C3AED"},
              { day:"Day 68", label:"Payment received ✓",      color: T.green },
            ].map(m => (
              <div key={m.day} style={{
                display:"flex",alignItems:"center",gap:12,
                padding:"8px 0",borderBottom:`1px solid ${T.border}`,
              }}>
                <span style={{
                  fontFamily:"'Courier New',monospace",fontSize:11,fontWeight:700,
                  color:m.color,minWidth:52,
                }}>{m.day}</span>
                <span style={{fontSize:12,color:T.muted}}>{m.label}</span>
              </div>
            ))}
          </div>

          <div style={{
            ...S.card(),
            background:`linear-gradient(135deg,#F0FDF4,#ECFDF5)`,
            border:`1px solid rgba(16,185,129,0.25)`,
          }}>
            <div style={S.cardTitle}>🏆 Outcome</div>
            <div style={{fontSize:13,color:"#166534",lineHeight:1.7}}>
              <strong>Payment received ₹5,12,400</strong> — the full principal
              plus statutory interest — without a single awkward conversation.
            </div>
            <div style={{
              marginTop:12,padding:"10px 12px",background:"rgba(16,185,129,0.1)",
              borderRadius:8,fontSize:12,color:"#15803D",
            }}>
              💬 <em>"The system handled the pressure for me."</em>
              <div style={{fontSize:11,color:T.muted,marginTop:4}}>— MSME Seller</div>
            </div>
          </div>

          <div style={S.card()}>
            <div style={S.cardTitle}>📖 Legal Basis</div>
            <div style={{fontSize:12,color:T.muted,lineHeight:1.7}}>
              <strong style={{color:T.ink}}>Section 15</strong> — Max 45 days payment window<br/>
              <strong style={{color:T.ink}}>Section 16</strong> — 3× RBI compound interest from Day 46<br/>
              <strong style={{color:T.ink}}>Section 18</strong> — Right to file at MSME Council<br/>
              <strong style={{color:T.ink}}>MSME Samadhaan</strong> — Government dispute portal
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  CHAT WIDGET — RAG Legal Assistant
// ─────────────────────────────────────────────

const CHAT_SUGGESTIONS = [
  "What's my right if buyer delays beyond 90 days?",
  "Can I claim compound interest?",
  "What's the process to file in MSME Samadhaan?",
  "What is Section 16 of MSMED Act?",
  "Do I need Udyam Registration?",
  "How is the interest rate calculated?",
];

function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages, loading]);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const sendMessage = async (question) => {
    if (!question.trim()) return;

    const userMsg = { role: "user", text: question.trim(), time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setShowSuggestions(false);

    try {
      const res = await fetch("http://localhost:5000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const json = await res.json();

      if (json.ok && json.data) {
        const botMsg = {
          role: "bot",
          text: json.data.answer || "I couldn't find an answer.",
          sources: json.data.sources || [],
          time: new Date(),
        };
        setMessages(prev => [...prev, botMsg]);
      } else {
        setMessages(prev => [...prev, {
          role: "bot",
          text: json.error || "Sorry, something went wrong. Please try again.",
          sources: [],
          time: new Date(),
        }]);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages(prev => [...prev, {
        role: "bot",
        text: "Could not connect to the server. Make sure the Flask backend is running with GEMINI_API_KEY set.",
        sources: [],
        time: new Date(),
      }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Simple markdown-like formatting for bold text
  const formatText = (text) => {
    if (!text) return "";
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const chatStyles = {
    // Floating bubble button
    bubble: {
      position: "fixed", bottom: 24, right: 24, width: 58, height: 58,
      borderRadius: "50%", background: `linear-gradient(135deg, ${T.brand}, ${T.brandDim})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", boxShadow: "0 4px 20px rgba(0,201,184,0.4)",
      border: "none", zIndex: 1000, transition: "all 0.3s ease",
      fontSize: 26, color: T.white,
    },
    // Chat panel
    panel: {
      position: "fixed", bottom: 96, right: 24, width: 400, height: 550,
      background: T.white, borderRadius: 18, zIndex: 1000,
      boxShadow: "0 12px 48px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)",
      display: "flex", flexDirection: "column", overflow: "hidden",
      animation: "slideUp 0.3s ease",
    },
    // Header
    header: {
      padding: "18px 20px", background: `linear-gradient(135deg, ${T.sidebar}, #162B4D)`,
      display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
    },
    headerIcon: {
      width: 38, height: 38, borderRadius: "50%",
      background: `linear-gradient(135deg, ${T.brand}, ${T.brandDim})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 18, flexShrink: 0,
    },
    headerTitle: { fontWeight: 700, fontSize: 15, color: T.white, letterSpacing: "-0.2px" },
    headerSub: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 1 },
    closeBtn: {
      marginLeft: "auto", background: "rgba(255,255,255,0.1)", border: "none",
      color: "rgba(255,255,255,0.6)", width: 28, height: 28, borderRadius: "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", fontSize: 14, transition: "all 0.15s",
    },
    // Messages area
    messagesArea: {
      flex: 1, overflowY: "auto", padding: "16px 16px 8px", background: "#F8FAFC",
    },
    // Message bubbles
    userBubble: {
      maxWidth: "82%", padding: "10px 14px", borderRadius: "14px 14px 4px 14px",
      background: `linear-gradient(135deg, ${T.brand}, ${T.brandDim})`,
      color: T.white, fontSize: 13, lineHeight: 1.5, marginBottom: 12,
      marginLeft: "auto", wordBreak: "break-word",
    },
    botBubble: {
      maxWidth: "88%", padding: "12px 14px", borderRadius: "14px 14px 14px 4px",
      background: T.white, color: T.ink, fontSize: 13, lineHeight: 1.6,
      marginBottom: 12, border: `1px solid ${T.border}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)", wordBreak: "break-word",
    },
    // Typing indicator
    typing: {
      display: "flex", gap: 4, padding: "10px 14px", maxWidth: 80,
      borderRadius: "14px 14px 14px 4px", background: T.white,
      border: `1px solid ${T.border}`, marginBottom: 12,
    },
    typingDot: (delay) => ({
      width: 7, height: 7, borderRadius: "50%", background: T.muted,
      animation: `pulse 1.2s ease-in-out ${delay}s infinite`,
    }),
    // Sources
    sourceTag: {
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", background: "rgba(0,201,184,0.08)",
      borderRadius: 6, fontSize: 10, color: T.brandDim, fontWeight: 600,
      border: `1px solid rgba(0,201,184,0.15)`, marginRight: 4, marginTop: 6,
    },
    // Suggestions
    suggestion: {
      padding: "8px 12px", background: T.white, borderRadius: 10,
      border: `1px solid ${T.border}`, fontSize: 12, color: T.ink,
      cursor: "pointer", transition: "all 0.15s", textAlign: "left",
      lineHeight: 1.4,
    },
    // Input area
    inputArea: {
      padding: "12px 16px", borderTop: `1px solid ${T.border}`,
      background: T.white, display: "flex", gap: 8, alignItems: "center", flexShrink: 0,
    },
    chatInput: {
      flex: 1, padding: "10px 14px", borderRadius: 10,
      border: `1px solid ${T.border}`, fontSize: 13, outline: "none",
      color: T.ink, background: "#F8FAFC", transition: "border 0.15s",
    },
    sendBtn: {
      width: 38, height: 38, borderRadius: "50%", border: "none",
      background: `linear-gradient(135deg, ${T.brand}, ${T.brandDim})`,
      color: T.white, cursor: "pointer", display: "flex",
      alignItems: "center", justifyContent: "center", fontSize: 16,
      flexShrink: 0, transition: "all 0.15s",
      boxShadow: "0 2px 8px rgba(0,201,184,0.3)",
    },
  };

  return (
    <>
      {/* CSS Animations */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes bubblePop {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* Chat Panel */}
      {open && (
        <div style={chatStyles.panel}>
          {/* Header */}
          <div style={chatStyles.header}>
            <div style={chatStyles.headerIcon}>⚖️</div>
            <div>
              <div style={chatStyles.headerTitle}>Digital-Vakeel AI</div>
              <div style={chatStyles.headerSub}>Legal Assistant · Powered by Gemini</div>
            </div>
            <button
              style={chatStyles.closeBtn}
              onClick={() => setOpen(false)}
              onMouseOver={e => e.target.style.background = "rgba(255,255,255,0.2)"}
              onMouseOut={e => e.target.style.background = "rgba(255,255,255,0.1)"}
            >✕</button>
          </div>

          {/* Messages */}
          <div style={chatStyles.messagesArea}>
            {/* Welcome message */}
            {messages.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>⚖️</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 6 }}>
                  Hi! I'm your Legal Assistant
                </div>
                <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6, marginBottom: 20 }}>
                  Ask me anything about MSME payment rights,<br/>
                  interest calculations, or legal remedies.
                </div>

                {showSuggestions && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: "0.5px",
                                  textTransform: "uppercase", marginBottom: 4 }}>
                      Suggested Questions
                    </div>
                    {CHAT_SUGGESTIONS.map((q, i) => (
                      <div
                        key={i}
                        style={chatStyles.suggestion}
                        onClick={() => sendMessage(q)}
                        onMouseOver={e => {
                          e.target.style.borderColor = T.brand;
                          e.target.style.background = "rgba(0,201,184,0.04)";
                        }}
                        onMouseOut={e => {
                          e.target.style.borderColor = T.border;
                          e.target.style.background = T.white;
                        }}
                      >
                        💬 {q}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Message list */}
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column",
                                    alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                {msg.role === "user" ? (
                  <div style={chatStyles.userBubble}>{msg.text}</div>
                ) : (
                  <div style={chatStyles.botBubble}>
                    <div style={{ whiteSpace: "pre-wrap" }}>{formatText(msg.text)}</div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div style={{ marginTop: 8, borderTop: `1px solid ${T.border}`, paddingTop: 6 }}>
                        <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>Sources:</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {msg.sources.map((s, j) => (
                            <span key={j} style={chatStyles.sourceTag}>
                              📄 {s.document.replace('.txt', '')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div style={chatStyles.typing}>
                <div style={chatStyles.typingDot(0)} />
                <div style={chatStyles.typingDot(0.15)} />
                <div style={chatStyles.typingDot(0.3)} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={chatStyles.inputArea}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask about MSME payment rights..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              style={{
                ...chatStyles.chatInput,
                opacity: loading ? 0.6 : 1,
              }}
              onFocus={e => e.target.style.borderColor = T.brand}
              onBlur={e => e.target.style.borderColor = T.border}
            />
            <button
              style={{
                ...chatStyles.sendBtn,
                opacity: (!input.trim() || loading) ? 0.5 : 1,
                cursor: (!input.trim() || loading) ? "not-allowed" : "pointer",
              }}
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
            >
              ➤
            </button>
          </div>
        </div>
      )}

      {/* Floating Bubble */}
      <button
        style={chatStyles.bubble}
        onClick={() => setOpen(!open)}
        onMouseOver={e => e.target.style.transform = "scale(1.1)"}
        onMouseOut={e => e.target.style.transform = "scale(1)"}
        title="Chat with Legal AI Assistant"
      >
        {open ? "✕" : "⚖️"}
      </button>
    </>
  );
}


// ─────────────────────────────────────────────
//  ROOT APP
// ─────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]   = useState("upload");
  const [invoice, setInvoice] = useState(DUMMY_INVOICE);

  const screenTitles = {
    upload:    { title:"Upload Invoice",  sub:"Digitise and register a new invoice for monitoring" },
    dashboard: { title:"Invoice Dashboard", sub:`Monitoring: ${invoice.invoiceNo} · ${invoice.sellerName} → ${invoice.buyerName}` },
    timeline:  { title:"Case Timeline",   sub:"Full day-by-day story of this invoice" },
  };
  const t = screenTitles[screen];

  const handleUploadSubmit = async (data) => {
    try {
      const res = await fetch("http://localhost:5000/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("Invoice upload failed");
      const result = await res.json();

      setInvoice({
        id: result.data.id,
        invoiceNo: result.data.invoice_no,
        invoiceDate: result.data.invoice_date,
        sellerName: result.data.seller_name,
        buyerName: result.data.buyer_name,
        amount: result.data.amount,
        paid: result.data.paid,
        buyerGstin: result.data.buyer_gstin,
        buyerContact: result.data.buyer_contact,
        udyamId: result.data.udyam_id,
      });

      setTimeout(() => setScreen("dashboard"), 1200);
      return true;
    } catch (err) {
      console.error(err);
      alert("Failed to upload invoice");
      return false;
    }
  };

  return (
    <div style={S.app}>
      <Sidebar screen={screen} setScreen={setScreen}/>
      <div style={S.main}>
        <div style={S.topbar}>
          <div>
            <div style={S.topTitle}>{t.title}</div>
            <div style={S.topSub}>{t.sub}</div>
          </div>
          <div style={S.topRight}>
            <span style={S.topBadge}>⚡ Live Demo</span>
            <div style={{
              width:32,height:32,borderRadius:"50%",
              background:`linear-gradient(135deg,${T.brand},${T.brandDim})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:14,color:T.white,fontWeight:700,
            }}>A</div>
          </div>
        </div>

        {screen === "upload"    && <UploadScreen    onSubmit={handleUploadSubmit}/>}
        {screen === "dashboard" && <DashboardScreen invoice={invoice}/>}
        {screen === "timeline"  && <TimelineScreen  invoice={invoice}/>}
      </div>

      {/* RAG Legal Assistant Chat Widget */}
      <ChatWidget />
    </div>
  );
}
