"""Text of each page of a PDF (no OCR: works only for PDFs that contain real text)."""

import io

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app.core.exceptions import AppError


def extract_pdf_pages(data: bytes) -> list[str]:
    try:
        reader = PdfReader(io.BytesIO(data))
        return [page.extract_text() or "" for page in reader.pages]
    except (PdfReadError, ValueError) as exc:
        raise AppError(
            "The PDF could not be opened. It may be damaged or password-protected.",
            status_code=422,
            code="pdf_unreadable",
        ) from exc
