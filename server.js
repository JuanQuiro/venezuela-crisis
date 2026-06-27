const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Cache static assets aggressively
app.use(express.static(path.join(__dirname, 'docs'), {
  maxAge: '1h',
  setHeaders: (res, p) => {
    if (p.endsWith('.js') || p.endsWith('.css')) res.setHeader('Cache-Control', 'public, max-age=3600');
    if (p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.webp')) res.setHeader('Cache-Control', 'public, max-age=86400');
    if (p.endsWith('.json') || p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

// Only listen when run directly (not required by Vercel)
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`\n  🆘 VENEZUELA CRISIS - Conectado a Supabase`);
    console.log(`  ───────────────────────────────────────`);
    console.log(`  Local:  http://localhost:${PORT}`);
    console.log(`  Red:    http://${HOST === '0.0.0.0' ? '192.168.1.3' : HOST}:${PORT}`);
    console.log(`  ───────────────────────────────────────`);
    console.log(`  Los datos se sincronizan en TIEMPO REAL`);
    console.log(`  via Supabase Realtime (WebSockets).\n`);
  });
}

module.exports = app;
