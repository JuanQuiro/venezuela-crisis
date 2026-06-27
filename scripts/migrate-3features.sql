-- =============================================
-- VENEZUELA CRISIS — Migración: 3 nuevas tablas
-- Features: Ayuda Humanitaria, Desaparecidos, Encontrados
-- =============================================

-- 1. AYUDA HUMANITARIA (internacional)
CREATE TABLE IF NOT EXISTS ayuda_humanitaria (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo TEXT NOT NULL,
  organizacion TEXT NOT NULL,
  tipo_ayuda TEXT NOT NULL DEFAULT 'multiples',
  descripcion TEXT,
  pais_origen TEXT,
  cantidad TEXT,
  estatus TEXT NOT NULL DEFAULT 'en_camino',
  fecha_anuncio TIMESTAMPTZ,
  fecha_llegada TIMESTAMPTZ,
  url_referencia TEXT,
  fuente TEXT NOT NULL DEFAULT 'medio',
  confiabilidad TEXT NOT NULL DEFAULT 'media',
  reportado_por TEXT NOT NULL DEFAULT 'Anónimo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. DESAPARECIDOS (personas buscadas)
CREATE TABLE IF NOT EXISTS desaparecidos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre TEXT NOT NULL,
  edad TEXT,
  sexo TEXT,
  descripcion TEXT,
  foto TEXT,
  ultima_ubicacion TEXT,
  ultima_vista TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  telefono_contacto TEXT,
  reportado_por TEXT NOT NULL DEFAULT 'Anónimo',
  notas TEXT,
  status TEXT NOT NULL DEFAULT 'buscando',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ENCONTRADOS (personas encontradas / resguardadas)
CREATE TABLE IF NOT EXISTS encontrados (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre_aproximado TEXT,
  edad_aproximada TEXT,
  sexo TEXT,
  descripcion TEXT,
  foto TEXT,
  ubicacion_actual TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  quien_encontro TEXT NOT NULL DEFAULT 'Anónimo',
  telefono_contacto TEXT,
  notas TEXT,
  status TEXT NOT NULL DEFAULT 'resguardado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_desaparecidos_status ON desaparecidos(status);
CREATE INDEX IF NOT EXISTS idx_encontrados_status ON encontrados(status);
CREATE INDEX IF NOT EXISTS idx_ayuda_hum_estatus ON ayuda_humanitaria(estatus);
