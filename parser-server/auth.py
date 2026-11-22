"""Bearer JWT verification using an explicitly configured asymmetric algorithm."""
import jwt
from fastapi import HTTPException
from settings import Settings


def authenticate(authorization: str | None, config: Settings) -> dict | None:
    if not config.jwt_enabled:
        return None
    try:
        scheme, token = (authorization or '').split()
        if scheme.lower() != 'bearer':
            raise ValueError('Bearer required')
        return jwt.decode(
            token, config.jwt_public_key,
            algorithms=[config.jwt_algorithm],
            issuer=config.jwt_issuer, audience=config.jwt_audience,
            leeway=config.jwt_leeway_seconds,
            options={'require': ['exp', 'iat', 'iss', 'aud', 'sub']},
        )
    except (ValueError, jwt.InvalidTokenError):
        raise HTTPException(
            status_code=401, detail='Brak poprawnego tokenu uwierzytelniającego.',
            headers={'WWW-Authenticate': 'Bearer'},
        ) from None
