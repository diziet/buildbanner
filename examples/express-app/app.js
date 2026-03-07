/** Minimal Express app with BuildBanner integration. */
'use strict';

const express = require('express');
const { buildBannerMiddleware } = require('buildbanner');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(buildBannerMiddleware());

app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Express + BuildBanner</title></head>
<body>
  <h1>Express App</h1>
  <p>BuildBanner is loaded via the script tag below.</p>
  <script src="https://unpkg.com/buildbanner@latest/buildbanner.min.js"></script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
