"""Tests for BuildBanner Python package structure and imports."""

import importlib


def test_import_buildbanner() -> None:
    """Top-level buildbanner package is importable."""
    mod = importlib.import_module('buildbanner')
    assert mod is not None


def test_buildbanner_blueprint_importable() -> None:
    """buildbanner_blueprint is importable from the top-level package."""
    from buildbanner import buildbanner_blueprint
    assert buildbanner_blueprint is not None


def test_buildbannerMiddleware_importable_from_toplevel() -> None:
    """BuildBannerMiddleware is importable from the top-level package."""
    from buildbanner import BuildBannerMiddleware
    assert BuildBannerMiddleware is not None


def test_buildbannerMiddleware_importable_from_django() -> None:
    """BuildBannerMiddleware is importable from buildbanner.django."""
    from buildbanner.django import BuildBannerMiddleware
    assert BuildBannerMiddleware is not None


def test_buildbanner_wsgi_importable() -> None:
    """buildbanner_wsgi is importable from the top-level package."""
    from buildbanner import buildbanner_wsgi
    assert buildbanner_wsgi is not None


def test_version_string_present() -> None:
    """Package exposes a __version__ string."""
    import buildbanner
    assert hasattr(buildbanner, '__version__')
    assert isinstance(buildbanner.__version__, str)
    assert len(buildbanner.__version__) > 0
