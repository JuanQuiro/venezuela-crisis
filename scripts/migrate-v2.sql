-- =============================================
-- VENEZUELA CRISIS — Migración v2
-- Features: Reporte Seguridad + Servicios Básicos
-- =============================================

-- 1. REPORTES DE SEGURIDAD (saqueos, inseguridad)
CREATE TABLE IF NOT EXISTS reportes_seguridad (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'saqueo',
  nombre TEXT NOT NULL,
  direccion TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  descripcion TEXT,
  contacto TEXT,
  reportado_por TEXT NOT NULL DEFAULT 'Anónimo',
  fuente_tipo TEXT NOT NULL DEFAULT 'ciudadano',
  confiabilidad TEXT NOT NULL DEFAULT 'baja',
  denuncias_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. REPORTES DE SERVICIOS BÁSICOS (agua, luz, gas, teléfono)
CREATE TABLE IF NOT EXISTS reportes_servicios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  direccion TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  estatus TEXT NOT NULL DEFAULT 'sin_servicio',
  descripcion TEXT,
  contacto TEXT,
  reportado_por TEXT NOT NULL DEFAULT 'Anónimo',
  fuente_tipo TEXT NOT NULL DEFAULT 'ciudadano',
  confiabilidad TEXT NOT NULL DEFAULT 'baja',
  denuncias_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_seguridad_tipo ON reportes_seguridad(tipo);
CREATE INDEX IF NOT EXISTS idx_servicios_tipo ON reportes_servicios(tipo);

-- =============================================
-- CREAR BUCKET DE STORAGE para fotos
-- =============================================
-- Ejecutar en el SQL Editor de Supabase:
-- 
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('crisis-fotos', 'crisis-fotos', true)
-- ON CONFLICT (id) DO NOTHING;
-- 
-- -- Permitir subida anónima (solo insert, no update/delete)
-- CREATE POLICY "Anon upload crisis-fotos"
-- ON storage.objects FOR INSERT TO anon
-- WITH CHECK (bucket_id = 'crisis-fotos');
-- 
-- CREATE POLICY "Public read crisis-fotos"
-- ON storage.objects FOR SELECT TO anon
-- USING (bucket_id = 'crisis-fotos');
