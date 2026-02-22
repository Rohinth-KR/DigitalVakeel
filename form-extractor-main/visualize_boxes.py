import sys
import json
import fitz

def draw_boxes(pdf_path, mapping_file, output_path):
    doc = fitz.open(pdf_path)
    page = doc[0]
    
    with open(mapping_file) as f:
        mapping = json.load(f)
        
    w, h = page.rect.width, page.rect.height
    
    red = (1, 0, 0)
    for field, box in mapping.items():
        # denormalize
        r = fitz.Rect(
            box[0] * w / 1000,
            box[1] * h / 1000,
            box[2] * w / 1000,
            box[3] * h / 1000
        )
        page.draw_rect(r, color=red, width=1)
        # add text label
        page.insert_text((r.x0, r.y0 - 2), field, fontsize=6, color=red)
        
    doc.save(output_path)
    print(f"Saved visualization to {output_path}")

if __name__ == "__main__":
    draw_boxes(sys.argv[1], "template_mapping.json", "visualized_boxes.pdf")
