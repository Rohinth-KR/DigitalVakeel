import fitz
import json

LABEL_KEYS = {
    'SELLER NAME': 'SELLER_NAME',
    'INVOICE NUMBER': 'INVOICE_NUMBER',
    'UDYAM REG. NO.': 'UDYAM_ID',
    'INVOICE DATE': 'INVOICE_DATE',
    'GSTIN (SELLER)': 'GSTIN_SELLER',
    'DUE DATE': 'DUE_DATE',
    'SELLER PHONE': 'SELLER_PHONE',
    'PO NUMBER': 'PO_NUMBER',
    'SELLER EMAIL': 'SELLER_EMAIL',
    'DELIVERY DATE': 'DELIVERY_DATE',
    'ENTERPRISE SIZE': 'ENTERPRISE_SIZE',
    'E-WAY BILL NO.': 'EWAY_BILL',
    'TRANSPORT MODE': 'TRANSPORT_MODE',
    'SELLER BANK A/C': 'BANK_ACCOUNT',
    'BUYER NAME': 'BUYER_NAME',
    'GSTIN (BUYER)': 'BUYER_GSTIN',
    'BUYER PHONE': 'BUYER_PHONE',
    'BUYER EMAIL': 'BUYER_EMAIL',
    'SUBTOTAL': 'SUBTOTAL',
    'CGST': 'CGST', 
    'SGST': 'SGST',
    'IGST': 'IGST',
    'INVOICE AMOUNT': 'INVOICE_AMOUNT',
    'PAYMENT TERMS': 'PAYMENT_TERMS'
}

def get_exact_colored_boxes():
    doc = fitz.open('msme_tax_invoice_correct_bbox.pdf')
    page = doc[0]
    
    # 1. Get all text spans
    spans = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] == 0:
            for l in b['lines']:
                for s in l['spans']:
                    t = s['text'].strip()
                    if t:
                        spans.append({"text": t, "bbox": s["bbox"]})
                        
    # 2. Extract targets
    found_targets = {}
    targets = list(LABEL_KEYS.keys()) + ['IFSC CODE']
    for span in spans:
        txt = span["text"].strip()
        if txt in targets:
            # We want the highest Y value (lower on the physical page) just in case (e.g., IFSC CODE)
            if txt not in found_targets or span["bbox"][1] > found_targets[txt]["bbox"][1]:
                found_targets[txt] = span
                
    # 3. Get all uniquely colored rects
    rects = []
    for p in page.get_drawings():
        if p.get('fill'):
            # Filter out white boxes which are just standard backgrounds
            if p.get('fill') == (1.0, 1.0, 1.0):
                continue
            for item in p['items']:
                if item[0] == 're':
                    rects.append(item[1])
                    
    print(f"Total non-white rects: {len(rects)}")
                    
    # 4. Map each target text to the rectangle whose Top-Left (x0, y0) matches the text (x0, y0) closest!
    final_mapping = {}
    for txt, span in found_targets.items():
        sx0, sy0, sx1, sy1 = span["bbox"]
        
        best_r = None
        min_dist = 999999
        matched_rects = []
        
        for r in rects:
            rx0, ry0, rx1, ry1 = r
            
            # Distance from span top-left to rect top-left
            dx = abs(sx0 - rx0)
            dy = abs(sy0 - ry0)
            dist = (dx**2 + dy**2)**0.5
            
            if dist < 10.0:
                matched_rects.append(r)
                
        if matched_rects:
            # Pick the largest area rectangle
            best_r = max(matched_rects, key=lambda r: (r[2]-r[0])*(r[3]-r[1]))
            rx0, ry0, rx1, ry1 = best_r
            print(f"{txt:20} -> match | [x: {sx0:5.1f}, y: {sy0:5.1f}] -> rect {rx0:5.1f}, {ry0:5.1f}, {rx1:5.1f}, {ry1:5.1f} width={(rx1-rx0):.1f}")
            key = LABEL_KEYS.get(txt, "IFSC")
            final_mapping[key] = [rx0, ry0, rx1, ry1]

    # Normalize mapping
    w, h = page.rect.width, page.rect.height
    doctr_mapping = {}
    for k, r in final_mapping.items():
        doctr_mapping[k] = [
            int(r[0] / w * 1000),
            int(r[1] / h * 1000),
            int(r[2] / w * 1000),
            int(r[3] / h * 1000)
        ]
        
    with open("template_mapping.json", "w") as f:
        json.dump(doctr_mapping, f, indent=2)
        
    print(f"\nFinal Mapped Count: {len(doctr_mapping)}")

if __name__ == '__main__':
    get_exact_colored_boxes()
