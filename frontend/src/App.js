import { useState, useEffect, useRef } from "react";
import {
  extractInvoicePDF, createInvoice, getAllInvoices, markPaid,
  login, signup, logout, getToken, getStoredUser,
  sendChatMessage, getChatHistory, clearChatHistory,
  sendNotice, getNotices, exportCasePDF,
} from './api';

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
// eslint-disable-next-line no-unused-vars
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

// eslint-disable-next-line no-unused-vars
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
    pointerEvents:"none", animation:"rotateglow 20s linear infinite",
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
//  LEGAL MODALS
// ─────────────────────────────────────────────

const MSMED_SECTIONS = [
  {
    id:"s15", icon:"⏱️", color:"#F59E0B",
    title:"Section 15 — Payment Obligation",
    badge:"45-Day Rule",
    text:`Every buyer who buys goods or avails services from a micro or small enterprise shall make payment within 45 days from the day of acceptance of the goods/services. If there is no written agreement specifying a payment period, the buyer must pay within 15 days of delivery. Any agreement for payment beyond 45 days is void with respect to the MSME seller's rights.`,
    highlight:"Key: 45 days is the MAXIMUM. No contract can extend this for an MSME seller.",
  },
  {
    id:"s16", icon:"📈", color:"#EF4444",
    title:"Section 16 — Compound Interest on Delay",
    badge:"19.5% p.a.",
    text:`Where any buyer fails to make payment to a micro or small enterprise within the period specified under Section 15, the buyer shall, notwithstanding anything contained in any agreement, be liable to pay compound interest with monthly rests at three times the bank rate notified by the Reserve Bank of India. This interest accrues from the appointed day (Day 46 from delivery).`,
    highlight:"Current RBI rate: 6.5% × 3 = 19.5% per annum compounded monthly.",
  },
  {
    id:"s17", icon:"⚖️", color:"#7C3AED",
    title:"Section 17 — Right to Recover",
    badge:"Recovery Right",
    text:`For the purpose of any suit or application before any court for recovery of any amount due under this Act, the court or authority shall not entertain any suit or application unless the buyer furnishes proof of deposit of seventy-five percent of the amount due, including interest thereon. This is a powerful protection — the buyer must pay 75% upfront even before contesting.`,
    highlight:"Key: Buyer must deposit 75% of dues before any legal challenge is entertained.",
  },
  {
    id:"s18", icon:"🏛️", color:"#0EA5E9",
    title:"Section 18 — MSME Facilitation Council",
    badge:"File Complaint",
    text:`Any party to a dispute regarding any amount due under this Act may make a reference to the Micro and Small Enterprises Facilitation Council. On receiving a reference, the Council shall conduct conciliation and, if conciliation fails, take up the dispute for arbitration as if it were the arbitration tribunal under the Arbitration and Conciliation Act, 1996.`,
    highlight:"Filing on Samadhaan portal initiates this Section 18 process automatically.",
  },
  {
    id:"s19", icon:"🔒", color:"#10B981",
    title:"Section 19 — Application for Setting Aside Decree",
    badge:"Court Defence",
    text:`No application for setting aside any decree or award passed by the Facilitation Council shall be entertained by any court unless the appellant has deposited seventy-five per cent of the amount in terms of the decree or award. This further strengthens the MSME seller's position during appeals.`,
    highlight:"Double protection: 75% deposit required at both filing AND appeal stage.",
  },
];

function MsmedActModal({ onClose }) {
  const [open, setOpen] = useState(null);
  return (
    <div style={{
      position:"fixed", inset:0, zIndex:1000,
      background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)",
      display:"flex", alignItems:"center", justifyContent:"flex-end",
      animation:"fadeIn 0.2s ease",
    }} onClick={onClose}>
      <div style={{
        width:520, height:"100vh", background:T.white,
        overflowY:"auto", boxShadow:"-8px 0 40px rgba(0,0,0,0.2)",
        animation:"slideInRight 0.25s ease",
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          background:`linear-gradient(135deg,#0C1A2E,#1A2744)`,
          padding:"28px 28px 20px", position:"sticky", top:0, zIndex:1,
        }}>
          <button onClick={onClose} style={{
            position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.08)",
            border:"none",color:"rgba(255,255,255,0.6)",width:32,height:32,
            borderRadius:"50%",cursor:"pointer",fontSize:18,display:"flex",
            alignItems:"center",justifyContent:"center",
          }}>×</button>
          <div style={{fontSize:11,color:T.brand,fontWeight:700,letterSpacing:"1px",marginBottom:6}}>LEGAL REFERENCE</div>
          <div style={{fontSize:22,fontWeight:800,color:T.white,marginBottom:4}}>📋 MSMED Act 2006</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",lineHeight:1.5}}>
            Micro, Small & Medium Enterprises Development Act, 2006<br/>
            Key sections relevant to delayed payment enforcement.
          </div>
        </div>
        {/* Sections */}
        <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:10}}>
          {MSMED_SECTIONS.map(s => (
            <div key={s.id} style={{
              border:`1px solid ${open===s.id ? s.color+"60" : T.border}`,
              borderRadius:10, overflow:"hidden",
              background: open===s.id ? s.color+"04" : T.white,
              transition:"all 0.2s",
            }}>
              <div
                onClick={() => setOpen(open===s.id ? null : s.id)}
                style={{
                  display:"flex",alignItems:"center",gap:12,
                  padding:"14px 16px",cursor:"pointer",
                }}
              >
                <span style={{fontSize:22}}>{s.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.ink}}>{s.title}</div>
                </div>
                <span style={{
                  fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:100,
                  background:s.color+"15",color:s.color,border:`1px solid ${s.color}30`,
                  whiteSpace:"nowrap",
                }}>{s.badge}</span>
                <span style={{color:T.muted,fontSize:16,transition:"transform 0.2s",
                  transform: open===s.id ? "rotate(90deg)" : "none"}}>
                  ›
                </span>
              </div>
              {open===s.id && (
                <div style={{padding:"0 16px 16px"}}>
                  <p style={{fontSize:13,color:T.muted,lineHeight:1.7,margin:"0 0 12px"}}>
                    {s.text}
                  </p>
                  <div style={{
                    background:s.color+"10",border:`1px solid ${s.color}30`,
                    borderRadius:8,padding:"10px 12px",
                    fontSize:12,fontWeight:600,color:s.color,
                  }}>💡 {s.highlight}</div>
                </div>
              )}
            </div>
          ))}
          {/* Footer link */}
          <a
            href="https://legislative.gov.in/sites/default/files/A2006-27.pdf"
            target="_blank" rel="noreferrer"
            style={{
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              marginTop:8,padding:"12px",borderRadius:10,
              background:T.content,border:`1px solid ${T.border}`,
              fontSize:12,fontWeight:600,color:T.brand,textDecoration:"none",
            }}
          >
            📄 View Full Act PDF (Legislative Dept. of India) →
          </a>
        </div>
      </div>
    </div>
  );
}

const SAMADHAAN_STEPS = [
  { step:1, icon:"📁", color:"#0EA5E9", title:"Gather Documents",
    items:["Original invoice copy (PDF)","Proof of delivery / acceptance","Udyam Registration Certificate","Any payment correspondence / emails","Bank statements showing non-receipt"] },
  { step:2, icon:"🌐", color:"#7C3AED", title:"Register on Samadhaan Portal",
    items:["Go to samadhaan.msme.gov.in","Click 'MSME' → Register with your Udyam number","Verify mobile OTP & set password","Login to your dashboard"] },
  { step:3, icon:"📝", color:"#F59E0B", title:"File the Application",
    items:["Click 'File New Case'","Enter buyer company details & GSTIN","Enter invoice number, date & amount","Upload invoice PDF and evidence documents","Declare the amount with interest as calculated"] },
  { step:4, icon:"⚖️", color:"#10B981", title:"Facilitation Council Process",
    items:["Receive case reference number (keep this!)","Council notifies buyer within 15 days","Conciliation meeting scheduled (usually within 45 days)","If resolved: payment order issued","If not resolved: automatic arbitration begins"] },
  { step:5, icon:"✅", color:"#10B981", title:"Award & Recovery",
    items:["Arbitration award passed (enforceable as court decree)","Buyer must deposit 75% to challenge (Section 19)","File execution petition if buyer defaults on award","Interest continues to accrue until full payment"] },
];

function SamadhaaModal({ onClose, invoice }) {
  const [checklist, setChecklist] = useState({});
  const toggleCheck = (key) => setChecklist(c => ({...c, [key]: !c[key]}));
  const totalItems = SAMADHAAN_STEPS.reduce((a, s) => a + s.items.length, 0);
  const checked    = Object.values(checklist).filter(Boolean).length;
  const pct        = Math.round((checked / totalItems) * 100);

  return (
    <div style={{
      position:"fixed",inset:0,zIndex:1000,
      background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",
      display:"flex",alignItems:"center",justifyContent:"flex-end",
    }} onClick={onClose}>
      <div style={{
        width:520,height:"100vh",background:T.white,
        overflowY:"auto",boxShadow:"-8px 0 40px rgba(0,0,0,0.2)",
        animation:"slideInRight 0.25s ease",
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          background:`linear-gradient(135deg,#1e1b4b,#312e81)`,
          padding:"28px 28px 20px",position:"sticky",top:0,zIndex:1,
        }}>
          <button onClick={onClose} style={{
            position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.08)",
            border:"none",color:"rgba(255,255,255,0.6)",width:32,height:32,
            borderRadius:"50%",cursor:"pointer",fontSize:18,display:"flex",
            alignItems:"center",justifyContent:"center",
          }}>×</button>
          <div style={{fontSize:11,color:"#A78BFA",fontWeight:700,letterSpacing:"1px",marginBottom:6}}>GOVERNMENT PORTAL GUIDE</div>
          <div style={{fontSize:22,fontWeight:800,color:T.white,marginBottom:4}}>🏛️ MSME Samadhaan</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",lineHeight:1.5,marginBottom:14}}>
            Step-by-step guide to filing a delayed payment complaint under Section 18, MSMED Act 2006.
          </div>
          {/* Progress bar */}
          <div style={{background:"rgba(255,255,255,0.1)",borderRadius:100,height:6}}>
            <div style={{
              width:`${pct}%`,height:6,borderRadius:100,
              background:`linear-gradient(90deg,#A78BFA,#7C3AED)`,transition:"width 0.3s",
            }}/>
          </div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:4}}>
            {checked}/{totalItems} steps completed · {pct}% ready to file
          </div>
        </div>
        {/* Steps */}
        <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:16}}>
          {SAMADHAAN_STEPS.map(s => (
            <div key={s.step} style={{
              border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",
            }}>
              <div style={{
                display:"flex",alignItems:"center",gap:10,
                padding:"12px 14px",background:s.color+"08",
                borderBottom:`1px solid ${s.color}25`,
              }}>
                <div style={{
                  width:28,height:28,borderRadius:"50%",
                  background:s.color+"20",border:`1px solid ${s.color}40`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:14,fontWeight:800,color:s.color,flexShrink:0,
                }}>{s.step}</div>
                <span style={{fontSize:18}}>{s.icon}</span>
                <div style={{fontSize:13,fontWeight:700,color:T.ink}}>{s.title}</div>
              </div>
              <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:6}}>
                {s.items.map((item, i) => {
                  const key = `${s.step}-${i}`;
                  return (
                    <label key={key} style={{
                      display:"flex",alignItems:"flex-start",gap:8,
                      cursor:"pointer",fontSize:12,color: checklist[key] ? T.muted : T.ink,
                      textDecoration: checklist[key] ? "line-through" : "none",
                      transition:"all 0.15s",
                    }}>
                      <input
                        type="checkbox"
                        checked={!!checklist[key]}
                        onChange={() => toggleCheck(key)}
                        style={{marginTop:2,accentColor:s.color,flexShrink:0}}
                      />
                      {item}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {/* CTA buttons */}
          <a
            href="https://samadhaan.msme.gov.in"
            target="_blank" rel="noreferrer"
            style={{
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              padding:"13px",borderRadius:10,
              background:`linear-gradient(135deg,#7C3AED,#6D28D9)`,
              fontSize:13,fontWeight:700,color:T.white,textDecoration:"none",
              boxShadow:"0 4px 12px rgba(124,58,237,0.3)",
            }}
          >
            🏛️ Open MSME Samadhaan Portal →
          </a>
          <a
            href="https://msme.gov.in/"
            target="_blank" rel="noreferrer"
            style={{
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              padding:"11px",borderRadius:10,
              background:T.content,border:`1px solid ${T.border}`,
              fontSize:12,fontWeight:600,color:T.muted,textDecoration:"none",
            }}
          >
            🌐 Official MSME Ministry Website
          </a>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  SIDEBAR
// ─────────────────────────────────────────────

function Sidebar({ screen, setScreen, user, onLogout }) {
  const [showMsmed,     setShowMsmed]     = useState(false);
  const [showSamadhaan, setShowSamadhaan] = useState(false);
  const navItems = [
    { id:"upload",    icon:"📤", label:"Upload Invoice" },
    { id:"invoices",  icon:"📋", label:"My Invoices" },
  ];
  return (
    <>
    {showMsmed     && <MsmedActModal  onClose={() => setShowMsmed(false)} />}
    {showSamadhaan && <SamadhaaModal  onClose={() => setShowSamadhaan(false)} />}
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
        <div style={S.sideSection}>Legal Resources</div>
        <div style={{
          ...S.navItem(false), position:"relative",
          color:"rgba(255,255,255,0.55)",
        }}
          onClick={() => setShowMsmed(true)}
        >
          <span style={S.navIcon}>📋</span> MSMED Act 2006
        </div>
        <div style={{
          ...S.navItem(false),
          color:"rgba(255,255,255,0.55)",
        }}
          onClick={() => setShowSamadhaan(true)}
        >
          <span style={S.navIcon}>🏛️</span> Samadhaan Portal
          <span style={{
            marginLeft:"auto",fontSize:9,padding:"2px 6px",borderRadius:100,
            background:"rgba(124,58,237,0.2)",color:"#C4B5FD",
            border:"1px solid rgba(124,58,237,0.25)",
          }}>Guide</span>
        </div>
      </div>
      {/* User info + Logout */}
      <div style={{
        padding:"16px 20px", borderTop:"1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:12}}>
          <div style={{
            width:36, height:36, borderRadius:"50%",
            background:`linear-gradient(135deg,${T.brand},${T.brandDim})`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:14, color:T.white, fontWeight:700, flexShrink:0,
          }}>{user?.name?.[0]?.toUpperCase() || "U"}</div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, color:"rgba(255,255,255,0.85)", fontWeight:600,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{user?.name}</div>
            <div style={{fontSize:10, color:"rgba(255,255,255,0.35)",
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{user?.email}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{
          width:"100%", padding:"9px 0", borderRadius:8, fontSize:12, fontWeight:600,
          background:"rgba(239,68,68,0.1)", color:"#F87171",
          border:"1px solid rgba(239,68,68,0.2)", cursor:"pointer",
          transition:"all 0.15s", display:"flex", alignItems:"center",
          justifyContent:"center", gap:6, letterSpacing:"0.3px",
        }}
          onMouseOver={e => { e.currentTarget.style.background="rgba(239,68,68,0.2)"; e.currentTarget.style.color="#FCA5A5"; }}
          onMouseOut={e => { e.currentTarget.style.background="rgba(239,68,68,0.1)"; e.currentTarget.style.color="#F87171"; }}
        >🚪 Logout</button>
      </div>
    </div>
    </>
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

// ── INVOICE LIST SCREEN ─────────────────────────
function InvoiceListScreen({ onSelectInvoice, onRefresh }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getAllInvoices();
        setInvoices(data || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [onRefresh]);

  return (
    <div style={S.scroll}>
      {loading ? (
        <div style={{textAlign:"center",padding:60,color:T.muted,fontSize:14}}>Loading invoices...</div>
      ) : invoices.length === 0 ? (
        <div style={{textAlign:"center",padding:60}}>
          <div style={{fontSize:48,marginBottom:12}}>📭</div>
          <div style={{fontWeight:700,fontSize:18,color:T.ink,marginBottom:8}}>No Invoices Yet</div>
          <div style={{fontSize:13,color:T.muted}}>Upload your first invoice to start monitoring payments.</div>
        </div>
      ) : (
        <>
          <div style={{marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontWeight:700,fontSize:16,color:T.ink}}>
              {invoices.length} Invoice{invoices.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div style={S.card({padding:0,overflow:"hidden"})}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:T.content,borderBottom:`2px solid ${T.border}`}}>
                  {["Invoice No.","Seller","Buyer","Date","Amount (₹)","Status",""].map(h => (
                    <th key={h} style={{
                      padding:"12px 16px",textAlign:"left",fontSize:11,fontWeight:700,
                      color:T.muted,letterSpacing:"0.5px",textTransform:"uppercase",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const info = calcStatus(inv.invoice_date, inv.paid, inv.amount);
                  return (
                    <tr key={inv.id} style={{
                      borderBottom:`1px solid ${T.border}`,cursor:"pointer",transition:"background 0.15s",
                    }}
                      onMouseOver={e => e.currentTarget.style.background="rgba(0,201,184,0.03)"}
                      onMouseOut={e => e.currentTarget.style.background="transparent"}
                      onClick={() => onSelectInvoice(inv)}
                    >
                      <td style={{padding:"14px 16px",fontWeight:600,color:T.ink}}>{inv.invoice_no}</td>
                      <td style={{padding:"14px 16px",color:T.ink}}>{inv.seller_name}</td>
                      <td style={{padding:"14px 16px",color:T.ink}}>{inv.buyer_name}</td>
                      <td style={{padding:"14px 16px",color:T.muted}}>
                        {new Date(inv.invoice_date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}
                      </td>
                      <td style={{padding:"14px 16px",fontWeight:600,color:T.ink}}>
                        ₹{Number(inv.amount).toLocaleString("en-IN")}
                      </td>
                      <td style={{padding:"14px 16px"}}>
                        <span style={S.statusBadge(info.status)}>{info.status}</span>
                      </td>
                      <td style={{padding:"14px 16px",color:T.brand,fontSize:18}}>→</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── DASHBOARD SCREEN ──────────────────────────────
function DashboardScreen({ invoice, onBack }) {
  // buildTimeline available for future timeline screen
  const paid = invoice.paid === true;
  const liveInfo = calcStatus(invoice.invoiceDate, paid, invoice.amount);

  // ── Notice state ──
  const [notices, setNotices] = useState([]);
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [noticeResult, setNoticeResult] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  // Load real notices from DB
  useEffect(() => {
    (async () => {
      try {
        const data = await getNotices(invoice.id);
        setNotices(data?.notices || []);
      } catch (e) { console.error(e); }
    })();
  }, [invoice.id]);

  const handleSendNotice = async () => {
    setNoticeLoading(true);
    setNoticeResult(null);
    try {
      const tmpl = selectedTemplate ? Number(selectedTemplate) : null;
      const res = await sendNotice(invoice.id, tmpl, ["email"]);
      const sent = res?.results?.email;
      if (sent?.success) {
        setNoticeResult({ ok: true, msg: `✅ Email sent! Template ${res.template_no}` });
      } else {
        setNoticeResult({ ok: false, msg: `❌ Failed: ${sent?.error || "Unknown error"}` });
      }
      const updated = await getNotices(invoice.id);
      setNotices(updated?.notices || []);
    } catch (e) {
      setNoticeResult({ ok: false, msg: `❌ Error: ${e.message}` });
    }
    setNoticeLoading(false);
  };

  const handleExportPDF = async () => {
    setPdfLoading(true);
    try { await exportCasePDF(invoice.id); }
    catch (e) { alert("PDF failed: " + e.message); }
    setPdfLoading(false);
  };

  const handleMarkPaid = async () => {
    try {
      await markPaid(invoice.id, liveInfo.total);
      if (onBack) onBack();
      else window.location.reload();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const statusColor = {
    "ACTIVE":"#1D4ED8","DUE TODAY":T.amber,"DUE SOON":T.amber,
    "OVERDUE":T.red,"LEGAL NOTICE SENT":"#7C3AED","ESCALATION":"#9F1239","PAID":T.green,
  }[liveInfo.status] || T.brand;

  const noticeColor = (type) => type === "whatsapp" ? "#25D366" : T.brand;
  const noticeIcon  = (type) => type === "whatsapp" ? "💬" : "📧";


  return (
    <div style={S.scroll}>
      {onBack && (
        <button onClick={onBack} style={{
          ...S.btnGhost, marginBottom:16, fontSize:12, padding:"8px 16px",
        }}>← Back to Invoices</button>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
        <div className="dash-card" style={S.statBox(statusColor)}>
          <div style={S.statLabel}>Current Status</div>
          <div style={{marginTop:6}}><span style={S.statusBadge(liveInfo.status)}>{liveInfo.status}</span></div>
          <div style={S.statSub}>{liveInfo.daysOverdue > 0 ? `${liveInfo.daysOverdue} days overdue` : liveInfo.daysUntilDue > 0 ? `${liveInfo.daysUntilDue} days remaining` : "Due today"}</div>
        </div>
        <div className="dash-card" style={S.statBox(T.ink)}>
          <div style={S.statLabel}>Principal Amount</div>
          <div style={S.statValue(T.ink)}>₹{(invoice.amount/100000).toFixed(1)}L</div>
          <div style={S.statSub}>{invoice.invoiceNo}</div>
        </div>
        <div className="dash-card" style={S.statBox(T.red)}>
          <div style={S.statLabel}>Interest Accrued</div>
          <div style={S.statValue(paid ? T.green : liveInfo.interest > 0 ? T.red : T.muted)}>
            ₹{liveInfo.interest.toLocaleString("en-IN")}
          </div>
          <div style={S.statSub}>@ 19.5% p.a. (3× RBI)</div>
        </div>
        <div className="dash-card" style={S.statBox(paid ? T.green : T.amber)}>
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
            <div style={S.cardTitle}>📬 Legal Notices</div>

            {/* ── Send Notice ── */}
            {!paid && (
              <div style={{
                background:"rgba(0,201,184,0.04)", border:`1px solid rgba(0,201,184,0.2)`,
                borderRadius:10, padding:14, marginBottom:16,
              }}>
                <div style={{fontSize:11,fontWeight:700,color:T.brand,marginBottom:8,
                  letterSpacing:"0.5px",textTransform:"uppercase"}}>📤 Send Email Notice</div>
                <select
                  value={selectedTemplate}
                  onChange={e => setSelectedTemplate(e.target.value)}
                  style={{
                    width:"100%", padding:"8px 10px", borderRadius:7,
                    border:`1px solid ${T.border}`, fontSize:11, color:T.ink,
                    marginBottom:10, background:T.white, outline:"none",
                  }}
                >
                  <option value="">Auto-pick by overdue days</option>
                  <option value="1">Template 1 — Soft Reminder</option>
                  <option value="2">Template 2 — Formal Legal Notice</option>
                  <option value="3">Template 3 — Final Escalation</option>
                </select>
                <button
                  style={{
                    ...S.btnPrimary, width:"100%", fontSize:12, padding:"9px",
                    opacity: noticeLoading ? 0.6 : 1,
                  }}
                  onClick={handleSendNotice}
                  disabled={noticeLoading}
                >
                  {noticeLoading ? "Sending..." : "📧 Send Email Notice"}
                </button>
                {noticeResult && (
                  <div style={{
                    marginTop:8, padding:"8px 10px", borderRadius:6,
                    fontSize:11, fontWeight:600,
                    background: noticeResult.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                    color: noticeResult.ok ? T.green : T.red,
                    border: `1px solid ${noticeResult.ok ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
                  }}>{noticeResult.msg}</div>
                )}
              </div>
            )}

            {/* ── Notice History ── */}
            <div style={{fontSize:10,fontWeight:700,color:T.muted,marginBottom:8,
              letterSpacing:"0.5px",textTransform:"uppercase"}}>📜 History</div>
            {notices.length === 0 ? (
              <div style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"6px 0"}}>
                No notices sent yet.
              </div>
            ) : notices.map((n, i) => (
              <div key={i} style={S.notifPill(noticeColor(n.type))}>
                <span style={{fontSize:18}}>{noticeIcon(n.type)}</span>
                <div style={{flex:1}}>
                  <div style={S.notifLabel(noticeColor(n.type))}>
                    {n.type.toUpperCase()} · TEMPLATE {n.template_no}
                  </div>
                  <div style={S.notifText}>To: {n.sent_to}</div>
                  <div style={{fontSize:10,color:T.muted}}>
                    {new Date(n.sent_at).toLocaleString("en-IN",{
                      day:"numeric",month:"short",year:"numeric",
                      hour:"2-digit",minute:"2-digit",
                    })}
                  </div>
                </div>
                <span style={{
                  fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:100,
                  background: n.status==="sent" ? `${T.green}20` : `${T.red}20`,
                  color: n.status==="sent" ? T.green : T.red,
                  border:`1px solid ${n.status==="sent" ? T.green+"40" : T.red+"40"}`,
                }}>{n.status.toUpperCase()}</span>
              </div>
            ))}
          </div>


          <div style={S.card()}>
            <div style={S.cardTitle}>⚖ Legal Standing</div>
            {[
              { label:"MSMED Act Section 15", val: liveInfo.daysOverdue > 0 ? "45-day limit VIOLATED" : "Within window", color: liveInfo.daysOverdue > 0 ? T.red : T.green },
              { label:"Days Overdue",         val: liveInfo.daysOverdue > 0 ? `${liveInfo.daysOverdue} days` : "Not yet overdue", color: liveInfo.daysOverdue > 0 ? T.red : T.green },
              { label:"Notices Dispatched",   val: `${notices.length} notice(s)`, color: notices.length > 0 ? T.green : T.muted },
              { label:"Samadhaan Eligible",   val: liveInfo.daysOverdue >= 0 ? "Yes (after Day 45)" : "Not yet", color: T.amber },
            ].map(row => (
              <div key={row.label} style={{
                display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"9px 0",borderBottom:`1px solid ${T.border}`,
              }}>
                <span style={{fontSize:12,color:T.muted}}>{row.label}</span>
                <span style={{fontSize:11,fontWeight:700,color:row.color}}>{row.val}</span>
              </div>
            ))}

            {/* Export PDF button */}
            <button
              onClick={handleExportPDF}
              disabled={pdfLoading}
              style={{
                ...S.btnGhost, width:"100%", marginTop:14, fontSize:12,
                display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                opacity: pdfLoading ? 0.6 : 1,
                borderColor: T.brand, color: T.brand,
              }}
            >
              {pdfLoading ? "Generating PDF..." : "🗂️ Export Case File (PDF)"}
            </button>
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
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages, loading]);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  // Load chat history when widget first opens
  useEffect(() => {
    if (open && !historyLoaded) {
      (async () => {
        try {
          const data = await getChatHistory();
          if (data?.history?.length > 0) {
            const restored = [];
            data.history.forEach(h => {
              restored.push({ role: "user", text: h.question, time: new Date(h.created_at) });
              restored.push({ role: "bot", text: h.answer, sources: h.sources || [], time: new Date(h.created_at) });
            });
            setMessages(restored);
            setShowSuggestions(false);
          }
        } catch (e) { console.error("History load error:", e); }
        setHistoryLoaded(true);
      })();
    }
  }, [open, historyLoaded]);

  const handleClearHistory = async () => {
    try {
      await clearChatHistory();
      setMessages([]);
      setShowSuggestions(true);
    } catch (e) { console.error(e); }
  };

  const sendMessage = async (question) => {
    if (!question.trim()) return;

    const userMsg = { role: "user", text: question.trim(), time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setShowSuggestions(false);

    try {
      const data = await sendChatMessage(question.trim());
      if (data) {
        setMessages(prev => [...prev, {
          role: "bot",
          text: data.answer || "I couldn't find an answer.",
          sources: data.sources || [],
          time: new Date(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: "bot", text: "Sorry, something went wrong.", sources: [], time: new Date(),
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "bot",
        text: err.message || "Could not connect to the server.",
        sources: [], time: new Date(),
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
            <div style={{flex:1}}>
              <div style={chatStyles.headerTitle}>Digital-Vakeel AI</div>
              <div style={chatStyles.headerSub}>Legal Assistant · Powered by Groq</div>
            </div>
            {messages.length > 0 && (
              <button
                style={{...chatStyles.closeBtn, fontSize:12, marginRight:4}}
                onClick={handleClearHistory}
                title="Clear chat history"
              >🗑️</button>
            )}
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
//  AUTH SCREENS
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  AUTH SCREENS (SOVEREIGN INTELLIGENCE - STITCH)
// ─────────────────────────────────────────────

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login"); 
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) return setError("Email is required");
    if (!password) return setError("Password is required");

    setLoading(true);
    try {
      if (mode === "signup") {
        const data = await signup("Sovereign Entity", email.trim(), password);
        onAuth(data.user);
      } else {
        const data = await login(email.trim(), password);
        onAuth(data.user);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="bg-background text-on-background font-body selection:bg-primary/30 min-h-screen flex items-stretch overflow-hidden">
        {/* Split Screen Container */}
        <main className="flex w-full min-h-screen">
            {/* Left Side: Sovereign Intelligence Visuals */}
            <section className="hidden lg:flex lg:w-7/12 relative items-center justify-center p-12 overflow-hidden">
                {/* Background Image with Overlay */}
                <div className="absolute inset-0 z-0">
                    <img alt="Scale of justice" className="w-full h-full object-cover opacity-40 mix-blend-luminosity" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAPjAB2jiJdYnLS_kmfDRmGBYGRwjx5k2GFoRMsU6_N9Ql42tcRlBSTvJlc1kE4g5CTHob995N8-1K9ONiMirQ4xO1RH9L9ERtNWN1LBlZ_9iG4vK69uWUIiXSjrQ_4voQ2Y9jTw8rJKr8WjKjj0gzsQSzCbz02-lB0uStgM7vakC3LJoYSHhcs54BMx58iKNhOvGj4Pbfa3HRnGaT89jjTNdrUePFWDVN4IXodMk7hG3PAhLBQjAAptTxPNFEOz2BVoRYZMfIc8sRi" />
                    <div className="absolute inset-0 bg-gradient-to-br from-background via-background/80 to-primary/10"></div>
                </div>
                {/* Floating Data Points Decorative Elements */}
                <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_15px_#58f4e1]"></div>
                <div className="absolute bottom-1/3 right-1/4 w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce shadow-[0_0_10px_#58f4e1]"></div>
                <div className="absolute top-1/2 right-1/3 w-1 h-1 bg-tertiary-fixed-dim rounded-full shadow-[0_0_8px_#58f4e1]"></div>
                {/* Content Card */}
                <div className="relative z-10 max-w-xl glass-panel p-12 rounded-xl border border-white/5 glow-accent">
                    <div className="mb-8">
                        <span className="text-primary font-label text-sm uppercase tracking-[0.3em] font-bold mb-4 block">Future of Legal Defense</span>
                        <h1 className="text-6xl font-headline font-black tracking-tighter text-on-surface leading-tight">
                            Empowering <br/><span className="text-primary">MSMEs</span>
                        </h1>
                    </div>
                    <p className="text-xl text-on-surface-variant font-light leading-relaxed mb-10 max-w-md">
                        Access elite legal intelligence and sovereign document automation. Digital-Vakeel bridges the gap between complex law and small business growth.
                    </p>
                    <div className="flex items-center gap-6">
                        <div className="flex -space-x-3">
                            <img alt="User profile" className="w-10 h-10 rounded-full border-2 border-surface" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC5iyTjeByu_9oOcpA0R_elZBNo3FIhHOrr1FYsnWK2ILsDtGs35f8KGp80WUthSyrBhVzrWsMzcllr0M9IjUvwN_usNBcBtZt99eIW78U6Jn1Vu6vxWytjIIblmVxG6XD6LrAyZ1_mObZb67EUHQI4KTQ6oLYW81Mass7FjJLJiVvHeSZ87_D0BRATejHGQIuz7h3I6bRm-frGzmDW0twa_LyIuPU50QuCNxP3jTAdPtU5wv3YlEPxfDZpwNtS0qiN2rJvkkrF6oBe" />
                            <img alt="User profile" className="w-10 h-10 rounded-full border-2 border-surface" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDrGYIl8ckCxzJnCtpE04YTwxI0NeEEITynJNRz0MlZvViYSBg2_ACVTSSowo2ZyAKLwkr9IBSCKvAzcroYDlegg7VnPUmnKt2L7W-8tmNuX159WhB5b3KSAoELspFTKynOSS_UX7L731O41BlT7GonyJv0i0-D1N2ygmoDBlH1SXgf7dPqm_jnb7T845ZQXz39qyj3_e60dE0vNlPZPAd-qR_XMQgK8wzETz-4dMcAQhQMd85gW--4fm5UF_1nHx8omkSDvLAI99h9" />
                            <img alt="User profile" className="w-10 h-10 rounded-full border-2 border-surface" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBzgGGYt3jzEntsOvC1xEzRMC-Rn6Ib1Z4riln4W2BJxKOatse6RyLo6i38zdJV1b07M4nRz5j3EhW1jfTZW5MsPUbffq6t08nMYMMStyo-6Ue-YkWOEORiZXzDJGVVIlB5XHQAkLXtrsOzYK7L4huFXQ-ISs5CQLBiYlvbgJAUb8ospFX-8VX297q_-AycxG-dbQyXtWMkp8yIOzObMiS1dDvxJUclrRqoI5ehquO9F3rTyBg3Rlw3aM736_PjYmLL5nCr2KOIQJDv" />
                        </div>
                        <p className="text-sm font-label text-on-surface/60 italic">Joined by 4,000+ Enterprises this month</p>
                    </div>
                </div>
                {/* Bottom Brand Anchor */}
                <div className="absolute bottom-12 left-12 flex items-center gap-3">
                    <span className="text-2xl font-headline font-black tracking-tighter text-primary">Digital-Vakeel</span>
                    <div className="w-1 h-1 rounded-full bg-outline-variant"></div>
                    <span className="text-xs font-label uppercase tracking-widest text-on-surface-variant opacity-50">Sovereign Intel</span>
                </div>
            </section>
            
            {/* Right Side: Authentication Shell */}
            <section className="w-full lg:w-5/12 bg-surface flex flex-col items-center justify-center p-8 md:p-16 xl:p-24 relative">
                {/* Mobile Header Only */}
                <div className="lg:hidden absolute top-8 left-8">
                    <span className="text-2xl font-headline font-black tracking-tighter text-primary">Digital-Vakeel</span>
                </div>
                <div className="w-full max-w-md">
                    <div className="mb-10">
                        <h2 className="text-3xl font-headline font-bold text-on-surface mb-2">{mode === "login" ? "Welcome Back" : "Initialize Access"}</h2>
                        <p className="text-on-surface-variant">{mode === "login" ? "Sign in to your sovereign legal dashboard." : "Create your private MSME enforcement portal."}</p>
                    </div>
                    {/* Toggle Navigation */}
                    <div className="flex p-1 bg-surface-container-low rounded-lg mb-8">
                        <button 
                          onClick={() => { setMode("login"); setError(""); }}
                          type="button"
                          className={`flex-1 py-2 text-sm font-label font-bold rounded-md transition-all duration-300 ${mode === "login" ? "bg-surface-container-highest text-primary" : "text-on-surface-variant hover:text-on-surface"}`}>
                            Login
                        </button>
                        <button 
                          onClick={() => { setMode("signup"); setError(""); }}
                          type="button"
                          className={`flex-1 py-2 text-sm font-label font-bold rounded-md transition-all duration-300 ${mode === "signup" ? "bg-surface-container-highest text-primary" : "text-on-surface-variant hover:text-on-surface"}`}>
                            Sign Up
                        </button>
                    </div>
                    
                    {error && (
                      <div className="mb-6 p-4 bg-error-container text-on-error-container text-sm font-medium rounded-lg border border-error-dim">
                        {error}
                      </div>
                    )}

                    <div className="relative flex items-center justify-center mb-8">
                        <div className="w-full border-t border-outline-variant/30"></div>
                        <span className="absolute px-4 bg-surface text-[10px] uppercase tracking-widest text-on-surface-variant/50">Authenticate via Credentials</span>
                    </div>

                    {/* Authentication Form */}
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div className="space-y-1.5">
                            <label className="text-xs font-label uppercase tracking-widest text-on-surface-variant ml-1">Email Identity</label>
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors group-focus-within:text-primary">alternate_email</span>
                                <input 
                                  value={email}
                                  onChange={e => setEmail(e.target.value)}
                                  className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl py-3.5 pl-12 pr-4 text-on-surface font-body placeholder:text-on-surface-variant/30 focus:outline-none focus:border-primary/50 auth-input transition-all" 
                                  placeholder="director@entity.com" 
                                  type="email"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-xs font-label uppercase tracking-widest text-on-surface-variant">Security Key</label>
                            </div>
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors group-focus-within:text-primary">lock_open</span>
                                <input 
                                  value={password}
                                  onChange={e => setPassword(e.target.value)}
                                  className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl py-3.5 pl-12 pr-12 text-on-surface font-body placeholder:text-on-surface-variant/30 focus:outline-none focus:border-primary/50 auth-input transition-all" 
                                  placeholder="••••••••" 
                                  type="password"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative flex items-center">
                                    <input className="peer h-5 w-5 opacity-0 absolute cursor-pointer" type="checkbox" />
                                    <div className="h-5 w-5 border-2 border-outline-variant rounded-md peer-checked:bg-primary peer-checked:border-primary transition-all duration-200"></div>
                                    <span className="material-symbols-outlined absolute text-[14px] text-surface font-black left-1 opacity-0 peer-checked:opacity-100">check</span>
                                </div>
                                <span className="text-xs font-label text-on-surface-variant group-hover:text-on-surface transition-colors">Persistent Session</span>
                            </label>
                        </div>
                        {/* Primary Action */}
                        <button 
                          disabled={loading}
                          className="w-full group relative overflow-hidden bg-gradient-to-br from-primary to-primary-container p-[1px] rounded-xl shadow-lg shadow-primary/10 hover:shadow-primary/20 transition-all duration-300 active:scale-95 disabled:opacity-60" 
                          type="submit"
                        >
                            <div className="bg-gradient-to-br from-primary to-primary-container px-8 py-4 rounded-[11px] flex items-center justify-center gap-2 transition-all">
                                <span className="text-on-primary font-label font-bold uppercase tracking-widest text-sm">
                                  {loading ? "Authenticating..." : mode === "login" ? "Initialize Access" : "Create Entity"}
                                </span>
                                <span className="material-symbols-outlined text-on-primary group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
                            </div>
                        </button>
                    </form>
                    {/* Footer Context */}
                    <div className="mt-12 text-center">
                        <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/40 leading-loose">
                            By initializing access, you agree to our <br/>
                            <a className="text-on-surface hover:text-primary underline underline-offset-4 decoration-primary/30 transition-colors" href="#">Digital Sovereignty Protocol</a> &amp; <a className="text-on-surface hover:text-primary underline underline-offset-4 decoration-primary/30 transition-colors" href="#">Data Privacy Charter</a>
                        </p>
                    </div>
                </div>
            </section>
        </main>
    </div>
  );
}


// ─────────────────────────────────────────────
//  ROOT APP
// ─────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(getStoredUser());
  const [screen, setScreen] = useState("upload");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const isLoggedIn = !!user && !!getToken();

  const handleAuth = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    logout();
    setUser(null);
  };

  if (!isLoggedIn) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  const handleSelectInvoice = (inv) => {
    setSelectedInvoice({
      id: inv.id,
      invoiceNo: inv.invoice_no,
      invoiceDate: inv.invoice_date,
      sellerName: inv.seller_name,
      buyerName: inv.buyer_name,
      amount: inv.amount,
      paid: inv.paid,
      buyerGstin: inv.buyer_gstin || "",
      buyerContact: inv.buyer_contact || "",
      udyamId: inv.udyam_id || "",
    });
    setScreen("dashboard");
  };

  const handleBackToList = () => {
    setSelectedInvoice(null);
    setRefreshKey(k => k + 1);
    setScreen("invoices");
  };

  const screenTitles = {
    upload:    { title:"Upload Invoice",  sub:"Digitise and register a new invoice for monitoring" },
    invoices:  { title:"My Invoices",     sub:"All your tracked invoices in one place" },
    dashboard: { title:"Invoice Dashboard", sub: selectedInvoice ? `${selectedInvoice.invoiceNo} · ${selectedInvoice.sellerName} → ${selectedInvoice.buyerName}` : "Select an invoice" },
    timeline:  { title:"Case Timeline",   sub: selectedInvoice ? `Timeline for ${selectedInvoice.invoiceNo}` : "Select an invoice" },
  };
  const t = screenTitles[screen];

  const handleUploadSubmit = async (data) => {
    try {
      const result = await createInvoice(data);
      if (result) {
        setRefreshKey(k => k + 1);
        setTimeout(() => setScreen("invoices"), 1200);
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      alert("Failed to upload invoice: " + err.message);
      return false;
    }
  };

  return (
    <div style={S.app}>
      <Sidebar screen={screen} setScreen={(s) => { setScreen(s); if (s !== "dashboard" && s !== "timeline") setSelectedInvoice(null); }} user={user} onLogout={handleLogout} />
      <div style={S.main}>
        <div style={S.topbar}>
          <div>
            <div style={S.topTitle}>{t.title}</div>
            <div style={S.topSub}>{t.sub}</div>
          </div>
          <div style={S.topRight}>
            <span style={S.topBadge}>👤 {user.name}</span>
            <div style={{
              width:32,height:32,borderRadius:"50%",
              background:`linear-gradient(135deg,${T.brand},${T.brandDim})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:14,color:T.white,fontWeight:700,
            }}>{user.name?.[0]?.toUpperCase()}</div>
          </div>
        </div>

        {screen === "upload"    && <UploadScreen onSubmit={handleUploadSubmit}/>}
        {screen === "invoices"  && <InvoiceListScreen onSelectInvoice={handleSelectInvoice} onRefresh={refreshKey}/>}
        {screen === "dashboard" && selectedInvoice && <DashboardScreen invoice={selectedInvoice} onBack={handleBackToList}/>}
        {screen === "timeline"  && selectedInvoice && <TimelineScreen invoice={selectedInvoice}/>}
        {(screen === "dashboard" || screen === "timeline") && !selectedInvoice && (
          <div style={{...S.scroll,textAlign:"center",paddingTop:80}}>
            <div style={{fontSize:48,marginBottom:12}}>📋</div>
            <div style={{fontWeight:700,fontSize:18,color:T.ink,marginBottom:8}}>No Invoice Selected</div>
            <div style={{fontSize:13,color:T.muted,marginBottom:20}}>Go to My Invoices and select one to view.</div>
            <button style={S.btnPrimary} onClick={() => setScreen("invoices")}>View My Invoices</button>
          </div>
        )}
      </div>

      <ChatWidget />
    </div>
  );
}
