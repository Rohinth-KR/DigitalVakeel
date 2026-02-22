"""
MSME Invoice OCR — FastAPI REST Endpoint
POST an invoice image to /extract and receive structured JSON fields.

Usage:
    python -m uvicorn api:app --host 0.0.0.0 --port 8000
    curl -F "file=@invoice.png" http://localhost:8000/extract
"""
import os
import uuid
import shutil
import tempfile
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse

from step8_predict_pdf import load_ocr_model, extract_fields_from_pdf

app = FastAPI(
    title='MSME Invoice OCR API',
    description='Extract structured fields from MSME MSMED PDF invoices using layout geometry',
    version='2.0.0'
)

# Load models at startup
ocr_model = None


@app.on_event("startup")
async def startup():
    global ocr_model
    print("Loading DocTR model...")
    ocr_model = load_ocr_model()
    print("API ready!")


@app.get('/')
async def root():
    return {
        'service': 'MSME Invoice OCR API (V2 Template Guided)',
        'status': 'running',
        'usage': 'POST a PDF invoice to /extract'
    }


@app.post('/extract')
async def extract_invoice(file: UploadFile = File(...)):
    """
    Upload an invoice PDF and receive extracted fields as JSON.
    """
    # Save upload to a temp file (Windows-compatible)
    tmp_dir = tempfile.gettempdir()
    tmp_path = os.path.join(tmp_dir, f'{uuid.uuid4()}_{file.filename}')

    try:
        with open(tmp_path, 'wb') as f:
            shutil.copyfileobj(file.file, f)

        result = extract_fields_from_pdf(tmp_path, ocr_model)
        return JSONResponse({
            'status': 'ok',
            'filename': file.filename,
            'fields': result,
            'field_count': len(result)
        })
    except Exception as e:
        return JSONResponse(
            {'status': 'error', 'message': str(e)},
            status_code=500
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)
