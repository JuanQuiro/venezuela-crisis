#!/usr/bin/env node
/**
 * Run the Supabase migration for the Venezuela Crisis app.
 *
 * Usage:
 *   node scripts/run-migration.mjs <service_role_key>
 *
 * Get the service_role key from Supabase Dashboard → Settings → API → service_role key
 */
import { readFileSync } from 'fs';

const SUPABASE_REF = 'eedvfmohqletqcgkxcuf';
const API_URL = `https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`;
const MIGRATION_FILE = 'supabase/migrations/20260626_seguridad_servicios_storage.sql';

const serviceRoleKey = process.argv[2];
if (!serviceRoleKey) {
  console.error('\n❌ Necesitás la service_role key de Supabase.');
  console.error('   Andá a: Supabase Dashboard → Settings → API → service_role key');
  console.error('   Uso: node scripts/run-migration.mjs <service_role_key>\n');
  process.exit(1);
}

const sql = readFileSync(MIGRATION_FILE, 'utf8');

function splitStatements(sql) {
  const stmts = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const p = i > 0 ? sql[i-1] : '';
    
    if (inString) {
      current += c;
      if (c === stringChar && p !== '\\') inString = false;
    } else if (c === "'" || c === '"') {
      current += c;
      inString = true;
      stringChar = c;
    } else if (c === ';' && p !== '-') {
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith('--')) stmts.push(trimmed);
      current = '';
    } else {
      current += c;
    }
  }
  
  const trimmed = current.trim();
  if (trimmed && !trimmed.startsWith('--')) stmts.push(trimmed);
  
  return stmts;
}

async function run() {
  console.log(`\n  🗄️  Ejecutando migración en Supabase (${SUPABASE_REF})...\n`);

  const statements = splitStatements(sql);
  console.log(`  📝 ${statements.length} sentencias SQL\n`);

  let ok = 0, fail = 0, skip = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i] + ';';
    const preview = stmt.replace(/\n/g, ' ').substring(0, 80);

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({ query: stmt })
      });

      if (res.ok || res.status === 201) {
        const result = await res.text().catch(() => '');
        if (result.includes('already exists') || result.includes('Duplicate')) {
          console.log(`  ⏭️  [${i+1}/${statements.length}] ${preview}... (ya existe)`);
          skip++;
        } else {
          console.log(`  ✅ [${i+1}/${statements.length}] ${preview}...`);
          ok++;
        }
      } else if (res.status === 400) {
        const err = await res.text().catch(() => '');
        if (err.includes('already exists') || err.includes('Duplicate') || err.includes('already been applied')) {
          console.log(`  ⏭️  [${i+1}/${statements.length}] ${preview}... (ya existe)`);
          skip++;
        } else {
          console.log(`  ⚠️  [${i+1}/${statements.length}] ${preview}...`);
          console.log(`      ↳ ${err.substring(0, 120)}`);
          fail++;
        }
      } else {
        const err = await res.text().catch(() => '');
        console.log(`  ⚠️  [${i+1}/${statements.length}] ${preview}...`);
        console.log(`      ↳ ${res.status}: ${err.substring(0, 120)}`);
        fail++;
      }
    } catch (e) {
      console.log(`  ❌ [${i+1}/${statements.length}] ${preview}...`);
      console.log(`      ↳ ${e.message}`);
      fail++;
    }
  }

  console.log(`\n  📊 Resultado: ${ok} OK · ${skip} ya existen · ${fail} fallos\n`);
  
  if (fail === 0) {
    console.log('  🎉 Migración completada exitosamente!\n');
  } else {
    console.log('  ⚠️  Algunas sentencias fallaron. Revisá los errores arriba.\n');
  }
}

run().catch(console.error);
