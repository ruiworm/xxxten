"""Requesty application attribution settings."""

REQUESTY_APP_URL = "https://github.com/ruiworm/xxxten"
REQUESTY_APP_TITLE = "NovelForge"


def get_requesty_attribution_headers() -> dict[str, str]:
    """Return headers used to attribute requests to NovelForge in Requesty."""
    return {
        "HTTP-Referer": REQUESTY_APP_URL,
        "X-Title": REQUESTY_APP_TITLE,
    }
