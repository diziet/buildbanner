"""BuildBanner Python server helpers for Flask, Django, and FastAPI."""


def __getattr__(name: str):
    """Lazy import adapters to avoid hard framework dependencies."""
    if name == 'buildbanner_blueprint':
        from buildbanner.flask import buildbanner_blueprint
        return buildbanner_blueprint
    if name == 'BuildBannerMiddleware':
        from buildbanner.fastapi import BuildBannerMiddleware
        return BuildBannerMiddleware
    raise AttributeError(f'module {__name__!r} has no attribute {name!r}')


__all__ = ['buildbanner_blueprint', 'BuildBannerMiddleware']
