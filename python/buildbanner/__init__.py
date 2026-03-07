"""BuildBanner Python server helpers for Flask, Django, FastAPI, and WSGI."""

__version__ = '0.1.0'


def __getattr__(name: str):
    """Lazy import adapters to avoid hard framework dependencies."""
    if name == 'buildbanner_blueprint':
        from buildbanner.flask import buildbanner_blueprint
        return buildbanner_blueprint
    if name == 'BuildBannerMiddleware':
        from buildbanner.fastapi import BuildBannerMiddleware
        return BuildBannerMiddleware
    if name == 'DjangoBuildBannerMiddleware':
        from buildbanner.django import BuildBannerMiddleware
        return BuildBannerMiddleware
    if name == 'buildbanner_wsgi':
        from buildbanner.wsgi import buildbanner_wsgi
        return buildbanner_wsgi
    raise AttributeError(f'module {__name__!r} has no attribute {name!r}')


__all__ = [
    'buildbanner_blueprint',
    'BuildBannerMiddleware',
    'DjangoBuildBannerMiddleware',
    'buildbanner_wsgi',
]
