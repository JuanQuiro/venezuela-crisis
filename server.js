const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'docs')));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🆘 VENRES Crisis - Conectado a Supabase`);
  console.log(`  ───────────────────────────────────────`);
  console.log(`  Local:  http://localhost:${PORT}`);
  console.log(`  Red:    http://192.168.1.3:${PORT}`);
  console.log(`  ───────────────────────────────────────`);
  console.log(`  Los datos se sincronizan en TIEMPO REAL`);
  console.log(`  via Supabase Realtime (WebSockets).\n`);
});
