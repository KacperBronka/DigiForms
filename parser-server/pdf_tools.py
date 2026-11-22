"""PDFium access is serialized: different documents are not thread-safe either."""
from contextlib import closing
from pathlib import Path
from threading import RLock
import pypdfium2 as pdfium

PDF_LOCK = RLock()


def validate_pdf(path: Path) -> None:
    try:
        with PDF_LOCK, pdfium.PdfDocument(path) as document:
            if len(document) == 0:
                raise ValueError('PDF has no pages')
    except pdfium.PdfiumError as exc:
        raise ValueError('Invalid or password-protected PDF') from exc


def render_pdf_pages(path: Path, dpi: int, max_pages: int | None = None):
    """Yield independent RGB images; callers close both images and generator."""
    with PDF_LOCK, pdfium.PdfDocument(path) as document:
        count = len(document) if max_pages is None else min(len(document), max_pages)
        for index in range(count):
            with closing(document[index]) as page:
                with closing(page.render(scale=dpi / 72)) as bitmap:
                    with bitmap.to_pil() as image:
                        # The bitmap must outlive its PIL view, but not this copy.
                        result = image.convert('RGB').copy()
            yield result
