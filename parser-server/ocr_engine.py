import base64
import io
from pathlib import Path
import pymupdf
from PIL import Image
MAX_IMAGE_PAGES = 4
IMAGE_DPI = 150
JPEG_QUALITY = 78

def load_ocr():
    """Create the local model once per server process."""
    from paddleocr import PaddleOCR

    return PaddleOCR(
        lang="pl",
        ocr_version="PP-OCRv6",
        device="cpu",
        engine="onnxruntime",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        enable_mkldnn=False,
    )


def pdf_to_images(pdf_path: Path, max_pages: int = MAX_IMAGE_PAGES) -> list:
    if max_pages == 0:
        return []
    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError("Page images currently require a PDF; set MAX_IMAGE_PAGES=0 for images.")

    images = []
    with pymupdf.open(pdf_path) as doc:
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            pix = page.get_pixmap(dpi=IMAGE_DPI, alpha=False)
            with Image.open(io.BytesIO(pix.tobytes("png"))) as image:
                buffer = io.BytesIO()
                image.convert("RGB").save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
            images.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
            })
            print(f"Wizualizacja strony {i + 1}: {len(buffer.getvalue()) // 1024} KB JPEG")
    return images


def extract_ocr(document_path: Path, ocr) -> dict:
    pages = []
    for i, result in enumerate(ocr.predict(str(document_path)), start=1):
        raw = result.json
        data = raw.get("res", raw)
        texts = data.get("rec_texts", [])
        boxes = data.get("rec_boxes", [])
        scores = data.get("rec_scores", [])
        lines = []
        for n, value in enumerate(texts):
            box = boxes[n] if n < len(boxes) else None
            if box is not None:
                box = box.tolist() if hasattr(box, "tolist") else list(box)
                box = [int(x) for x in box]
            lines.append({
                "text": str(value),
                "bbox": box,
                "score": round(float(scores[n]), 3) if n < len(scores) else None,
            })
        pages.append({"page": i, "lines": lines})
    return {"pages": pages}


