"""Checks an uploaded invoice file before any reader sees it."""

from dataclasses import dataclass
from typing import Literal

from fastapi import UploadFile

from app.core.exceptions import AppError

AcceptedMimeType = Literal[
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]
XLSX: AcceptedMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
SPREADSHEETS: frozenset[str] = frozenset({"text/csv", XLSX})

_CHUNK = 1024 * 1024


@dataclass(frozen=True)
class InvoiceFile:
    data: bytes
    mime_type: AcceptedMimeType
    file_name: str


def _looks_like_csv(data: bytes, file_name: str) -> bool:
    """A .csv name and plain text whose first line has several columns."""
    if not file_name.lower().endswith(".csv"):
        return False
    head = data[:4096]
    if b"\x00" in head:
        return False
    try:
        first_line = head.decode("utf-8-sig").splitlines()[0]
    except (UnicodeDecodeError, IndexError):
        return False
    return max(first_line.count(","), first_line.count(";"), first_line.count("\t")) >= 2


def detect_mime_type(data: bytes, file_name: str = "") -> AcceptedMimeType | None:
    """Checks the file's first bytes so a renamed file cannot pretend to be a PDF, image or spreadsheet."""
    if data.startswith(b"PK\x03\x04") and b"xl/workbook" in data:
        return XLSX
    if _looks_like_csv(data, file_name):
        return "text/csv"
    if data.startswith(b"%PDF"):
        return "application/pdf"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG"):
        return "image/png"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def read_invoice_upload(upload: UploadFile | None, max_mb: float) -> InvoiceFile:
    if upload is None:
        raise AppError("Choose an invoice file to upload.", status_code=400, code="file_missing")

    limit = int(max_mb * 1024 * 1024)
    # Read in chunks and stop as soon as the limit is passed, so a huge file is never held in memory.
    buffer = bytearray()
    while chunk := await upload.read(_CHUNK):
        buffer.extend(chunk)
        if len(buffer) > limit:
            raise AppError(
                f"The file is larger than {max_mb:g} MB.", status_code=413, code="file_too_large"
            )
    if not buffer:
        raise AppError("The file is empty.", status_code=400, code="file_empty")

    data = bytes(buffer)
    file_name = (upload.filename or "invoice")[:120]
    mime_type = detect_mime_type(data, file_name)
    if mime_type is None:
        raise AppError(
            "Upload a PDF, JPG, PNG or WEBP file, or a CSV or Excel statement.",
            status_code=415,
            code="file_unsupported",
        )
    return InvoiceFile(data=data, mime_type=mime_type, file_name=file_name)
