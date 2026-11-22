"""Validated runtime configuration. Values are never logged."""
from dataclasses import dataclass, field
import os
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv


def integer(name: str, default: int, minimum: int = 1, maximum: int = 2**53 - 1) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError:
        raise ValueError(f'{name} must be an integer') from None
    if not minimum <= value <= maximum:
        raise ValueError(f'{name} must be between {minimum} and {maximum}')
    return value


def boolean(name: str, default: bool = False) -> bool:
    value = os.environ.get(name, str(default)).lower()
    if value not in ('true', 'false'):
        raise ValueError(f'{name} must be true or false')
    return value == 'true'


def text(name: str, default: str = '') -> str:
    return os.environ.get(name, default).strip()


def http_url(name: str, default: str) -> str:
    value = text(name, default)
    parsed = urlsplit(value)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError(f'{name} must be an HTTP(S) URL without credentials or fragment')
    return value


@dataclass(frozen=True)
class Settings:
    max_upload_bytes: int
    port: int
    api_key: str = field(repr=False)
    api_url: str
    model: str
    connect_timeout: int
    read_timeout: int
    max_ocr_chars: int
    max_image_pages: int
    image_dpi: int
    jpeg_quality: int
    ocr_device: str
    ocr_lang: str
    ocr_models_dir: str
    ocr_dpi: int
    ocr_threads: int
    ocr_timeout_seconds: int
    jwt_enabled: bool
    jwt_public_key: str
    jwt_algorithm: str
    jwt_issuer: str
    jwt_audience: str
    jwt_leeway_seconds: int

    @classmethod
    def from_env(cls):
        enabled = boolean('JWT_ENABLED')
        algorithm = text('JWT_ALGORITHM', 'RS256')
        if algorithm not in ('RS256', 'ES256'):
            raise ValueError('JWT_ALGORITHM must be RS256 or ES256')
        key = text('JWT_PUBLIC_KEY').replace('\\n', '\n')
        issuer, audience = text('JWT_ISSUER'), text('JWT_AUDIENCE')
        if enabled:
            if not key or not issuer or not audience:
                raise ValueError('JWT_ENABLED requires JWT_PUBLIC_KEY, JWT_ISSUER and JWT_AUDIENCE')
            from cryptography.hazmat.primitives.serialization import load_pem_public_key
            from cryptography.hazmat.primitives.asymmetric import rsa, ec
            try:
                parsed_key = load_pem_public_key(key.encode())
            except (ValueError, TypeError):
                raise ValueError('JWT_PUBLIC_KEY must be a valid PEM public key') from None
            if algorithm == 'RS256' and (not isinstance(parsed_key, rsa.RSAPublicKey) or parsed_key.key_size < 2048):
                raise ValueError('RS256 requires an RSA public key of at least 2048 bits')
            if algorithm == 'ES256' and (not isinstance(parsed_key, ec.EllipticCurvePublicKey) or not isinstance(parsed_key.curve, ec.SECP256R1)):
                raise ValueError('ES256 requires a P-256 public key')
        model = text('EDENAI_MODEL', 'amazon/anthropic.claude-haiku-5-5@eu')
        if not model:
            raise ValueError('EDENAI_MODEL cannot be empty')
        device = text('OCR_DEVICE', 'cpu').lower()
        if device not in ('cpu', 'cuda'):
            raise ValueError('OCR_DEVICE must be cpu or cuda')
        return cls(
            max_upload_bytes=integer('MAX_UPLOAD_BYTES', 20 * 1024 * 1024),
            port=integer('PORT', 3001, maximum=65535),
            api_key=text('EDENAI_API_KEY'),
            api_url=http_url('EDENAI_API_URL', 'https://api.edenai.run/v3/chat/completions'),
            model=model,
            connect_timeout=integer('EDENAI_CONNECT_TIMEOUT_SECONDS', 15),
            read_timeout=integer('EDENAI_READ_TIMEOUT_SECONDS', 600),
            max_ocr_chars=integer('MAX_OCR_CHARS', 160_000),
            max_image_pages=integer('MAX_IMAGE_PAGES', 5, minimum=0),
            image_dpi=integer('IMAGE_DPI', 150, maximum=600),
            jpeg_quality=integer('JPEG_QUALITY', 78, maximum=95),
            ocr_device=device,
            ocr_lang=text('OCR_LANG', 'pl'),
            ocr_models_dir=text('OCR_MODELS_DIR'),
            ocr_dpi=integer('OCR_DPI', 200, maximum=600),
            ocr_threads=integer('OCR_THREADS', 4, maximum=64),
            ocr_timeout_seconds=integer('OCR_TIMEOUT_SECONDS', 120),
            jwt_enabled=enabled, jwt_public_key=key, jwt_algorithm=algorithm,
            jwt_issuer=issuer, jwt_audience=audience,
            jwt_leeway_seconds=integer('JWT_LEEWAY_SECONDS', 30, minimum=0, maximum=300),
        )


# Explicit environment values take precedence, including intentionally empty values.
load_dotenv(Path(__file__).resolve().parent / '.env', override=False)
settings = Settings.from_env()
