import os
import sys
import json
from doctr.io import DocumentFile
from doctr.models import ocr_predictor

def load_ocr_model():
    print("Loading DocTR OCR model...")
    ocr_model = ocr_predictor(det_arch='db_resnet50', reco_arch='crnn_vgg16_bn', pretrained=True)
    return ocr_model

def box_center(box):
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)

def calculate_iou(box1, box2):
    """
    Calculate Intersection over Union (IoU) between two bounding boxes.
    box format: [x0, y0, x1, y1]
    """
    # Determine the coordinates of the intersection rectangle
    x_left = max(box1[0], box2[0])
    y_top = max(box1[1], box2[1])
    x_right = min(box1[2], box2[2])
    y_bottom = min(box1[3], box2[3])

    if x_right < x_left or y_bottom < y_top:
        return 0.0

    # The intersection area
    intersection_area = (x_right - x_left) * (y_bottom - y_top)
    
    # Compute the area of both rectangles
    box1_area = (box1[2] - box1[0]) * (box1[3] - box1[1])
    box2_area = (box2[2] - box2[0]) * (box2[3] - box2[1])

    # Compute the intersection over area of word bounding box (not standard union)
    # We want to know if the word is mostly inside the target box.
    iou = intersection_area / float(box1_area)
    return iou


def is_inside(word_box, target_box):
    """
    Check if a word belongs to the target box by checking if it overlaps significantly.
    Also expand the target box slightly to account for typing that bleeds over the line.
    """
    # Expand target box by a small margin horizontally, but very minimally vertically
    expanded_target = [
        target_box[0] - 5,
        target_box[1],
        target_box[2] + 5,
        target_box[3]
    ]
    
    # If the center of the word is inside the expanded box, accept it
    cx, cy = box_center(word_box)
    if (expanded_target[0] <= cx <= expanded_target[2]) and (expanded_target[1] <= cy <= expanded_target[3]):
        return True
        
    # Or if the word heavily overlaps with the expanded box (>40% of the word's area is inside)
    return calculate_iou(word_box, expanded_target) > 0.4

def extract_fields_from_pdf(pdf_path: str, ocr_model, mapping_file="template_mapping.json") -> dict:
    """
    Extract structured fields from a PDF file using predefined bounding boxes.
    """
    if not os.path.exists(mapping_file):
        raise FileNotFoundError(f"Mapping file not found: {mapping_file}")
        
    with open(mapping_file) as f:
        field_mapping = json.load(f)
    
    print("Running OCR predictor...")
    doc = DocumentFile.from_pdf(pdf_path)
    result = ocr_model(doc)

    # We extract from the first page since the mapping is for page 1
    page = result.pages[0]
    words_data = []
    
    for block in page.blocks:
        for line in block.lines:
            for word in line.words:
                g = word.geometry
                words_data.append({
                    'text': word.value,
                    'box': [
                        int(g[0][0] * 1000), int(g[0][1] * 1000),
                        int(g[1][0] * 1000), int(g[1][1] * 1000)
                    ]
                })

    extracted = {}
    
    # For each defined field box, find all words that are inside it.
    for field_name, target_box in field_mapping.items():
        field_words = []
        for w in words_data:
            if is_inside(w['box'], target_box):
                field_words.append(w)
                
        # Sort words primarily by Y coordinate (lines), then X coordinate (left-to-right)
        # Group them into lines if they are somewhat close vertically.
        lines = []
        for fw in field_words:
            added = False
            for line in lines:
                if abs(box_center(line[0]['box'])[1] - box_center(fw['box'])[1]) < 15:
                    line.append(fw)
                    added = True
                    break
            if not added:
                lines.append([fw])
                
        # Sort lines top-to-bottom
        lines.sort(key=lambda l: box_center(l[0]['box'])[1])
        
        # Sort words in each line left-to-right and join
        text_parts = []
        for line in lines:
            line.sort(key=lambda w: box_center(w['box'])[0])
            text_parts.append(' '.join([w['text'] for w in line]))
            
        final_text = ' '.join(text_parts).strip()
        
        extracted[field_name] = final_text

    return extracted

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python step8_predict_pdf.py <pdf_path>")
        print("Example: python step8_predict_pdf.py msme_blank_template.pdf")
        exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(f"ERROR: PDF not found: {pdf_path}")
        exit(1)

    ocr_model = load_ocr_model()
    result = extract_fields_from_pdf(pdf_path, ocr_model)

    print("=" * 60)
    print(f"EXTRACTED FIELDS FROM: {os.path.basename(pdf_path)}")
    print("=" * 60)
    print(json.dumps(result, indent=2))

    out_path = pdf_path.rsplit('.', 1)[0] + '_extracted.json'
    with open(out_path, 'w') as f:
        json.dump(result, f, indent=2)
    print(f"\nResult saved to: {out_path}")
