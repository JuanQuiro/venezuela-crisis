#!/usr/bin/env node
const { readFileSync } = require('fs');

const key = process.argv[2];
if (!key) { console.error('Uso: node verify-migration.mjs <service_role_key>'); process.exit(1); }

const ref = 'eedvfmohqletqcgkxcuf';
const api = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function run() {
  // Try to create tables (IF NOT EXISTS so safe to re-run)
  const createSQL = readFileSync('supabase/migrations/20260626_seguridad_servicios_storage.sql', 'utf8');
  
  // Extract only CREATE TABLE statements and INDEX
  const lines = createSQL.split('\n').filter(l => l.trim());
  let createBlocks = [];
  let current = '';
  for (const line of lines) {
    current += line + '\n';
    if (line.trimEnd().endsWith(';')) {
      const trimmed = current.trim();
      if (trimmed.startsWith('CREATE TABLE') || 
          (trimmed.startsWith('CREATE INDEX')) ||
          (trimmed.startsWith('INSERT INTO storage'))) {
        createBlocks.push(trimmed);
      }
      current = '';
    }
  }

  console.log('\n=== CREANDO TABLAS ===\n');
  for (const stmt of createBlocks) {
    const preview = stmt.split('\n')[0].substring(0, 60);
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ query: stmt })
      });
      const txt = await res.text().catch(() => '');
      if (res.ok || res.status === 201) {
        console.log(`  ✅ ${preview}...`);
      } else if (txt.includes('already exists')) {
        console.log(`  ⏭️  ${preview}... (ya existe)`);
      } else {
        console.log(`  ⚠️  ${preview}... ${txt.substring(0, 100)}`);
      }
    } catch(e) { console.log(`  ❌ ${preview}... ${e.message}`); }
  }

  // Storage bucket + policies
  console.log('\n=== STORAGE ===\n');
  const storageSQL = [
    `INSERT INTO storage.buckets (id, name, public) VALUES ('reportes-fotos', 'reportes-fotos', true) ON CONFLICT (id) DO UPDATE SET public = true;`,
    `CREATE POLICY "Public read access" ON storage.objects FOR SELECT USING (bucket_id = 'reportes-fotos');`,
    `CREATE POLICY "Anyone can upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'reportes-fotos');`,
    `CREATE POLICY "Owners can delete" ON storage.objects FOR DELETE USING (bucket_id = 'reportes-fotos' AND auth.uid() = owner);`
  ];
  for (const stmt of storageSQL) {
    const preview = stmt.substring(0, 60);
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ query: stmt })
      });
      const txt = await res.text().catch(() => '');
      if (res.ok || res.status === 201) {
        console.log(`  ✅ ${preview}...`);
      } else if (txt.includes('already exists')) {
        console.log(`  ⏭️  ${preview}... (ya existe)`);
      } else {
        console.log(`  ⚠️  ${preview}... ${txt.substring(0, 100)}`);
      }
    } catch(e) { console.log(`  ❌ ${preview}... ${e.message}`); }
  }

  // RLS + policies for each table
  const tables = ['reportes_seguridad', 'reportes_servicios', 'centros_ayuda', 'reporte_adjuntos', 'rutas_seguras'];
  
  console.log('\n=== ROW LEVEL SECURITY ===\n');
  for (const table of tables) {
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ query: `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;` })
      });
      const txt = await res.text().catch(() => '');
      if (res.ok || res.status === 201) console.log(`  ✅ ALTER TABLE ${table} ENABLE RLS`);
      else if (txt.includes('already')) console.log(`  ⏭️  ALTER TABLE ${table} ENABLE RLS (ya) ${txt.substring(0,40)}`);
      else console.log(`  ⚠️  ${table}: ${txt.substring(0,80)}`);
    } catch(e) { console.log(`  ❌ ${table}: ${e.message}`); }
  }

  const policySets = [
    { name: 'Public read', op: 'FOR SELECT USING (true)' },
    { name: 'Public insert', op: 'FOR INSERT WITH CHECK (true)' },
    { name: 'Public update', op: `FOR UPDATE USING (auth.role() = 'authenticated')` },
    { name: 'Public delete', op: `FOR DELETE USING (auth.role() = 'authenticated')` }
  ];

  console.log('\n=== POLÍTICAS ===\n');
  for (const table of tables) {
    for (const p of policySets) {
      try {
        const res = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ query: `CREATE POLICY "${p.name}" ON ${table} ${p.op};` })
        });
        const txt = await res.text().catch(() => '');
        if (res.ok || res.status === 201) {
          console.log(`  ✅ ${p.name} ON ${table}`);
        } else if (txt.includes('already exists')) {
          console.log(`  ⏭️  ${p.name} ON ${table} (ya existe)`);
        } else {
          console.log(`  ⚠️  ${p.name} ON ${table}: ${txt.substring(0, 80)}`);
        }
      } catch(e) { console.log(`  ❌ ${p.name} ON ${table}: ${e.message}`); }
    }
  }

  // Final verification
  console.log('\n=== VERIFICACIÓN ===\n');
  const checks = [
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('reportes_seguridad','reportes_servicios','centros_ayuda','reporte_adjuntos','rutas_seguras') ORDER BY tablename;`,
    `SELECT COUNT(*) as policies FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('reportes_seguridad','reportes_servicios','centros_ayuda','reporte_adjuntos','rutas_seguras');`
  ];
  for (const stmt of checks) {
    const res = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ query: stmt })
    });
    const txt = await res.text();
    console.log(`  ${txt}\n`);
  }

  // Test insert on reportes_seguridad
  console.log('=== TEST DE INSERCIÓN ===\n');
  const testRes = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ query: `INSERT INTO reportes_seguridad (tipo, descripcion, lat, lng) VALUES ('prueba', 'test de migracion', 10.5, -66.9) RETURNING id;` })
  });
  const testTxt = await testRes.text();
  if (testRes.ok && testRes.status === 201) {
    const id = JSON.parse(testTxt)[0]?.id;
    console.log(`  ✅ Inserción exitosa! ID: ${id}`);
    // Cleanup
    await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ query: `DELETE FROM reportes_seguridad WHERE id = ${id};` })
    });
    console.log(`  🧹 Test row deleted`);
  } else {
    console.log(`  ⚠️  Insert falló: ${testTxt.substring(0, 100)}`);
  }

  console.log('\n✅ Migración completada!\n');
}

run().catch(console.error);
