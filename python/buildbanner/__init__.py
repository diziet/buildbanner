"""BuildBanner Python server helpers for Flask, Django, and FastAPI."""


def __getattr__(name: str):
    """Lazy import Flask adapter to avoid hard Flask dependency."""
    if name == 'buildbanner_blueprint':
        from buildbanner.flask import buildbanner_blueprint
        return buildbanner_blueprint
    raise AttributeError(f'module {__name__!r} has no attribute {name!r}')


__all__ = ['buildbanner_blueprint']
