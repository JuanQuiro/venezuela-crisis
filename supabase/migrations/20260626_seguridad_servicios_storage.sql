-- ==========================================================
-- Migration: Reportes de seguridad y servicios + Storage
-- ==========================================================

-- 1. Seguridad (saqueos, armas, zonas inseguras)
CREATE TABLE IF NOT EXISTS reportes_seguridad (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  tipo TEXT NOT NULL DEFAULT 'saqueo', -- saqueo, arma, zona_insegura, otro
  estatus TEXT DEFAULT 'reportado', -- reportado, verificado, descartado
  nombre TEXT,
  direccion TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  descripcion TEXT,
  reportado_por TEXT DEFAULT 'anónimo',
  fuente_tipo TEXT DEFAULT 'ciudadano',
  confiabilidad TEXT DEFAULT 'baja',
  denuncias_count INTEGER DEFAULT 0
);

-- 2. Servicios públicos
CREATE TABLE IF NOT EXISTS reportes_servicios (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  tipo TEXT NOT NULL DEFAULT 'agua', -- agua, electricidad, gas, telefonia, internet, otro
  estatus TEXT DEFAULT 'sin_servicio', -- sin_servicio, intermitente, restablecido
  nombre TEXT,
  direccion TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  descripcion TEXT,
  reportado_por TEXT DEFAULT 'anónimo',
  fuente_tipo TEXT DEFAULT 'ciudadano',
  confiabilidad TEXT DEFAULT 'baja',
  denuncias_count INTEGER DEFAULT 0
);

-- 3. Storage bucket for photos
INSERT INTO storage.buckets (id, name, public) VALUES ('reportes-fotos', 'reportes-fotos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public read access to any file
CREATE POLICY "Public read access" ON storage.objects
  FOR SELECT USING (bucket_id = 'reportes-fotos');

-- Allow authenticated/anonymous uploads
CREATE POLICY "Anyone can upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'reportes-fotos');

-- Allow users to delete their own uploads (by matching owner)
CREATE POLICY "Owners can delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'reportes-fotos' AND auth.uid() = owner);

-- 4. Centros de Ayuda (desplegados en mapa)
CREATE TABLE IF NOT EXISTS centros_ayuda (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'multiples', -- agua, comida, medico, refugio, multiples
  direccion TEXT,
  horario TEXT,
  contacto TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  reportado_por TEXT DEFAULT 'anónimo'
);

-- 5. Adjuntos multimedia (imagen, video, audio) — polimórfico
CREATE TABLE IF NOT EXISTS reporte_adjuntos (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  tabla TEXT NOT NULL,
  reporte_id BIGINT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'imagen', -- imagen, video, audio
  url TEXT NOT NULL,
  thumb_url TEXT,
  descripcion TEXT,
  tamaño_bytes BIGINT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_adjuntos_reporte ON reporte_adjuntos(tabla, reporte_id);

-- 6. Rutas Seguras (puntos de evacuación)
CREATE TABLE IF NOT EXISTS rutas_seguras (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'punto_encuentro', -- zona_segura, ruta, punto_encuentro
  descripcion TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  reportado_por TEXT DEFAULT 'anónimo'
);

-- =============================================
-- ROW LEVEL SECURITY — todas las tablas
-- =============================================
ALTER TABLE reportes_seguridad ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE centros_ayuda ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporte_adjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rutas_seguras ENABLE ROW LEVEL SECURITY;

-- Todos pueden leer
CREATE POLICY "Public read" ON reportes_seguridad FOR SELECT USING (true);
CREATE POLICY "Public read" ON reportes_servicios FOR SELECT USING (true);
CREATE POLICY "Public read" ON centros_ayuda FOR SELECT USING (true);
CREATE POLICY "Public read" ON reporte_adjuntos FOR SELECT USING (true);
CREATE POLICY "Public read" ON rutas_seguras FOR SELECT USING (true);

-- Todos pueden insertar (sistema abierto para crisis)
CREATE POLICY "Public insert" ON reportes_seguridad FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert" ON reportes_servicios FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert" ON centros_ayuda FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert" ON reporte_adjuntos FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert" ON rutas_seguras FOR INSERT WITH CHECK (true);

-- Nadie puede update/delete desde anónimo (solo moderadores con auth)
CREATE POLICY "Public update" ON reportes_seguridad FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Public delete" ON reportes_seguridad FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "Public update" ON reportes_servicios FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Public delete" ON reportes_servicios FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "Public update" ON centros_ayuda FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Public delete" ON centros_ayuda FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "Public update" ON reporte_adjuntos FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Public delete" ON reporte_adjuntos FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "Public update" ON rutas_seguras FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Public delete" ON rutas_seguras FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================
-- TABLAS: Desaparecidos + Encontrados
-- =============================================
CREATE TABLE IF NOT EXISTS desaparecidos (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  nombre TEXT NOT NULL DEFAULT '',
  edad TEXT DEFAULT '',
  sexo TEXT DEFAULT '',
  descripcion TEXT DEFAULT '',
  foto TEXT DEFAULT '',
  ultima_ubicacion TEXT DEFAULT '',
  ultima_vista TEXT DEFAULT '',
  telefono_contacto TEXT DEFAULT '',
  reportado_por TEXT DEFAULT 'Anónimo',
  notas TEXT DEFAULT '',
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  status TEXT DEFAULT 'buscando'
);
CREATE TABLE IF NOT EXISTS encontrados (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  nombre_aproximado TEXT DEFAULT '',
  edad_aproximada TEXT DEFAULT '',
  sexo TEXT DEFAULT '',
  descripcion TEXT DEFAULT '',
  foto TEXT DEFAULT '',
  ubicacion_actual TEXT DEFAULT '',
  quien_encontro TEXT DEFAULT '',
  telefono_contacto TEXT DEFAULT '',
  notas TEXT DEFAULT '',
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  status TEXT DEFAULT 'resguardado'
);
ALTER TABLE desaparecidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE encontrados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON desaparecidos FOR SELECT USING (true);
CREATE POLICY "Public read" ON encontrados FOR SELECT USING (true);
CREATE POLICY "Public insert" ON desaparecidos FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert" ON encontrados FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON desaparecidos FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Public update" ON encontrados FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Public delete" ON desaparecidos FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "Public delete" ON encontrados FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================
-- ÍNDICES DE RENDIMIENTO
-- =============================================
CREATE INDEX IF NOT EXISTS idx_seguridad_created ON reportes_seguridad(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seguridad_tipo ON reportes_seguridad(tipo);
CREATE INDEX IF NOT EXISTS idx_servicios_created ON reportes_servicios(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_servicios_tipo ON reportes_servicios(tipo);
CREATE INDEX IF NOT EXISTS idx_centros_created ON centros_ayuda(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rutas_created ON rutas_seguras(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personas_status ON personas(status);
CREATE INDEX IF NOT EXISTS idx_personas_created ON personas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_created ON feed(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_mensajes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_desaparecidos_status ON desaparecidos(status);
CREATE INDEX IF NOT EXISTS idx_desaparecidos_created ON desaparecidos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_encontrados_status ON encontrados(status);
CREATE INDEX IF NOT EXISTS idx_encontrados_created ON encontrados(created_at DESC);

-- =============================================
-- SERVER-SIDE RATE LIMITING
-- =============================================
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  endpoint TEXT NOT NULL DEFAULT 'insert'
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_session ON rate_limits(session_id, created_at DESC);

CREATE OR REPLACE FUNCTION check_rate_limit(p_session_id TEXT, p_max INT DEFAULT 15, p_window INT DEFAULT 60)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  recent_count INT;
BEGIN
  DELETE FROM rate_limits WHERE created_at < now() - interval '1 hour';
  SELECT COUNT(*) INTO recent_count FROM rate_limits
    WHERE session_id = p_session_id
    AND created_at > now() - (p_window || ' seconds')::interval;
  IF recent_count >= p_max THEN
    RETURN jsonb_build_object('allowed', false, 'message', format('⏳ Límite de %s reportes por minuto alcanzado. Esperá un momento.', p_max));
  END IF;
  INSERT INTO rate_limits (session_id, endpoint) VALUES (p_session_id, 'insert');
  RETURN jsonb_build_object('allowed', true, 'message', 'OK');
END;
$$;
