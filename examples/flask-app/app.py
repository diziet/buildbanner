"""Minimal Flask app with BuildBanner integration."""

from flask import Flask
from buildbanner import buildbanner_blueprint

app = Flask(__name__)
app.register_blueprint(buildbanner_blueprint())


@app.route("/")
def index():
    """Serve the main page with BuildBanner script tag."""
    return """<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Flask + BuildBanner</title></head>
<body>
  <h1>Flask App</h1>
  <p>BuildBanner is loaded via the script tag below.</p>
  <script src="/static/buildbanner.min.js"></script>
</body>
</html>"""


if __name__ == "__main__":
    app.run(debug=True, port=5000)
