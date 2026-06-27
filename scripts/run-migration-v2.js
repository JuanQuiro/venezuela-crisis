#!/usr/bin/env node
const { readFileSync } = require('fs');

const key = process.argv[2];
if (!key) { console.error('Uso: node run-migration-v2.js <service_role_key>'); process.exit(1); }

const ref = 'eedvfmohqletqcgkxcuf';
const api = `https://api.supabase.com/v1/projects/${ref}/database/query`;
const sql = readFileSync('supabase/migrations/20260626_seguridad_servicios_storage.sql', 'utf8');

// Split by semicolons, remove comment-only fragments
function splitSQL(text) {
  const raw = text.split(';');
  const stmts = [];
  
  for (let part of raw) {
    part = part.trim();
    if (!part) continue;
    
    // Remove leading comment lines
    const lines = part.split('\n');
    const clean = lines.filter(l => !l.trim().startsWith('--')).join('\n').trim();
    
    if (clean) stmts.push(clean + ';');
  }
  
  return stmts;
}

const statements = splitSQL(sql);
console.log(`\n📝 ${statements.length} statements found\n`);

let ok = 0, skip = 0, fail = 0;

async function execSQL(stmt) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ query: stmt })
      });
      const txt = await res.text().catch(() => '');
      return { ok: res.ok || res.status === 201, status: res.status, body: txt };
    } catch (e) {
      if (attempt === 2) return { ok: false, status: 0, body: e.message };
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function main() {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const label = stmt.replace(/\n/g, ' ').substring(0, 80);
    
    const r = await execSQL(stmt);
    
    if (r.ok) {
      console.log(`  ✅ [${i+1}/${statements.length}] ${label}`);
      ok++;
    } else if (r.body.includes('already exists') || r.body.includes('Duplicate')) {
      console.log(`  ⏭️  [${i+1}/${statements.length}] ${label} (ya existe)`);
      skip++;
    } else {
      console.log(`  ⚠️  [${i+1}/${statements.length}] ${label}`);
      console.log(`      ↳ ${r.status}: ${r.body.substring(0, 120)}`);
      fail++;
    }
  }
  
  console.log(`\n📊 ${ok} OK · ${skip} ya existen · ${fail} fallos\n`);
  
  // Verify tables
  const v = await execSQL(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('reportes_seguridad','reportes_servicios','centros_ayuda','reporte_adjuntos','rutas_seguras') ORDER BY tablename;`);
  if (v.ok) {
    console.log('📋 Tablas existentes:', v.body);
  }
  
  // Test insert on reportes_seguridad
  console.log('\n🧪 Test de inserción...');
  const t = await execSQL(`INSERT INTO reportes_seguridad (tipo,descripcion,lat,lng) VALUES ('prueba','verificacion migracion',10.5,-66.9) RETURNING id;`);
  if (t.ok && t.status === 201) {
    const id = JSON.parse(t.body)[0]?.id;
    console.log(`  ✅ Insert OK (id=${id})`);
    await execSQL(`DELETE FROM reportes_seguridad WHERE id=${id};`);
    console.log(`  🧹 Test row cleaned up`);
  } else {
    console.log(`  ⚠️  ${t.status}: ${t.body.substring(0, 100)}`);
  }
  
  if (fail === 0) console.log('\n🎉 Migración completada!\n');
  else console.log(`\n⚠️  ${fail} fallos — revisar arriba\n`);
}

main().catch(console.error);
