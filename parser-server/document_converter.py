
from pathlib import Path
from contextlib import contextmanager
import subprocess
import tempfile
from PIL import Image, ImageOps
from pdf_tools import validate_pdf


OFFICE_FORMATS = {".doc", ".docx", ".ods", ".xlsx"}
IMAGE_FORMATS = {".jpg", ".jpeg", ".png"}
SUPPORTED_FORMATS = OFFICE_FORMATS | IMAGE_FORMATS | {".pdf"}


@contextmanager
def prepare_pdf(source: Path):
    """
    Converts supported documents to PDF.

    Yields a PDF path that remains valid until the
    context manager exits.
    """
    source = Path(source).resolve()

    if not source.is_file():
        raise FileNotFoundError(source)

    ext = source.suffix.lower()

    if ext not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported format: {ext}")

    # PDFs don't need conversion.
    if ext == ".pdf":
        validate_pdf(source)
        yield source
        return

    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        output = workdir / f"{source.stem}.pdf"

        if ext in IMAGE_FORMATS:
            with Image.open(source) as image:
                with ImageOps.exif_transpose(image) as oriented:
                    with oriented.convert("RGB") as rgb:
                        rgb.save(output, "PDF", resolution=150.0)

        elif ext in OFFICE_FORMATS:
            # Unique LibreOffice profile for each conversion.
            # Prevents concurrent requests sharing a profile.
            profile = (workdir / "lo_profile").as_uri()

            command = [
                "soffice",
                f"-env:UserInstallation={profile}",
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(workdir),
                str(source),
            ]

            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
            )

            if result.returncode != 0:
                raise RuntimeError(
                    "LibreOffice conversion failed:\n"
                    + result.stdout + "\n" + result.stderr
                )

        if not output.is_file():
            raise RuntimeError(
                f"PDF not generated: {source.name}"
            )

        # Validate the produced PDF before OCR.
        validate_pdf(output)

        yield output
