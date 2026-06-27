(function() {
  'use strict';
  const SUPABASE_URL = 'https://eedvfmohqletqcgkxcuf.supabase.co';
  const ANON_KEY = 'sb_publishable_FA6pZQhz5-xy0PYvECMR2A_rbDrxBat';
  const $ = id => document.getElementById(id);
  let sb = null, map = null, layers = { centros: null, colapsadas: null, riesgo: null, sismos: null, usgs: null, feed: null, seguridad: null, servicios: null };
  let markers = { centros: [], colapsadas: [], riesgo: [], sismos: [] };
  let pendingLat = null, pendingLng = null;
  let pendingMedia = []; // { file, tipo, tipoFile, previewEl }
  let _submitting = false; // prevent double submit
  let _lastSubmit = 0; // rate limit timestamp
  let allData = { centros_acopio: [], zonas_colapsadas: [], edificios_riesgo: [], reportes_sismos: [], reportes_seguridad: [], reportes_servicios: [] };
  let cifras = [];
  let usgsQuakes = [];
  const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=2&maxlatitude=13&minlongitude=-74&maxlongitude=-59&minmagnitude=2.5&orderby=time&limit=30';

  let rutasSeguras = [];
  let rutasLayer = null;
  let centrosAyuda = [];
  let centrosAyudaLayer = null;

  let feedData = [];
  let feedFilter = 'todas';
  let feedTime = '24h';
  let chatData = [];
  let chatSub = null;
  let chatBroadcast = null;
  let personasData = [];
  let personasStatusFilter = 'todas';
  let personasSearchQuery = '';
  let sismosTime = '24h';
  let sismosMag = 'todas';
  let ayudaData = { atrapadas: [], hospitales: [], ninos: [], necesidades: [], mascotas: [], ayudantes: [], ayuda_humanitaria: [] };
  let ayudaFilter = 'todas';
  let desaparecidosData = [];
  let encontradosData = [];
  let desapView = 'desaparecidos';
  let desapSearchQuery = '';
  let heatLayer = null;
  let searchResults = [];
  let matches = [];
  let currentPersonaId = null; // for ?p=ID routing
  const FUENTES = { oficial:{label:'🏛 Gobierno/Oficial',color:'#3498db'}, organismo:{label:'🔬 Organismo Técnico',color:'#2ecc71'}, medio:{label:'📰 Medio',color:'#f39c12'}, ciudadano:{label:'👤 Ciudadano',color:'#95a5a6'}, otro:{label:'❓ Otra',color:'#7f8c8d'} };
  const CONFIABILIDAD = { alta:{label:'🟢 Alta',color:'#27ae60'}, media:{label:'🟡 Media',color:'#f39c12'}, baja:{label:'🔴 Baja',color:'#e74c3c'} };
  const CATS = { ultimo_minuto:{label:'⚡Último Min',color:'#9b59b6'}, alerta:{label:'🚨Alerta',color:'#e74c3c'}, noticia:{label:'📰Noticia',color:'#3498db'}, desplazamiento:{label:'🚶Desplaz.',color:'#e67e22'}, medicamentos:{label:'💊Medic.',color:'#27ae60'}, sismo:{label:'🔴Sismo',color:'#ff4444'} };
  const STATUS_PERSONA = { bien:{label:'✅ Bien',color:'#27ae60'}, herido:{label:'🆘 Herido',color:'#e74c3c'}, buscando_familiares:{label:'🔍 Busca familiares',color:'#f39c12'}, necesita_medicamentos:{label:'💊 Necesita medic.',color:'#9b59b6'}, voluntario:{label:'🙋 Voluntario',color:'#3498db'}, fallecido:{label:'💔 Fallecido',color:'#7f8c8d'} };

  const PAGE_SIZE = 50;
  let pageState = {};
  function initPage(key) { if (!pageState[key]) pageState[key] = { minId: null, hasMore: true, loading: false }; }
  async function loadPage(key, table, orderCol = 'id', append = false) {
    if (!append) { pageState[key] = { minId: null, hasMore: true, loading: false }; }
    initPage(key);
    const ps = pageState[key];
    if (ps.loading) return [];
    ps.loading = true;
    let query = sb.from(table).select('*').order(orderCol, { ascending: false }).limit(PAGE_SIZE);
    if (append && ps.minId != null) query = query.lt(orderCol, ps.minId);
    const { data, error } = await query;
    ps.loading = false;
    if (error) return [];
    if (data && data.length > 0) {
      const ids = data.map(r => r[orderCol]);
      ps.minId = Math.min(...ids);
      ps.hasMore = data.length >= PAGE_SIZE;
    } else {
      ps.hasMore = false;
    }
    return data || [];
  }
  const loadMoreBtn = (key, label = 'Ver más') =>
    `<button class="btn btn-outline btn-block load-more-btn" data-page-key="${key}" style="margin:8px 4px;font-size:13px;min-height:42px">📄 ${label}</button>`;

  function loadTesseract() {
    if (typeof Tesseract !== 'undefined') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar Tesseract.js'));
      document.head.appendChild(s);
    });
  }

  function getRateToken() {
    let token = localStorage.getItem('_rate_token');
    if (!token) { token = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2); localStorage.setItem('_rate_token', token); }
    return token;
  }
  async function checkServerRateLimit() {
    try {
      const { data, error } = await sb.rpc('check_rate_limit', { p_session_id: getRateToken() });
      if (error || !data) return true;
      if (!data.allowed) { showToast(data.message, 'error'); return false; }
      return true;
    } catch(e) { return true; }
  }

  function debounce(fn, ms) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  const AYUDA_TABLES = ['atrapadas','hospitales','ninos','necesidades','mascotas','ayudantes','ayuda_humanitaria'];
  const AYUDA_CONFIG = {
    atrapadas: {
      label: '🆘 Personas Atrapadas', icon: '🆘', table: 'personas_atrapadas',
      fields: (d) => `
<div class="pf-row"><div class="pf-field" style="flex:2"><label>📍 Ubicación / Dirección</label><input type="text" id="af_ubicacion" required placeholder="Ej: Esquina de San Juan, Caracas"></div><div class="pf-field" style="flex:0 0 auto"><label>&nbsp;</label><button type="button" id="afGpsBtn" class="btn btn-outline">📍</button></div></div>
<input type="hidden" id="afLat"><input type="hidden" id="afLng">
<label>👥 ¿Cuántas personas?</label><input type="number" id="af_cuantas" value="1" min="1" max="200">
<label>🏗️ Tipo de estructura</label><select id="af_estructura"><option value="edificio">Edificio</option><option value="casa">Casa</option><option value="comercio">Comercio</option><option value="escombro">Bajo escombros</option><option value="otro">Otro</option></select>
<label>🔴 Prioridad</label><select id="af_prioridad"><option value="alta">🔴 Alta</option><option value="media" selected>🟡 Media</option><option value="baja">🟢 Baja</option></select>
<label>📞 Contacto</label><input type="text" id="af_contacto" placeholder="Teléfono de quien reporta">
<label>📝 Notas</label><textarea id="af_notas" rows="2" placeholder="Estado, acceso, tipo de ayuda necesaria..."></textarea>
<label>Reportado por</label><input type="text" id="af_reportante" placeholder="Tu nombre" value="Anónimo">`,
      render: (d) => {
        const p = d.prioridad||'media'; const col = p==='alta'?'#e74c3c':p==='media'?'#f39c12':'#27ae60';
        return `<div class="ayuda-card-item atrapada ${d.rescatado?'rescatado':''}" style="border-left:4px solid ${col}">
          <div class="ayuda-card-header"><span class="feed-cat" style="background:${col}22;color:${col}">${p==='alta'?'🔴':p==='media'?'🟡':'🟢'} ${d.prioridad||'Media'}</span><span class="feed-time">${timeAgo(d.created_at)}</span></div>
          <div class="ayuda-card-title">🆘 ${d.cuantas_personas||'?'} persona(s) atrapada(s)</div>
          <div class="ayuda-card-desc">📍 ${escapeHtml(d.ubicacion||'Sin ubicación')}${d.tipo_estructura?' · 🏗️ '+escapeHtml(d.tipo_estructura):''}${d.rescatado?'<br><strong style="color:#27ae60">✅ Rescatado</strong>':''}</div>
          <div class="feed-card-footer">${d.contacto?'📞 '+escapeHtml(d.contacto):''}${d.reportado_por?' · 👤 '+escapeHtml(d.reportado_por):''}</div>
          ${!d.rescatado?`<button class="btn btn-success" style="padding:6px 10px;font-size:11px;margin-top:6px" onclick="app.rescatar('atrapadas',${d.id})">✅ Marcar rescatado</button>`:''}
        </div>`;
      }
    },
    hospitales: {
      label: '🏥 En Hospitales', icon: '🏥', table: 'en_hospitales',
      fields: (o) => `
<label>👤 Nombre de la persona</label><input type="text" id="af_nombre" required placeholder="Nombre completo">
<label>🏥 Hospital</label><input type="text" id="af_hospital" placeholder="Ej: Hospital Pérez de León">
<label>🩺 Estado</label><select id="af_estado"><option value="ingresado">🏥 Ingresado</option><option value="uci">🆘 UCI / Cuidados intensivos</option><option value="alta">✅ Dado de alta</option><option value="fallecido">💔 Fallecido</option></select>
<label>📞 Teléfono / Contacto</label><input type="text" id="af_telefono" placeholder="Teléfono de la persona o familiar">
<label>📝 Notas</label><textarea id="af_notas" rows="2" placeholder="Estado de salud, necesitan algo..."></textarea>
<label>Reportado por</label><input type="text" id="af_reportante" placeholder="Tu nombre" value="Anónimo">`,
      render: (d) => {
        const estados = {ingresado:{c:'#3498db',l:'🏥 Ingresado'},uci:{c:'#e74c3c',l:'🆘 UCI'},alta:{c:'#27ae60',l:'✅ Alta'},fallecido:{c:'#7f8c8d',l:'💔 Fallecido'}};
        const e = estados[d.estado]||estados.ingresado;
        return `<div class="ayuda-card-item hospital" style="border-left:4px solid ${e.c}">
          <div class="ayuda-card-header"><span class="feed-cat" style="background:${e.c}22;color:${e.c}">${e.l}</span><span class="feed-time">${timeAgo(d.created_at)}</span></div>
          <div class="ayuda-card-title">👤 ${escapeHtml(d.nombre||'?')}</div>
          <div class="ayuda-card-desc">🏥 ${escapeHtml(d.hospital||'Sin hospital')}${d.telefono?' · 📞 '+escapeHtml(d.telefono):''}</div>
          ${d.notas?`<div class="ayuda-card-desc" style="color:var(--text-muted);font-style:italic">${escapeHtml(d.notas)}</div>`:''}
          <div class="feed-card-footer">👤 ${escapeHtml(d.reportado_por||'Anónimo')}</div>
        </div>`;
      }
    },
    ninos: {
      label: '👶 Niños Solos', icon: '👶', table: 'ninos_solos',
      fields: (o) => `
<label>👤 Nombre (aproximado)</label><input type="text" id="af_nombre" placeholder="Ej: 'Niño de camisa roja' o nombre si se sabe">
<label>🎂 Edad aproximada</label><input type="text" id="af_edad" placeholder="Ej: 5 años, o 'bebé', 'adolescente'">
<label>🚻 Sexo</label><select id="af_sexo"><option value="">No especifica</option><option value="varón">Varón</option><option value="mujer">Mujer</option></select>
<label>📝 Descripción</label><textarea id="af_descripcion" rows="2" placeholder="Ropa, señas particulares, estado..."></textarea>
<label>📍 Dónde está resguardado</label><input type="text" id="af_ubicacion" placeholder="Ej: Casa de la Sra. María, El Cafetal">
<label>👤 Quién lo tiene</label><input type="text" id="af_quien" placeholder="Nombre de quien lo resguarda">
<label>📞 Teléfono de contacto</label><input type="text" id="af_telefono" placeholder="Teléfono del resguardante">
<label>Reportado por</label><input type="text" id="af_reportante" placeholder="Tu nombre" value="Anónimo">`,
      render: (d) => {
        const col = d.estado==='reunificado'?'#27ae60':d.estado==='en_proceso'?'#f39c12':'#e74c3c';
        return `<div class="ayuda-card-item nino" style="border-left:4px solid ${col}">
          <div class="ayuda-card-header"><span class="feed-cat" style="background:${col}22;color:${col}">${d.estado==='reunificado'?'✅ Reunificado':d.estado==='en_proceso'?'🔄 En proceso':'🔴 Resguardado'}</span><span class="feed-time">${timeAgo(d.created_at)}</span></div>
          <div class="ayuda-card-title">👶 ${escapeHtml(d.nombre_aproximado||'Nombre no disponible')}</div>
          <div class="ayuda-card-desc">${d.edad_aproximada?'🎂 '+escapeHtml(d.edad_aproximada):''}${d.sexo?' · '+escapeHtml(d.sexo):''}${d.descripcion?'<br>📝 '+escapeHtml(d.descripcion):''}</div>
          <div class="ayuda-card-desc">📍 ${escapeHtml(d.ubicacion||'Sin ubicación')}</div>
          ${d.quien_lo_tiene?`<div class="ayuda-card-desc">👤 Resguardo: ${escapeHtml(d.quien_lo_tiene)}${d.telefono_contacto?' · 📞 '+escapeHtml(d.telefono_contacto):''}</div>`:''}
          <div class="feed-card-footer">👤 ${escapeHtml(d.reportado_por||'Anónimo')}</div>
          ${d.estado!=='reunificado'?`<button class="btn btn-success" style="padding:6px 10px;font-size:11px;margin-top:6px" onclick="app.reunificar(${d.id})">✅ Marcar reunificado</button>`:''}
        </div>`;
      }
    },
    necesidades: {
      label: '💊 Necesidades', icon: '💊', table: 'necesidades',
      fields: (o) => `
<label>💊 Tipo de necesidad</label><select id="af_tipo"><option value="medicinas">💊 Medicinas</option><option value="agua">🚰 Agua</option><option value="comida">🍲 Comida</option><option value="oxigeno">🫁 Oxígeno</option><option value="ropa">👕 Ropa</option><option value="pañales">👶 Pañales</option><option value="higiene">🧴 Higiene</option><option value="otro">❓ Otro</option></select>
<label>📝 Descripción</label><textarea id="af_descripcion" rows="2" placeholder="¿Qué se necesita? ¿Cantidad? ¿Urgente?"></textarea>
<label>🔴 Prioridad</label><select id="af_prioridad"><option value="alta">🔴 Alta (urge)</option><option value="media" selected>🟡 Media</option><option value="baja">🟢 Baja</option></select>
<label>📍 Dónde se necesita</label><input type="text" id="af_ubicacion" placeholder="Ej: Ambulatorio Altamira">
<label>📞 Contacto</label><input type="text" id="af_contacto" placeholder="Quién recibe / teléfono">
<label>Reportado por</label><input type="text" id="af_reportante" placeholder="Tu nombre" value="Anónimo">`,
      render: (d) => {
        const col = d.prioridad==='alta'?'#e74c3c':d.prioridad==='media'?'#f39c12':'#27ae60';
        return `<div class="ayuda-card-item necesidad ${d.cubierta?'cubierta':''}" style="border-left:4px solid ${col}">
          <div class="ayuda-card-header"><span class="feed-cat" style="background:${col}22;color:${col}">${d.prioridad==='alta'?'🔴':d.prioridad==='media'?'🟡':'🟢'} ${d.prioridad||'Media'}</span><span class="feed-time">${timeAgo(d.created_at)}</span></div>
          <div class="ayuda-card-title">💊 ${d.tipo||'?'}</div>
          ${d.descripcion?`<div class="ayuda-card-desc">${escapeHtml(d.descripcion)}</div>`:''}
          <div class="ayuda-card-desc">📍 ${escapeHtml(d.ubicacion||'Sin ubicación')}</div>
          <div class="feed-card-footer">${d.contacto?'📞 '+escapeHtml(d.contacto):''}${d.reportado_por?' · 👤 '+escapeHtml(d.reportado_por):''}${d.cubierta?'<strong style="color:#27ae60"> · ✅ Cubierta</strong>':''}</div>
          ${!d.cubierta?`<button class="btn btn-success" style="padding:6px 10px;font-size:11px;margin-top:6px" onclick="app.cubrir(${d.id})">✅ Marcar como cubierta</button>`:''}
        </div>`;
      }
    },
    mascotas: {
      label: '🐾 Mascotas', icon: '🐾', table: 'mascotas',
      fields: (o) => `
<label>🐾 Tipo</label><select id="af_tipo"><option value="perro">🐕 Perro</option><option value="gato">🐈 Gato</option><option value="otro">🐹 Otro</option></select>
<label>🏷️ Estado</label><select id="af_estado"><option value="perdida">🔍 Perdida</option><option value="encontrada">🙌 Encontrada</option><option value="rescatada">🆘 Rescatada</option></select>
<label>📛 Nombre (si se sabe)</label><input type="text" id="af_nombre" placeholder="Nombre de la mascota">
<label>📝 Descripción</label><textarea id="af_descripcion" rows="2" placeholder="Raza, color, tamaño, señas..."></textarea>
<label>📍 Ubicación</label><input type="text" id="af_ubicacion" placeholder="Dónde se vio / dónde está">
<label>📞 Contacto</label><input type="text" id="af_contacto" placeholder="Tu teléfono">
<label>Reportado por</label><input type="text" id="af_reportante" placeholder="Tu nombre" value="Anónimo">`,
      render: (d) => {
        const col = d.estado==='perdida'?'#e74c3c':d.estado==='encontrada'?'#27ae60':'#f39c12';
        return `<div class="ayuda-card-item mascota" style="border-left:4px solid ${col}">
          <div class="ayuda-card-header"><span class="feed-cat" style="background:${col}22;color:${col}">${d.estado==='perdida'?'🔍 Perdida':d.estado==='encontrada'?'🙌 Encontrada':'🆘 Rescatada'}</span><span class="feed-time">${timeAgo(d.created_at)}</span></div>
          <div class="ayuda-card-title">${d.tipo==='perro'?'🐕':d.tipo==='gato'?'🐈':'🐹'} ${escapeHtml(d.nombre||(d.tipo==='perro'?'Perro':d.tipo==='gato'?'Gato':'Mascota'))}</div>
          ${d.descripcion?`<div class="ayuda-card-desc">${escapeHtml(d.descripcion)}</div>`:''}
          <div class="ayuda-card-desc">📍 ${escapeHtml(d.ubicacion||'Sin ubicación')}</div>
          <div class="feed-card-footer">${d.contacto?'📞 '+escapeHtml(d.contacto):''}${d.reportado_por?' · 👤 '+escapeHtml(d.reportado_por):''}</div>
        </div>`;
      }
    },
    ayuda_humanitaria: {
      label: '🏛 Ayuda Humanitaria', icon: '🏛', table: 'ayuda_humanitaria',
      inline: true,
      fields: (o) => `
<label>📰 Título</label><input type="text" id="af_titulo" required placeholder="Ej: Llegan 20 toneladas de ayuda de México">
<label>🏛 Organización</label><input type="text" id="af_organizacion" required placeholder="Ej: Cruz Roja Internacional, ONU, Gobierno de México">
<label>📦 Tipo de ayuda</label><select id="af_tipo_ayuda"><option value="alimentos">🍲 Alimentos</option><option value="medicinas">💊 Medicinas</option><option value="rescatistas">🆘 Rescatistas</option><option value="equipos">🔧 Equipos</option><option value="dinero">💰 Donaciones</option><option value="agua">🚰 Agua</option><option value="multiples">📦 Múltiple</option><option value="otro">❓ Otro</option></select>
<label>🌍 País de origen</label><input type="text" id="af_pais" placeholder="Ej: México, Estados Unidos, Rusia">
<label>📦 Cantidad / Detalle</label><input type="text" id="af_cantidad" placeholder="Ej: '20 toneladas', '100 rescatistas', 'USD $2M'">
<label>📊 Estatus</label><select id="af_estatus"><option value="anunciado">📢 Anunciado</option><option value="en_camino">✈️ En camino</option><option value="recibido">✅ Recibido</option><option value="distribuido">📬 En distribución</option></select>
<label>📅 Fecha de anuncio</label><input type="date" id="af_fecha_anuncio">
<label>📅 Fecha de llegada</label><input type="date" id="af_fecha_llegada">
<label>🔗 URL de referencia (noticia)</label><input type="url" id="af_url" placeholder="https://..." maxlength="300">
<label>📝 Descripción</label><textarea id="af_descripcion" rows="2" placeholder="Detalles de la ayuda humanitaria..." maxlength="1000"></textarea>
<label>Reportado por</label><input type="text" id="af_reportante" placeholder="Tu nombre o medio" value="Anónimo">`,
      render: (d) => {
        const col = d.estatus==='recibido'?'#27ae60':d.estatus==='distribuido'?'#3498db':d.estatus==='en_camino'?'#f39c12':'#7f8c8d';
        const estatusLabels = {anunciado:'📢 Anunciado',en_camino:'✈️ En camino',recibido:'✅ Recibido',distribuido:'📬 Distribuido'};
        return `<div class="ayuda-card-item ayuda-hum" style="border-left:4px solid ${col}">
          <div class="ayuda-card-header"><span class="feed-cat" style="background:${col}22;color:${col}">${estatusLabels[d.estatus]||d.estatus}</span><span class="feed-time">${timeAgo(d.created_at)}</span></div>
          <div class="ayuda-card-title">🏛 ${escapeHtml(d.titulo||'?')}</div>
          <div class="ayuda-card-desc"><strong>${escapeHtml(d.organizacion||'?')}</strong>${d.pais_origen?' · 🌍 '+escapeHtml(d.pais_origen):''}${d.cantidad?' · 📦 '+escapeHtml(d.cantidad):''}</div>
          ${d.descripcion?`<div class="ayuda-card-desc" style="color:var(--text-muted);font-size:12px">${escapeHtml(d.descripcion)}</div>`:''}
          ${d.url_referencia?`<div class="ayuda-card-desc"><a href="${d.url_referencia}" target="_blank" style="color:#3498db;font-size:12px">🔗 Fuente ↗</a></div>`:''}
          <div class="feed-card-footer">🏛 ${escapeHtml(d.reportado_por||'Anónimo')}</div>
        </div>`;
      }
    },
    ayudantes: {
      label: '🙋 Ayudantes/Voluntarios', icon: '🙋', table: 'ayudantes',
      fields: (o) => `
<label>👤 Tu nombre</label><input type="text" id="af_nombre" required placeholder="Nombre completo">
<label>📞 Teléfono</label><input type="text" id="af_telefono" required placeholder="0412-...">
<label>🔧 Tipo de ayuda</label><select id="af_tipo"><option value="medico">🏥 Médico / Enfermero</option><option value="rescatista">🆘 Rescatista</option><option value="conductor">🚗 Conductor / Transporte</option><option value="cocinero">🍲 Cocina / Alimentos</option><option value="albergue">🏠 Ofrezco albergue</option><option value="traduccion">🌐 Traducción / Comunicaciones</option><option value="carga">📦 Acopio / Carga</option><option value="otro">❓ Otro</option></select>
<label>📍 Zona / Ubicación</label><input type="text" id="af_ubicacion" placeholder="¿Dónde estás o dónde puedes ayudar?">
<label>📝 Notas</label><textarea id="af_notas" rows="2" placeholder="Disponibilidad horaria, herramientas, vehículo..."></textarea>
<label>Reportado por</label><input type="text" id="af_reportante" placeholder="Tu nombre" value="Anónimo">`,
      render: (d) => {
        return `<div class="ayuda-card-item ayudante" style="border-left:4px solid #3498db">
          <div class="ayuda-card-header"><span class="feed-cat" style="background:#3498db22;color:#3498db">${d.disponible?'✅ Disponible':'⏰ No disponible'}</span><span class="feed-time">${timeAgo(d.created_at)}</span></div>
          <div class="ayuda-card-title">🙋 ${escapeHtml(d.nombre||'?')}</div>
          <div class="ayuda-card-desc">🔧 ${escapeHtml(d.tipo||'No especifica')}${d.telefono?' · 📞 '+escapeHtml(d.telefono):''}</div>
          ${d.ubicacion?`<div class="ayuda-card-desc">📍 ${escapeHtml(d.ubicacion)}</div>`:''}
          ${d.notas?`<div class="ayuda-card-desc" style="color:var(--text-muted);font-style:italic">${escapeHtml(d.notas)}</div>`:''}
          <div class="feed-card-footer">👤 ${escapeHtml(d.reportado_por||'Anónimo')}</div>
        </div>`;
      }
    }
  };

  function initSB() { sb = window.supabase.createClient(SUPABASE_URL, ANON_KEY); }

  async function loadAll() {
    const results = await Promise.allSettled([
      ...['centros_acopio','zonas_colapsadas','edificios_riesgo','reportes_sismos'].map(t => sb.from(t).select('*').order('id',{ascending:false})),
      sb.from('cifras').select('*').order('prioridad',{ascending:true}),
      loadPage('seguridad', 'reportes_seguridad'),
      loadPage('servicios', 'reportes_servicios'),
    ]);
    const val = (i) => results[i]?.status === 'fulfilled' ? (results[i].value?.data||[]) : [];
    allData.centros_acopio = val(0).reverse();
    allData.zonas_colapsadas = val(1).reverse();
    allData.edificios_riesgo = val(2).reverse();
    allData.reportes_sismos = val(3).reverse();
    cifras = results[4]?.status === 'fulfilled' ? (results[4].value?.data||[]) : [];
    allData.reportes_seguridad = results[5]?.status === 'fulfilled' ? (results[5].value||[]) : [];
    allData.reportes_servicios = results[6]?.status === 'fulfilled' ? (results[6].value||[]) : [];
    results.forEach((r, i) => { if (r.status === 'rejected') console.warn('Tabla ' + i + ' falló:', r.reason); });
  }

  let realtimeChannel = null;

  function subscribe() {
    if (realtimeChannel) realtimeChannel.unsubscribe();
    realtimeChannel = sb.channel('app-realtime');
    // All tables consolidated into one channel
    ['centros_acopio','zonas_colapsadas','edificios_riesgo','reportes_sismos','reportes_seguridad','reportes_servicios','denuncias','cifras','personas','centros_ayuda'].forEach(t => {
      realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
        if (['centros_acopio','zonas_colapsadas','edificios_riesgo','reportes_sismos','reportes_seguridad','reportes_servicios','denuncias','cifras'].includes(t)) refresh();
        if (t === 'personas') loadPersonas();
        if (t === 'centros_ayuda') loadCentrosAyuda();
      });
    });
    // Feed — special handling (insert unshift)
    realtimeChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed' }, payload => {
      feedData.unshift(payload.new);
      if (feedData.length > 100) feedData.pop();
      renderFeed(); renderFeedMap();
    });
    // Desaparecidos + Encontrados
    realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'desaparecidos' }, () => loadDesaparecidos());
    realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'encontrados' }, () => loadEncontrados());
    // All 7 ayuda tables in one channel
    AYUDA_TABLES.forEach(key => {
      realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table: AYUDA_CONFIG[key].table }, () => loadAyudaTable(key));
    });
    realtimeChannel.subscribe();
  }

  function initMap() {
    map = L.map('map', { center: [10.4800, -67.5000], zoom: 7, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM | VENEZUELA CRISIS', maxZoom: 19 }).addTo(map);
    map.on('click', e => { pendingLat = e.latlng.lat; pendingLng = e.latlng.lng; });
  }

  async function fetchUSGS() {
    try {
      const r = await fetch(USGS_URL);
      const d = await r.json();
      usgsQuakes = (d.features||[]).map(f => ({
        id: f.id, mag: f.properties.mag, lugar: f.properties.place,
        time: f.properties.time, url: f.properties.url,
        depth: f.geometry.coordinates[2], lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
        tipo: f.properties.mag >= 5 ? 'moderado' : 'leve'
      }));
      renderUSGS();
    } catch(e) { console.error('USGS feed error:', e); }
  }

  function renderUSGS() {
    if (layers.usgs) { map.removeLayer(layers.usgs); layers.usgs = null; }
    const g = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    usgsQuakes.forEach(q => {
      const col = q.mag >= 5 ? '#e74c3c' : q.mag >= 4 ? '#f39c12' : '#3498db';
      const r = q.mag >= 5 ? 14 : q.mag >= 4 ? 10 : 7;
      L.circleMarker([q.lat, q.lng], {
        radius: r, color: col, fillColor: col, fillOpacity: 0.6, weight: 2, opacity: 0.8
      }).bindPopup(`<div class="popup-content"><h3>📡 USGS — M${q.mag}</h3>
        <p>📍 ${escapeHtml(q.lugar)}</p><p>📏 ${q.depth.toFixed(1)} km profundidad</p>
        <p>🕐 ${new Date(q.time).toLocaleString('es-VE')}</p>
        <p style="font-size:10px;color:var(--text-muted)">Fuente: USGS · actualiza cada 60s</p>
        <a href="${q.url}" target="_blank" style="color:#3498db;font-size:11px">Ver en USGS ↗</a></div>`).addTo(g);
    });
    g.addTo(map); layers.usgs = g;
  }

  /* ========== FEED ========== */

  async function loadFeed() {
    const data = await loadPage('feed', 'feed');
    feedData = data || [];
    renderFeed();
  }

  // Feed subscription consolidated into subscribe()

  function usgsToFeed() {
    return usgsQuakes.map(q => ({
      _usgs: true, id: 'usgs-'+q.id, titulo: `M${q.mag} — ${q.lugar}`,
      descripcion: `📏 ${q.depth.toFixed(1)} km profundidad · Fuente: USGS / Funvisis / SGC`,
      categoria: 'sismo', created_at: new Date(q.time).toISOString(),
      ubicacion_nombre: q.lugar, lat: q.lat, lng: q.lng,
      fuente_tipo: 'organismo', confiabilidad: 'alta', reportado_por: 'USGS',
      mag: q.mag, depth: q.depth
    }));
  }

  function renderFeed() {
    const el = document.getElementById('feedTimeline');
    if (!el) return;
    const cutoff = feedTime === 'ahora' ? Date.now() - 300000 : feedTime === '1h' ? Date.now() - 3600000 : feedTime === '24h' ? Date.now() - 86400000 : 0;
    let combined = [...feedData.map(f => ({ ...f, _usgs: false })), ...usgsToFeed()];
    combined = combined.filter(f => new Date(f.created_at).getTime() >= cutoff);
    if (feedFilter !== 'todas') combined = combined.filter(f => f.categoria === feedFilter);
    combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (!combined.length) {
      el.innerHTML = `<div class="feed-empty">${feedTime === 'ahora' ? '⚠️ Sin actividad en los últimos 5 minutos' : feedTime === '1h' ? '⚠️ Sin actividad en la última hora' : feedTime === '24h' ? '⚠️ Sin actividad en las últimas 24h' : 'No hay actividad aún.'}</div>`;
      return;
    }
    el.innerHTML = combined.map(f => feedCard(f)).join('') + (pageState.feed?.hasMore ? loadMoreBtn('feed') : '');
  }

  function feedCard(f) {
    const cat = CATS[f.categoria]||{label:'❓',color:'#7f8c8d'};
    const fuente = FUENTES[f.fuente_tipo]||FUENTES.otro;
    const conf = CONFIABILIDAD[f.confiabilidad]||CONFIABILIDAD.media;
    const t = timeAgo(f.created_at);
    const coords = (f.lat != null && f.lng != null) ? `onclick="app.feedMap(${f.lat},${f.lng})"` : '';
    const isSismo = f.categoria === 'sismo';
    return `<div class="feed-card" style="border-left:4px solid ${cat.color}">
      <div class="feed-card-header">
        <span class="feed-cat" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">${cat.label}${isSismo ? ' M'+(f.mag||'') : ''}</span>
        ${f.verificada ? '<span class="feed-cat verified-badge">✅ Verificado</span>' : ''}
        <span class="feed-time">${t}</span>
      </div>
      <div class="feed-card-title">${escapeHtml(f.titulo)}</div>
      ${f.descripcion ? `<div class="feed-card-desc">${escapeHtml(f.descripcion)}</div>` : ''}
      <div class="feed-card-footer">
        ${isSismo ? `<span style="font-weight:600;color:#ff6666">📡 ${escapeHtml(f.reportado_por)} / Funvisis / SGC</span>` : `<span>${fuente.label}</span>`}
        <span>${conf.label}</span>
        ${f.ubicacion_nombre ? `<span class="feed-loc" ${coords}>📍 ${escapeHtml(f.ubicacion_nombre)}</span>` : ''}
        ${f.verificada_por ? `<span style="color:#27ae60;font-weight:600">🏛 ${escapeHtml(f.verificada_por)}</span>` : ''}
      </div>
    </div>`;
  }

  function timeAgo(ts) {
    const s = Math.floor((new Date() - new Date(ts)) / 1000);
    if (s < 60) return 'Justo ahora';
    const m = Math.floor(s / 60);
    if (m < 60) return `Hace ${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `Hace ${h}h`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'Ayer' : `Hace ${d}d`;
  }

  function renderFeedMap() {
    if (!map) return;
    if (layers.feed) { map.removeLayer(layers.feed); layers.feed = null; }
    const allItems = [...feedData.filter(f => f.lat != null && f.lng != null), ...usgsToFeed().filter(f => f.lat != null && f.lng != null)];
    if (!allItems.length) return;
    const g = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    allItems.forEach(f => {
      const cat = CATS[f.categoria]||{color:'#7f8c8d'};
      const t = timeAgo(f.created_at);
      L.circleMarker([f.lat, f.lng], {
        radius: 6, color: cat.color, fillColor: cat.color, fillOpacity: 0.5, weight: 2
      }).bindPopup(`<div style="font-size:12px"><strong>${escapeHtml(f.titulo)}</strong><br>${escapeHtml(f.descripcion||'')}<br><span style="color:var(--text-muted);font-size:10px">${t}</span></div>`).addTo(g);
    });
    g.addTo(map); layers.feed = g;
  }

  async function submitFeed(e) {
    e.preventDefault();
    if (!(await checkServerRateLimit())) return;
    const titulo = document.getElementById('feedTitulo').value.trim();
    const categoria = document.getElementById('feedCategoria').value;
    const descripcion = document.getElementById('feedDescripcion').value.trim();
    const ubicacion_nombre = document.getElementById('feedUbicacion').value.trim();
    const fuente_tipo = document.getElementById('feedFuenteTipo').value;
    const confiabilidad = document.getElementById('feedConfiabilidad').value;
    const reportado_por = document.getElementById('feedReportadoPor').value.trim()||'anónimo';
    if (!titulo) return alert('El título es obligatorio.');
    const record = { titulo, categoria, descripcion, ubicacion_nombre, fuente_tipo, confiabilidad, reportado_por };
    if (pendingLat != null && pendingLng != null) { record.lat = pendingLat; record.lng = pendingLng; }
    const { error } = await sb.from('feed').insert(record);
    if (error) { showToast('❌ Error: '+error.message, 'error'); return; }
    document.getElementById('feedForm').reset();
    document.getElementById('feedModal').classList.add('hidden');
    pendingLat = null; pendingLng = null;
    renderFeed(); renderFeedMap();
  }

  /* ========== REPORTES SEGURIDAD / SERVICIOS MAPA ========== */

  function renderSeguridadMap() {
    if (!map) return;
    if (layers.seguridad) { map.removeLayer(layers.seguridad); layers.seguridad = null; }
    const items = allData.reportes_seguridad.filter(r => r.lat != null && r.lng != null);
    const mapContainer = document.getElementById('reportSeguridadList');
    if (mapContainer && pageState.seguridad?.hasMore && !mapContainer.querySelector('.load-more-btn')) {
      const vm = document.createElement('div');
      vm.innerHTML = loadMoreBtn('seguridad');
      mapContainer.appendChild(vm.firstElementChild);
    }
    if (!items.length) return;
    const g = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    const iconMap = { saqueo:'🦹', arma:'🔫', zona_insegura:'⚠️', otro:'❓' };
    const colMap = { saqueo:'#e74c3c', arma:'#ff0000', zona_insegura:'#f39c12', otro:'#7f8c8d' };
    items.forEach(r => {
      const col = colMap[r.tipo]||'#e74c3c';
      L.marker([r.lat,r.lng],{icon:divIcon(iconMap[r.tipo]||'⚠️',col)}).bindPopup(seguridadPop(r)).addTo(g);
    });
    g.addTo(map); layers.seguridad = g;
  }

  function renderServiciosMap() {
    if (!map) return;
    if (layers.servicios) { map.removeLayer(layers.servicios); layers.servicios = null; }
    const items = allData.reportes_servicios.filter(r => r.lat != null && r.lng != null);
    if (!items.length) return;
    const g = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    const iconMap = { agua:'🚰', electricidad:'⚡', gas:'🔥', telefonia:'📡', internet:'🌐', otro:'🔧' };
    const colMap = { agua:'#3498db', electricidad:'#f39c12', gas:'#e74c3c', telefonia:'#9b59b6', internet:'#2ecc71', otro:'#7f8c8d' };
    items.forEach(r => {
      const col = colMap[r.tipo]||'#3498db';
      L.marker([r.lat,r.lng],{icon:divIcon(iconMap[r.tipo]||'🔧',col)}).bindPopup(servicioPop(r)).addTo(g);
    });
    g.addTo(map); layers.servicios = g;
  }

  function seguridadPop(r) {
    const d = r.denuncias_count||0;
    const tipos = { saqueo:'🦹 Saqueo', arma:'🔫 Gente armada', zona_insegura:'⚠️ Zona insegura', otro:'❓ Otro' };
    return `<div class="popup-content" style="${denunciadoCSS(d)}"><h3>${tipos[r.tipo]||'🚨 Reporte'}</h3>
      <p style="margin:4px 0">${badgeFuente(r.fuente_tipo)} ${badgeConf(r.confiabilidad)} ${badgeDenuncias(d)}</p>
      <p>📍 ${escapeHtml(r.direccion||r.nombre||'')}</p><p>${escapeHtml(r.descripcion||'')}</p>
      <p style="font-size:11px;color:var(--text-muted)">👤 ${escapeHtml(r.reportado_por||'Anónimo')}</p>
      <button onclick="app.detail('seguridad',${r.id})" style="background:var(--primary);color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;margin-top:6px">Ver más</button>${btnDenunciar('seguridad',r.id)}</div>`;
  }

  function servicioPop(r) {
    const d = r.denuncias_count||0;
    const tipos = { agua:'🚰 Agua', electricidad:'⚡ Electricidad', gas:'🔥 Gas', telefonia:'📡 Telefonía', internet:'🌐 Internet', otro:'🔧 Otro' };
    const estatus = { sin_servicio:'🔴 Sin servicio', intermitente:'🟡 Intermitente', restablecido:'🟢 Restablecido' };
    return `<div class="popup-content" style="${denunciadoCSS(d)}"><h3>${tipos[r.tipo]||'🔧 Servicio'}</h3>
      <p style="margin:4px 0">${badgeFuente(r.fuente_tipo)} ${badgeConf(r.confiabilidad)} ${badgeDenuncias(d)}</p>
      <p>${estatus[r.estatus]||r.estatus}</p>
      <p>📍 ${escapeHtml(r.direccion||r.nombre||'')}</p><p>${escapeHtml(r.descripcion||'')}</p>
      <p style="font-size:11px;color:var(--text-muted)">👤 ${escapeHtml(r.reportado_por||'Anónimo')}</p>
      <button onclick="app.detail('servicio',${r.id})" style="background:var(--primary);color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;margin-top:6px">Ver más</button>${btnDenunciar('servicio',r.id)}</div>`;
  }

  /* ========== CHAT ========== */

  async function loadChat() {
    const { data } = await sb.from('chat_mensajes').select('*').order('id', { ascending: true }).limit(200);
    chatData = data||[];
    renderChat();
  }

  function subscribeChat() {
    if (chatSub) chatSub.unsubscribe();
    chatSub = sb.channel('chat-cambios');
    chatSub.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensajes' }, payload => {
      chatData.push(payload.new);
      if (chatData.length > 500) chatData.shift();
      renderChat();
    });
    chatSub.subscribe();

    chatBroadcast = sb.channel('chat-typing');
    chatBroadcast.on('broadcast', { event: 'typing' }, payload => {
      const el = document.getElementById('chatTyping');
      if (payload.payload.alias && payload.payload.alias !== currentAlias()) {
        el.textContent = `✍️ ${payload.payload.alias} está escribiendo...`;
        el.style.display = 'block';
        clearTimeout(el._typingTimer);
        el._typingTimer = setTimeout(() => { el.style.display = 'none'; }, 2500);
      }
    });
    chatBroadcast.subscribe();
  }

  function currentAlias() { return document.getElementById('chatAlias').value.trim() || 'Anónimo'; }

  function renderChat() {
    const el = document.getElementById('chatMessages');
    if (!el) return;
    const alias = currentAlias();
    const scrolledToBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50;
    el.innerHTML = chatData.map(m => {
      const isMe = m.alias === alias;
      const color = stringToColor(m.alias);
      return `<div class="chat-msg ${isMe ? 'chat-msg-me' : ''}">
        <div class="chat-bubble" style="${isMe ? '' : 'border-left:3px solid '+color}">
          <div class="chat-alias" style="color:${color}">${m.alias}</div>
          <div class="chat-text">${escapeHtml(m.mensaje)}</div>
          <div class="chat-time">${new Date(m.created_at).toLocaleTimeString('es-VE', {hour:'2-digit',minute:'2-digit'})}</div>
        </div>
      </div>`;
    }).join('');
    if (scrolledToBottom || !chatData.length) el.scrollTop = el.scrollHeight;
  }

  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function stringToColor(s) {
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
    const colors = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#34495e'];
    return colors[Math.abs(hash) % colors.length];
  }

  async function sendChat() {
    const input = document.getElementById('chatInput');
    const alias = document.getElementById('chatAlias').value.trim() || 'Anónimo';
    const mensaje = input.value.trim();
    if (!mensaje) return;
    if (!(await checkServerRateLimit())) return;
    input.value = '';
    document.getElementById('chatSend').disabled = true;
    const { error } = await sb.from('chat_mensajes').insert({ alias, mensaje });
    if (error) { console.error('Chat error:', error); showToast('❌ Error: '+error.message, 'error'); document.getElementById('chatSend').disabled = false; return; }
    setTimeout(() => document.getElementById('chatSend').disabled = false, 300);
  }

  function emitTyping() {
    const alias = currentAlias();
    if (chatBroadcast && alias) chatBroadcast.send({ type: 'broadcast', event: 'typing', payload: { alias } }).catch(()=>{});
  }

  /* ========== PERSONAS ========== */

  async function loadPersonas() {
    const data = await loadPage('personas', 'personas');
    personasData = data || [];
    renderPersonas();
  }

  // Personas subscription consolidated into subscribe()

  function renderPersonas() {
    const el = document.getElementById('personasList');
    if (!el) return;
    let filtered = personasData;
    if (personasStatusFilter !== 'todas') filtered = filtered.filter(p => p.status === personasStatusFilter);
    if (personasSearchQuery) {
      const q = personasSearchQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      filtered = filtered.filter(p => (p.nombre||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q));
    }
    if (!filtered.length) {
      el.innerHTML = '<div class="feed-empty">No hay personas registradas. ¡Registrate para que te encuentren!</div>';
      return;
    }
    const hasMore = pageState.personas?.hasMore && !personasSearchQuery;
    el.innerHTML = filtered.map(p => {
      const st = STATUS_PERSONA[p.status]||STATUS_PERSONA.bien;
      const t = timeAgo(p.created_at);
      const foto = p.foto ? `<img src="${p.foto}" class="persona-foto">` : `<div class="persona-foto persona-foto-placeholder">${p.nombre.charAt(0).toUpperCase()}</div>`;
      const needs = p.necesidades&&p.necesidades.length ? `<div class="persona-needs">🆘 ${(Array.isArray(p.necesidades)?p.necesidades:[]).join(', ')}</div>` : '';
      return `<div class="persona-card">
        ${foto}
        <div class="persona-info">
          <div class="persona-name">${escapeHtml(p.nombre)}</div>
          <span class="persona-status" style="background:${st.color}22;color:${st.color};border:1px solid ${st.color}44">${st.label}</span>
          ${p.ubicacion_texto ? `<div class="persona-loc">📍 ${escapeHtml(p.ubicacion_texto)}</div>` : ''}
          ${p.telefono ? `<div class="persona-tel">📞 ${escapeHtml(p.telefono)}</div>` : ''}
          ${needs}
          ${p.notas ? `<div class="persona-notes">${escapeHtml(p.notas)}</div>` : ''}
          <div class="persona-time">${t}</div>
        </div>
        <div class="persona-share">
          <button class="btn btn-outline" onclick="app.shareWhatsApp(${p.id},'${(p.nombre||'').replace(/'/g,"\\'")}','${(STATUS_PERSONA[p.status]||{label:''}).label}','${(p.ubicacion_texto||'').replace(/'/g,"\\'")}','${(p.telefono||'').replace(/'/g,"\\'")}')">📲 WhatsApp</button>
          <button class="btn btn-outline" onclick="app.copiarLink(${p.id})">🔗 Link</button>
        </div>
      </div>`;
    }).join('');
    // Append hospital matches for family search
    if (personasSearchQuery && ayudaData.hospitales) {
      const hq = personasSearchQuery.toLowerCase();
      const hospMatches = ayudaData.hospitales.filter(p => p.nombre && p.nombre.toLowerCase().includes(hq));
      if (hospMatches.length) {
        let extra = '<div style="font-size:11px;color:var(--text-muted);margin:8px 0;text-align:center">🏥 Personas en hospitales con ese nombre:</div>';
        extra += hospMatches.map(p => {
          const estados = {ingresado:{c:'#3498db',l:'🏥'},uci:{c:'#e74c3c',l:'🆘'},alta:{c:'#27ae60',l:'✅'},fallecido:{c:'#7f8c8d',l:'💔'}};
          const e = estados[p.estado]||estados.ingresado;
          return `<div class="persona-card" style="border-left:4px solid ${e.c};margin-top:6px">
            <div class="persona-foto persona-foto-placeholder" style="background:${e.c}">👤</div>
            <div class="persona-info">
              <div class="persona-name">${escapeHtml(p.nombre)}</div>
              <span class="persona-status" style="background:${e.c}22;color:${e.c}">${e.l} ${p.estado||'ingresado'}</span>
              ${p.hospital ? `<div class="persona-loc">🏥 ${escapeHtml(p.hospital)}</div>` : ''}
              ${p.telefono ? `<div class="persona-tel">📞 ${escapeHtml(p.telefono)}</div>` : ''}
              <div class="persona-time">${timeAgo(p.created_at)}</div>
            </div>
          </div>`;
        }).join('');
        el.innerHTML += extra;
      }
    }
    if (hasMore) el.innerHTML += loadMoreBtn('personas');
  }

  async function submitPersona(e) {
    e.preventDefault();
    if (!(await checkServerRateLimit())) return;
    const nombre = document.getElementById('pNombre').value.trim();
    const status = document.getElementById('pStatus').value;
    const ubicacion_texto = document.getElementById('pUbicacion').value.trim();
    const telefono = document.getElementById('pTelefono').value.trim();
    const notas = document.getElementById('pNotas').value.trim();
    const necesidades = document.getElementById('pNecesidades').value.trim().split(',').map(s=>s.trim()).filter(Boolean);
    const foto = document.getElementById('pFotoImg').src || '';
    if (!nombre) return alert('El nombre es obligatorio.');
    let lat = null, lng = null;
    if (typeof pendingLat !== 'undefined' && pendingLat !== null) { lat = pendingLat; lng = pendingLng; }
    const { data: inserted, error } = await sb.from('personas').insert({ nombre, status, lat, lng, ubicacion_texto, telefono, notas, necesidades, foto: foto||null }).select().single();
    if (error) { showToast('❌ Error: '+error.message, 'error'); return; }
    document.getElementById('personasForm').reset();
    document.getElementById('pFotoPreview').style.display = 'none';
    document.getElementById('pFotoImg').src = '';
    pendingLat = null; pendingLng = null;
    document.getElementById('pGpsBtn').style.borderColor = 'var(--border)';
    $('personasModal')?.classList.add('hidden');
    showToast('✅ ¡Te registraste con éxito!', 'success');
    await loadPersonas();
  }

  async function uploadPhoto(file, prefix = 'general') {
    if (!sb) return null;
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (!file) return null;
    const ext = file.name.split('.').pop() || 'jpg';
    const name = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
    try {
      const { data, error } = await sb.storage.from('reportes-fotos').upload(name, file, { contentType: file.type, upsert: false });
      if (error) { console.error('Upload error:', error); return null; }
      const { data: { publicUrl } } = sb.storage.from('reportes-fotos').getPublicUrl(name);
      return publicUrl;
    } catch (e) { console.error('Upload exception:', e); return null; }
  }

  /* ========== MEDIA UPLOAD (imagen/video/audio) ========== */

  const MEDIA_LIMITS = { imagen: 5*1024*1024, video: 50*1024*1024, audio: 25*1024*1024 };
  const MEDIA_ACCEPT = { imagen: 'image/*', video: 'video/*', audio: 'audio/*' };
  const MEDIA_CAPTURE = { imagen: 'environment', video: 'environment', audio: '' };

  function addPendingMedia(file, tipoMedia) {
    const MAX = MEDIA_LIMITS[tipoMedia]||5*1024*1024;
    if (file.size > MAX) { showToast(`⚠️ El archivo es muy grande (máx ${Math.round(MAX/1024/1024)}MB para ${tipoMedia}).`, 'error'); return; }
    pendingMedia.push({ file, tipo: tipoMedia });
    renderMediaPreview();
  }

  function renderMediaPreview() {
    const el = document.getElementById('mediaPreview');
    if (!el) return;
    if (!pendingMedia.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.innerHTML = pendingMedia.map((m, i) => {
      const icon = m.tipo==='imagen'?'📷':m.tipo==='video'?'🎥':'🎤';
      const url = URL.createObjectURL(m.file);
      const preview = m.tipo==='imagen' ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover">`
        : m.tipo==='video' ? `<video src="${url}" style="width:100%;height:100%;object-fit:cover"></video>`
        : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:24px;background:var(--bg)">🎤</div>`;
      return `<div class="media-thumb" data-idx="${i}">${preview}<button class="media-remove" onclick="app.removeMedia(${i})" title="Quitar">✕</button><span class="media-badge">${icon}</span></div>`;
    }).join('');
  }

  window.app.removeMedia = function(i) {
    if (pendingMedia[i]) { URL.revokeObjectURL(pendingMedia[i].previewUrl); pendingMedia.splice(i, 1); }
    renderMediaPreview();
  };

  function clearPendingMedia() {
    pendingMedia.forEach(m => { if (m.previewUrl) URL.revokeObjectURL(m.previewUrl); });
    pendingMedia = [];
    renderMediaPreview();
  }

  function pickMedia(tipoMedia) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = MEDIA_ACCEPT[tipoMedia] || 'image/*';
    if (MEDIA_CAPTURE[tipoMedia]) input.setAttribute('capture', MEDIA_CAPTURE[tipoMedia]);
    input.multiple = false;
    input.onchange = function() {
      if (input.files && input.files[0]) addPendingMedia(input.files[0], tipoMedia);
    };
    input.click();
  }

  async function submitPendingMedia(tabla, reporteId) {
    if (!pendingMedia.length) return [];
    const results = [];
    for (const m of pendingMedia) {
      const ext = m.file.name.split('.').pop() || 'jpg';
      const name = `reportes/${tabla}/${reporteId}_${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
      try {
        const { error: uploadErr } = await sb.storage.from('reportes-fotos').upload(name, m.file, { contentType: m.file.type, upsert: false });
        if (uploadErr) { console.error('Media upload error:', uploadErr); continue; }
        const { data: { publicUrl } } = sb.storage.from('reportes-fotos').getPublicUrl(name);
        const { data: inserted } = await sb.from('reporte_adjuntos').insert({
          tabla, reporte_id: reporteId, tipo: m.tipo,
          url: publicUrl, thumb_url: m.tipo==='imagen' ? publicUrl : null,
          tamaño_bytes: m.file.size
        }).select('id').single();
        if (inserted) results.push(inserted.id);
      } catch (e) { console.error('Media exception:', e); }
    }
    clearPendingMedia();
    return results;
  }

  /* ========== MEDIA DISPLAY ========== */

  let mediaCache = {}; // { 'tabla_id': [adjunto, ...] }
  let mediaCacheKeys = [];
  const MEDIA_CACHE_MAX = 50;

  async function loadMediaForReport(tabla, reporteId) {
    const key = `${tabla}_${reporteId}`;
    if (mediaCache[key]) {
      // LRU bump
      const idx = mediaCacheKeys.indexOf(key);
      if (idx > -1) { mediaCacheKeys.splice(idx, 1); mediaCacheKeys.push(key); }
      return mediaCache[key];
    }
    const { data } = await sb.from('reporte_adjuntos').select('*').eq('tabla', tabla).eq('reporte_id', reporteId).order('id', { ascending: true });
    mediaCache[key] = data || [];
    mediaCacheKeys.push(key);
    if (mediaCacheKeys.length > MEDIA_CACHE_MAX) {
      const evict = mediaCacheKeys.shift();
      delete mediaCache[evict];
    }
    return mediaCache[key];
  }

  function renderMediaGalleryHtml(adjuntos) {
    if (!adjuntos || !adjuntos.length) return '';
    const imgs = adjuntos.filter(a => a.tipo === 'imagen');
    const videos = adjuntos.filter(a => a.tipo === 'video');
    const audios = adjuntos.filter(a => a.tipo === 'audio');
    let html = '<div class="media-gallery"><h4 style="margin:8px 0 4px">📸 Evidencia</h4>';
    if (imgs.length) {
      html += '<div class="media-grid">' + imgs.map(a =>
        `<div class="media-grid-item"><img src="${a.url}" loading="lazy" onclick="window.open('${a.url}','_blank')" style="cursor:pointer"></div>`
      ).join('') + '</div>';
    }
    if (videos.length) {
      html += videos.map(a =>
        `<video controls preload="metadata" style="width:100%;max-height:300px;border-radius:8px;margin:4px 0" src="${a.url}"></video>`
      ).join('');
    }
    if (audios.length) {
      html += audios.map(a =>
        `<div style="background:var(--bg);padding:8px;border-radius:8px;margin:4px 0"><audio controls preload="none" style="width:100%" src="${a.url}"></audio><span style="font-size:11px;color:var(--text-muted)">🎤 Audio</span></div>`
      ).join('');
    }
    html += '</div>';
    return html;
  }

  function renderMediaBadge(adjuntos) {
    if (!adjuntos || !adjuntos.length) return '';
    return `<br><button onclick="app.openDetailFor('${adjuntos[0].tabla}',${adjuntos[0].reporte_id})" style="background:transparent;border:1px solid var(--primary);color:var(--primary);border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;margin-top:4px">📸 ${adjuntos.length} archivo(s)</button>`;
  }

  window.app.openDetailFor = function(tabla, id) {
    // Map table name to type for showDetail
    const map = { centros_acopio:'centro', zonas_colapsadas:'colapsada', edificios_riesgo:'riesgo', reportes_sismos:'sismo', reportes_seguridad:'seguridad', reportes_servicios:'servicio' };
    const type = map[tabla] || 'centro';
    showDetail(type, id);
  };

  async function handlePersonaPhoto() {
    const file = document.getElementById('pFotoInput').files[0];
    if (!file) return;
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) { showToast('⚠️ La foto es muy grande (máx 5MB). Elegí una más chica.', 'error'); return; }
    const btn = document.getElementById('pFotoBtn');
    btn.disabled = true; btn.textContent = '⏳';
    const url = await uploadPhoto(file, 'persona');
    btn.disabled = false; btn.textContent = '📷';
    if (url) {
      document.getElementById('pFotoImg').src = url;
      document.getElementById('pFotoPreview').style.display = 'flex';
    } else {
      showToast('⚠️ No se pudo subir la foto. Probá de nuevo.', 'error');
    }
  }

  function shareWhatsApp(id, nombre, status, ubicacion, telefono) {
    const link = window.location.origin + window.location.pathname + '?p=' + id;
    const msg = encodeURIComponent(
      `🚨 BÚSQUEDA - Terremoto Venezuela\n\nNombre: ${nombre}\nEstado: ${status}\n${ubicacion ? '📍 '+ubicacion : ''}\n${telefono ? '📞 '+telefono : ''}\n\n🔗 ${link}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  }

  function showPersonaDetail(p) {
    const overlay = document.getElementById('personaOverlay');
    const body = document.getElementById('personaDetailBody');
    if (!overlay || !body) return;
    const st = STATUS_PERSONA[p.status]||STATUS_PERSONA.bien;
    const foto = p.foto ? `<img src="${p.foto}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;margin:0 auto 16px;display:block;border:4px solid ${st.color}">` : `<div style="width:120px;height:120px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:48px;font-weight:800;margin:0 auto 16px;border:4px solid ${st.color}">${p.nombre.charAt(0).toUpperCase()}</div>`;
    body.innerHTML = `
      ${foto}
      <h2 style="font-size:22px;text-align:center;margin-bottom:4px">${escapeHtml(p.nombre)}</h2>
      <div style="text-align:center;margin-bottom:12px"><span class="persona-status" style="background:${st.color}22;color:${st.color};border:1px solid ${st.color}44;font-size:15px;padding:6px 16px">${st.label}</span></div>
      ${p.ubicacion_texto ? `<div style="font-size:15px;color:var(--text-muted);text-align:center;margin-bottom:6px">📍 ${escapeHtml(p.ubicacion_texto)}</div>` : ''}
      ${p.telefono ? `<div style="font-size:15px;text-align:center;margin-bottom:6px"><a href="tel:${p.telefono}" style="color:#3498db;text-decoration:none;font-weight:600">📞 ${escapeHtml(p.telefono)}</a></div>` : ''}
      ${p.necesidades && p.necesidades.length ? `<div style="font-size:15px;color:var(--warning);text-align:center;margin-bottom:6px">🆘 Necesita: ${(Array.isArray(p.necesidades)?p.necesidades:[]).join(', ')}</div>` : ''}
      ${p.notas ? `<div style="font-size:13px;color:var(--text-muted);font-style:italic;text-align:center;margin-bottom:12px">"${escapeHtml(p.notas)}"</div>` : ''}
      <div style="font-size:11px;color:var(--text-muted);text-align:center">🕐 ${timeAgo(p.created_at)}</div>
      <div style="display:flex;gap:8px;margin-top:16px">
        ${p.telefono ? `<a href="tel:${p.telefono}" class="btn btn-primary" style="flex:1;font-size:14px">📞 Llamar</a>` : ''}
        <button class="btn btn-outline" style="flex:1;font-size:14px" onclick="document.getElementById('personaOverlay').classList.add('hidden')">✕ Cerrar</button>
      </div>
    `;
    overlay.classList.remove('hidden');
  }

  function copiarLink(id) {
    const url = window.location.origin + window.location.pathname + '?p=' + id;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast('✅ Link copiado', 'success')).catch(() => showToast('📋 ' + url, 'success'));
    } else {
      showToast('📋 ' + url, 'success');
    }
  }

  /* ========== SISMOS TAB ========== */

  function renderSismos() {
    const el = document.getElementById('sismosTimeline');
    if (!el) return;
    const cutoff = sismosTime === 'ahora' ? Date.now() - 300000 : sismosTime === '1h' ? Date.now() - 3600000 : sismosTime === '24h' ? Date.now() - 86400000 : 0;
    let filtered = usgsQuakes.filter(q => q.time >= cutoff);
    if (sismosMag === 'm2') filtered = filtered.filter(q => q.mag >= 2.5);
    else if (sismosMag === 'm4') filtered = filtered.filter(q => q.mag >= 4);
    else if (sismosMag === 'm5') filtered = filtered.filter(q => q.mag >= 5);
    filtered.sort((a, b) => b.time - a.time);
    if (!filtered.length) {
      el.innerHTML = '<div class="feed-empty">No se registraron sismos en este período.</div>';
      return;
    }
    el.innerHTML = filtered.map(q => {
      const col = q.mag >= 7 ? '#ff0000' : q.mag >= 5 ? '#e74c3c' : q.mag >= 4 ? '#f39c12' : '#3498db';
      const t = timeAgo(q.time);
      const depth = q.depth ? q.depth.toFixed(1) : '?';
      const label = q.mag >= 7 ? '💥 TERREMOTO MAYOR' : q.mag >= 5 ? '🔴 Moderado' : q.mag >= 4 ? '🟡 Leve' : '🔵 Menor';
      return `<div class="feed-card" style="border-left:4px solid ${col}" onclick="app.feedMap(${q.lat},${q.lng})">
        <div class="feed-card-header">
          <span class="feed-cat" style="background:${col}22;color:${col};border:1px solid ${col}44">${label}</span>
          <span class="feed-time">${t}</span>
        </div>
        <div class="feed-card-title" style="color:${col};font-size:18px">M${q.mag} <span style="font-size:13px;color:var(--text)">— ${escapeHtml(q.lugar)}</span></div>
        <div class="feed-card-desc">
          📏 ${depth} km profundidad · 🕐 ${new Date(q.time).toLocaleString('es-VE')}
        </div>
        <div class="feed-card-footer">
          <span style="font-weight:600">📡 USGS / Funvisis / SGC</span>
          <span>🟢 Alta</span>
          <a href="${q.url}" target="_blank" style="color:#3498db;font-size:10px">Ver en USGS ↗</a>
        </div>
      </div>`;
    }).join('');
  }

  /* ========== AYUDA ========== */

  async function loadAyuda() {
    const promises = AYUDA_TABLES.map(async (key) => {
      const data = await loadPage('ayuda_'+key, AYUDA_CONFIG[key].table);
      ayudaData[key] = data || [];
    });
    await Promise.all(promises);
    renderAyuda();
  }

// Ayuda subscription consolidated into subscribe()

  async function loadRutas() {
    const { data } = await sb.from('rutas_seguras').select('*').order('id', { ascending: false }).limit(200);
    rutasSeguras = data||[];
    renderRutasMap();
  }

  function renderRutasMap() {
    if (!map) return;
    if (rutasLayer) map.removeLayer(rutasLayer);
    if (!document.getElementById('filterRutas').checked) return;
    const markers = rutasSeguras.filter(r => r.lat != null && r.lng != null).map(r => {
      const col = r.tipo === 'zona_segura' ? '#27ae60' : r.tipo === 'ruta' ? '#3498db' : '#f39c12';
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background:${col};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff">${r.tipo === 'zona_segura' ? '🛡️' : r.tipo === 'ruta' ? '🚗' : '📍'}</div>`,
        iconSize: [32,32], iconAnchor: [16,16]
      });
      return L.marker([r.lat, r.lng], { icon }).bindPopup(`<div class="popup-content"><h3>${escapeHtml(r.nombre)}</h3><p>${escapeHtml(r.descripcion||'')}</p><p style="font-size:11px;color:var(--text-muted)">👤 ${escapeHtml(r.reportado_por||'Anónimo')}</p></div>`);
    });
    rutasLayer = L.layerGroup(markers);
    rutasLayer.addTo(map);
  }

  async function loadCentrosAyuda() {
    const { data } = await sb.from('centros_ayuda').select('*').order('id', { ascending: false }).limit(200);
    centrosAyuda = data||[];
    renderCentrosAyudaMap();
    ayudaData.centros_ayuda = centrosAyuda;
  }

// Centros ayuda subscription consolidated into subscribe()

  function renderCentrosAyudaMap() {
    if (!map) return;
    if (centrosAyudaLayer) map.removeLayer(centrosAyudaLayer);
    if ($('filterCentrosAyuda') && !$('filterCentrosAyuda').checked) return;
    const markers = centrosAyuda.filter(c => c.lat != null && c.lng != null).map(c => {
      const tipos = { agua:'🚰',comida:'🍲',medico:'🏥',refugio:'🏠',multiples:'🏪' };
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background:#27ae60;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff">${tipos[c.tipo]||'🏪'}</div>`,
        iconSize: [32,32], iconAnchor: [16,16]
      });
      return L.marker([c.lat, c.lng], { icon }).bindPopup(`<div class="popup-content"><h3>${escapeHtml(c.nombre)}</h3><p>${escapeHtml(c.direccion||'')}</p><p>${c.horario?'🕐 '+escapeHtml(c.horario):''} ${c.contacto?'📞 '+escapeHtml(c.contacto):''}</p><p style="font-size:11px;color:var(--text-muted)">${c.verificada?'✅ Verificado · ':''}👤 ${escapeHtml(c.reportado_por||'Anónimo')}</p></div>`);
    });
    centrosAyudaLayer = L.layerGroup(markers);
    centrosAyudaLayer.addTo(map);
  }

  function renderCentroAyudaCard(c) {
    const tipos = { agua:'🚰',comida:'🍲',medico:'🏥',refugio:'🏠',multiples:'🏪' };
    return `<div class="ayuda-card-item" style="border-left:4px solid #27ae60">
      <div class="ayuda-card-header">
        <span class="feed-cat" style="background:#27ae60;color:#fff">${tipos[c.tipo]||'🏪'} ${c.tipo||'multiples'}</span>
        <span class="feed-time">${timeAgo(c.created_at)}</span>
      </div>
      <div class="ayuda-card-title">${escapeHtml(c.nombre)}</div>
      ${c.direccion ? `<div class="ayuda-card-desc">📍 ${escapeHtml(c.direccion)}</div>` : ''}
      ${c.horario ? `<div class="ayuda-card-desc">🕐 ${escapeHtml(c.horario)}</div>` : ''}
      <div class="feed-card-footer">${c.contacto?'📞 '+escapeHtml(c.contacto):''}${c.verificada?' <span style="color:#27ae60;font-weight:600">✅ Verificado</span>':''} · 👤 ${escapeHtml(c.reportado_por||'Anónimo')}</div>
    </div>`;
  }

  function initOCR() {
    const uploadBtn = document.getElementById('ocrUploadBtn');
    const fileInput = document.getElementById('ocrFileInput');
    const preview = document.getElementById('ocrPreview');
    const img = document.getElementById('ocrImg');
    const spinner = document.getElementById('ocrSpinner');
    const result = document.getElementById('ocrResult');
    const textarea = document.getElementById('ocrText');
    const copyBtn = document.getElementById('ocrCopyBtn');
    if (!uploadBtn) return;

    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async function() {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async function(e) {
        img.src = e.target.result;
        preview.style.display = 'block';
        spinner.style.display = 'block';
        result.style.display = 'none';
        try {
          await loadTesseract();
          const { data } = await Tesseract.recognize(e.target.result, 'spa', {
            logger: m => { if (m.status === 'recognizing text') uploadBtn.textContent = '🔍 Reconociendo... ' + Math.round(m.progress*100) + '%'; }
          });
          textarea.value = data.text;
          uploadBtn.textContent = '📸 Elegir otra foto';
          spinner.style.display = 'none';
          result.style.display = 'block';
        } catch(err) {
          textarea.value = '❌ Error al procesar: ' + err.message;
          spinner.style.display = 'none';
          result.style.display = 'block';
          uploadBtn.textContent = '📸 Elegir foto';
        }
      };
      reader.readAsDataURL(file);
    });

    copyBtn.addEventListener('click', function() {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(textarea.value).then(() => showToast('✅ Texto copiado', 'success')).catch(() => showToast('📋 Texto listo', 'success'));
      } else {
        textarea.select();
        document.execCommand('copy');
        showToast('✅ Texto copiado', 'success');
      }
    });
  }

  async function loadAyudaTable(key) {
    const data = await loadPage('ayuda_'+key, AYUDA_CONFIG[key].table);
    ayudaData[key] = data || [];
    renderAyuda();
    if (key === 'atrapadas') setTimeout(buildHeatmap, 300);
  }

  function renderAyuda() {
    const grid = document.getElementById('ayudaGrid');
    const filters = document.getElementById('ayudaFilters');
    if (!grid) return;
    // Build action cards
    const gridCards = AYUDA_TABLES.map((key, i) => {
      const cfg = AYUDA_CONFIG[key];
      const count = ayudaData[key] ? ayudaData[key].filter(d => {
        // Count pending (not rescued/covered/reunified)
        if (key === 'atrapadas') return !d.rescatado;
        if (key === 'ninos') return d.estado !== 'reunificado';
        if (key === 'necesidades') return !d.cubierta;
        if (key === 'ayudantes') return d.disponible;
        return true;
      }).length : 0;
      return `<button class="ayuda-card" data-section="${key}" style="animation-delay:${i*0.05}s">
        <span class="ayuda-card-icon">${cfg.icon}</span>
        <span class="ayuda-card-label">${cfg.label.replace(/^..\s/,'')}</span>
        ${count > 0 ? `<span class="ayuda-card-count">${count}</span>` : ''}
      </button>`;
    }).join('');
    grid.innerHTML = gridCards +
      `<button class="ayuda-card" onclick="app.openOcr()" style="border-color:#9b59b6">
        <span class="ayuda-card-icon">📸</span>
        <span class="ayuda-card-label">Foto a Texto</span>
      </button>
      <button class="ayuda-card" onclick="app.openReportCentroAyuda()" style="border-color:#27ae60">
        <span class="ayuda-card-icon">🏥</span>
        <span class="ayuda-card-label">Centro Ayuda</span>
      </button>`;
    // Build filter pills
    const ayudaKeysAll = [...AYUDA_TABLES, 'centros_ayuda'];
    const allFilters = [{key:'todas',icon:'📋',label:'Todas'}]
      .concat(ayudaKeysAll.map(k => {
        const cfg = AYUDA_CONFIG[k];
        return {key:k, icon: cfg ? cfg.icon : '🏥', label: cfg ? cfg.label.replace(/^..\s/,'').split(' ')[0] : 'Centros'};
      }));
    filters.innerHTML = allFilters.map(f =>
      `<button class="feed-filter ayuda-filter ${f.key===ayudaFilter?'active':''}" data-ayuda="${f.key}">${f.icon} ${f.label}</button>`
    ).join('');
    // Render list
    renderAyudaList();
    renderAyudaDashboard();
  }

  function renderAyudaList() {
    const el = document.getElementById('ayudaList');
    if (!el) return;
    let items = [];
    if (ayudaFilter === 'todas') {
      [...AYUDA_TABLES, 'centros_ayuda'].forEach(key => {
        (ayudaData[key]||[]).forEach(d => {
          items.push({ key, data: d });
        });
      });
    } else {
      (ayudaData[ayudaFilter]||[]).forEach(d => items.push({ key: ayudaFilter, data: d }));
    }
    items.sort((a,b) => new Date(b.data.created_at) - new Date(a.data.created_at));
    if (!items.length) {
      el.innerHTML = '<div class="feed-empty">No hay reportes de ayuda aún. Tocá una tarjeta arriba para reportar.</div>';
      return;
    }
    let html = items.map(({key, data}) => {
      const fn = AYUDA_CONFIG[key] && AYUDA_CONFIG[key].render;
      if (key === 'centros_ayuda') return renderCentroAyudaCard(data);
      return fn ? fn(data) : `<div class="ayuda-card-item">${escapeHtml(JSON.stringify(data).slice(0,100))}</div>`;
    }).join('');
    if (ayudaFilter !== 'todas' && pageState['ayuda_'+ayudaFilter]?.hasMore) {
      html += loadMoreBtn('ayuda_'+ayudaFilter);
    }
    el.innerHTML = html;
  }

  function renderAyudaDashboard() {
    const grid = document.getElementById('ayudaGrid');
    if (!grid) return;
    let existing = document.getElementById('ayudaDashboard');
    if (existing) existing.remove();
    const total = { atrapadas: 0, rescatados: 0, hospitales: 0, ninos: 0, necesidades: 0, mascotas: 0, ayudantes: 0, ayuda_humanitaria: 0 };
    (ayudaData.atrapadas||[]).forEach(d => { if (!d.rescatado) total.atrapadas++; else total.rescatados++; });
    (ayudaData.hospitales||[]).forEach(() => total.hospitales++);
    (ayudaData.ninos||[]).forEach(d => { if (d.estado !== 'reunificado') total.ninos++; });
    (ayudaData.necesidades||[]).forEach(d => { if (!d.cubierta) total.necesidades++; });
    (ayudaData.mascotas||[]).forEach(d => total.mascotas++);
    (ayudaData.ayudantes||[]).forEach(d => { if (d.disponible) total.ayudantes++; });
    (ayudaData.ayuda_humanitaria||[]).forEach(() => total.ayuda_humanitaria++);
    const strip = document.createElement('div');
    strip.id = 'ayudaDashboard';
    strip.className = 'ayuda-dashboard';
    strip.innerHTML = `
      <div class="ad-item danger">🆘 ${total.atrapadas} atrapados</div>
      <div class="ad-item success">✅ ${total.rescatados} rescatados</div>
      <div class="ad-item warning">🏥 ${total.hospitales} hospitalizados</div>
      <div class="ad-item danger">👶 ${total.ninos} niños solos</div>
      <div class="ad-item warning">💊 ${total.necesidades} necesidades</div>
      <div class="ad-item info">🐾 ${total.mascotas} mascotas</div>
      <div class="ad-item success">🙋 ${total.ayudantes} voluntarios</div>
      <div class="ad-item info">🏛 ${total.ayuda_humanitaria} ayudas</div>
    `;
    grid.parentNode.insertBefore(strip, grid.nextSibling);
  }

  function openAyudaForm(type) {
    const cfg = AYUDA_CONFIG[type];
    if (!cfg) return;
    document.getElementById('ayudaModalTitle').textContent = cfg.icon + ' ' + cfg.label;
    document.getElementById('ayudaType').value = type;
    document.getElementById('ayudaFields').innerHTML = cfg.fields();
    document.getElementById('ayudaForm').reset();
    // Propagate map click coordinates
    if (pendingLat != null && pendingLng != null) {
      const latEl = document.getElementById('afLat');
      const lngEl = document.getElementById('afLng');
      if (latEl) latEl.value = pendingLat;
      if (lngEl) lngEl.value = pendingLng;
    }
    document.getElementById('ayudaModal').classList.remove('hidden');
  }

  async function submitAyuda(e) {
    e.preventDefault();
    if (!(await checkServerRateLimit())) return;
    const now = Date.now();
    if (now - _lastSubmit < 2000) return showToast('⏳ Esperá un momento antes de reportar.', 'error');
    const type = document.getElementById('ayudaType').value;
    const cfg = AYUDA_CONFIG[type];
    if (!cfg) return alert('Error: tipo inválido');
    // Build insert data
    const data = {};
    data.reportado_por = ($('af_reportante')?.value||'Anónimo').trim() || 'Anónimo';
    // Common fields
    if ($('af_ubicacion')) data.ubicacion = $('af_ubicacion').value.trim();
    if ($('af_nombre')) data.nombre = $('af_nombre').value.trim();
    if ($('af_telefono')) data.telefono = $('af_telefono').value.trim();
    if ($('af_contacto')) data.contacto = $('af_contacto').value.trim();
    if ($('af_notas')) data.notas = $('af_notas').value.trim();
    if ($('af_descripcion')) data.descripcion = $('af_descripcion').value.trim();
    if ($('af_tipo')) data.tipo = $('af_tipo').value;
    if ($('af_prioridad')) data.prioridad = $('af_prioridad').value;
    if ($('af_ubicacion')) data.ubicacion = $('af_ubicacion').value.trim();
    if ($('af_estado')) data.estado = $('af_estado').value;
    // Type-specific fields
    if (type === 'atrapadas') {
      data.cuantas_personas = parseInt($('af_cuantas')?.value) || 1;
      data.tipo_estructura = $('af_estructura')?.value || 'otro';
      if (data.contacto === undefined) data.contacto = $('af_contacto')?.value?.trim() || '';
    }
    if (type === 'ninos') {
      data.nombre_aproximado = data.nombre || '';
      delete data.nombre;
      data.edad_aproximada = $('af_edad')?.value?.trim() || '';
      data.sexo = $('af_sexo')?.value || '';
      data.quien_lo_tiene = $('af_quien')?.value?.trim() || '';
      data.telefono_contacto = data.telefono || '';
      if (data.telefono !== undefined) delete data.telefono;
    }
    if (type === 'mascotas') {
      data.estado = $('af_estado')?.value || 'perdida';
    }
    if (type === 'ayudantes') {
      data.tipo = $('af_tipo')?.value || 'otro';
      data.disponible = true;
    }
    if (type === 'ayuda_humanitaria') {
      data.titulo = $('af_titulo')?.value?.trim() || '';
      data.organizacion = $('af_organizacion')?.value?.trim() || '';
      data.tipo_ayuda = $('af_tipo_ayuda')?.value || 'multiples';
      data.pais_origen = $('af_pais')?.value?.trim() || '';
      data.cantidad = $('af_cantidad')?.value?.trim() || '';
      data.estatus = $('af_estatus')?.value || 'anunciado';
      data.fecha_anuncio = $('af_fecha_anuncio')?.value ? new Date($('af_fecha_anuncio').value).toISOString() : null;
      data.fecha_llegada = $('af_fecha_llegada')?.value ? new Date($('af_fecha_llegada').value).toISOString() : null;
      data.url_referencia = $('af_url')?.value?.trim() || '';
      data.fuente = 'medio';
      data.confiabilidad = 'media';
      if (!data.titulo) return alert('El título es obligatorio.');
      if (!data.organizacion) return alert('La organización es obligatoria.');
    }
    if ($('afLat')?.value) data.lat = parseFloat($('afLat').value) || null;
    if ($('afLng')?.value) data.lng = parseFloat($('afLng').value) || null;
    if (!data.nombre && !data.nombre_aproximado && type === 'hospitales') return alert('El nombre es obligatorio.');
    if (!data.nombre && type === 'ayudantes') return alert('El nombre es obligatorio.');
    if (!data.nombre_aproximado && type === 'ninos') data.nombre_aproximado = 'No disponible';
    const { error } = await sb.from(cfg.table).insert(data);
    if (error) { showToast('❌ Error: '+error.message, 'error'); return; }
    document.getElementById('ayudaForm').reset();
    document.getElementById('ayudaModal').classList.add('hidden');
    _lastSubmit = Date.now();
    showToast('✅ Reportado. Aparece al instante.', 'success');
    loadAyudaTable(type);
  }

  window.app.rescatar = async function(key, id) {
    if (!confirm('¿Confirmás que fueron rescatados?')) return;
    const cfg = key === 'atrapadas' ? AYUDA_CONFIG.atrapadas : null;
    if (!cfg) return;
    const { error } = await sb.from(cfg.table).update({ rescatado: true }).eq('id', id);
    if (error) { showToast('❌ '+error.message, 'error'); return; }
    loadAyudaTable(key);
  };
  window.app.reunificar = async function(id) {
    if (!confirm('¿Confirmás que este niño/a fue reunificado con su familia?')) return;
    const { error } = await sb.from('ninos_solos').update({ estado: 'reunificado' }).eq('id', id);
    if (error) { showToast('❌ '+error.message, 'error'); return; }
    loadAyudaTable('ninos');
  };
  window.app.cubrir = async function(id) {
    if (!confirm('¿Confirmás que esta necesidad está cubierta?')) return;
    const { error } = await sb.from('necesidades').update({ cubierta: true }).eq('id', id);
    if (error) { showToast('❌ '+error.message, 'error'); return; }
    loadAyudaTable('necesidades');
  };

  /* ========== DESAPARECIDOS + ENCONTRADOS ========== */

  async function loadDesaparecidos() {
    const data = await loadPage('desaparecidos', 'desaparecidos');
    desaparecidosData = data || [];
    renderDesaparecidos();
    computeMatches();
  }

  async function loadEncontrados() {
    const data = await loadPage('encontrados', 'encontrados');
    encontradosData = data || [];
    renderDesaparecidos();
    computeMatches();
  }

// Desaparecidos subscription consolidated into subscribe()

  function renderDesaparecidos() {
    const el = document.getElementById('desaparecidosList');
    if (!el) return;
    const data = desapView === 'desaparecidos' ? desaparecidosData : encontradosData;
    let filtered = data;
    if (desapSearchQuery) {
      const q = desapSearchQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      filtered = filtered.filter(d => {
        const name = desapView === 'desaparecidos' ? (d.nombre||'') : (d.nombre_aproximado||'');
        return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q);
      });
    }
    if (!filtered.length) {
      el.innerHTML = `<div class="feed-empty">${desapView === 'desaparecidos' ? 'No hay personas buscadas aún. Publicá una búsqueda arriba.' : 'No hay personas encontradas reportadas aún. Si encontraste a alguien, publicálo arriba.'}</div>`;
      return;
    }
    const pKey = desapView === 'desaparecidos' ? 'desaparecidos' : 'encontrados';
    const hasMore = pageState[pKey]?.hasMore && !desapSearchQuery;
    el.innerHTML = filtered.map(d => {
      if (desapView === 'desaparecidos') return renderDesaparecidoCard(d);
      return renderEncontradoCard(d);
    }).join('') + (hasMore ? loadMoreBtn(pKey) : '');
  }

  function renderDesaparecidoCard(d) {
    const found = d.status === 'encontrado';
    const col = found ? '#27ae60' : '#e74c3c';
    const foto = d.foto ? `<img src="${d.foto}" class="desap-card-foto">` : `<div class="desap-card-foto" style="background:${col};color:#fff">🔍</div>`;
    return `<div class="desap-card ${d.status}">
      ${foto}
      <div class="desap-card-info">
        <div class="desap-card-name">🔍 ${escapeHtml(d.nombre)}</div>
        <span class="persona-status" style="background:${col}22;color:${col};border:1px solid ${col}44">${found ? '✅ Encontrado' : '🔴 Buscando'}</span>
        ${d.edad ? `<div class="desap-card-meta">🎂 ${escapeHtml(d.edad)}${d.sexo ? ' · '+escapeHtml(d.sexo) : ''}</div>` : d.sexo ? `<div class="desap-card-meta">${escapeHtml(d.sexo)}</div>` : ''}
        ${d.descripcion ? `<div class="desap-card-desc">📝 ${escapeHtml(d.descripcion)}</div>` : ''}
        ${d.ultima_ubicacion ? `<div class="desap-card-meta">📍 Última vez: ${escapeHtml(d.ultima_ubicacion)}</div>` : ''}
        ${d.ultima_vista ? `<div class="desap-card-meta">🕐 ${escapeHtml(d.ultima_vista)}</div>` : ''}
        <div class="desap-card-meta">📞 ${escapeHtml(d.telefono_contacto||'Sin contacto')}</div>
        <div class="desap-card-meta persona-time">${timeAgo(d.created_at)} · 👤 ${escapeHtml(d.reportado_por||'Anónimo')}</div>
        <div class="desap-card-actions">
          <button class="btn btn-outline" onclick="app.shareDesapWhatsApp(${d.id},'${(d.nombre||'').replace(/'/g,"\\'")}','${(d.ultima_ubicacion||'').replace(/'/g,"\\'")}','${(d.telefono_contacto||'').replace(/'/g,"\\'")}')">📲 WhatsApp</button>
          ${d.status === 'buscando' ? `<button class="btn btn-success" onclick="app.marcarEncontrado(${d.id})">✅ Encontrado</button>` : ''}
        </div>
      </div>
    </div>`;
  }

  function renderEncontradoCard(d) {
    const col = d.status === 'reunificado' ? '#27ae60' : d.status === 'trasladado' ? '#3498db' : '#f39c12';
    const estadoLabels = {resguardado:'🟡 Resguardado', reunificado:'✅ Reunificado', trasladado:'🏥 Trasladado'};
    const foto = d.foto ? `<img src="${d.foto}" class="desap-card-foto">` : `<div class="desap-card-foto" style="background:${col};color:#fff">🤝</div>`;
    return `<div class="desap-card" style="border-left-color:${col}">
      ${foto}
      <div class="desap-card-info">
        <div class="desap-card-name">🤝 ${escapeHtml(d.nombre_aproximado||'Persona encontrada')}</div>
        <span class="persona-status" style="background:${col}22;color:${col};border:1px solid ${col}44">${estadoLabels[d.status]||'🟡 Resguardado'}</span>
        ${d.edad_aproximada ? `<div class="desap-card-meta">🎂 ${escapeHtml(d.edad_aproximada)}${d.sexo ? ' · '+escapeHtml(d.sexo) : ''}</div>` : d.sexo ? `<div class="desap-card-meta">${escapeHtml(d.sexo)}</div>` : ''}
        ${d.descripcion ? `<div class="desap-card-desc">📝 ${escapeHtml(d.descripcion)}</div>` : ''}
        <div class="desap-card-meta">📍 ${escapeHtml(d.ubicacion_actual||'Sin ubicación')}</div>
        <div class="desap-card-meta">📞 ${escapeHtml(d.telefono_contacto||'Sin contacto')}</div>
        <div class="desap-card-meta persona-time">${timeAgo(d.created_at)} · 👤 ${escapeHtml(d.quien_encontro||'Anónimo')}</div>
        <div class="desap-card-actions">
          <button class="btn btn-outline" onclick="app.shareEncontradoWhatsApp(${d.id},'${(d.nombre_aproximado||'Persona encontrada').replace(/'/g,"\\'")}','${(d.ubicacion_actual||'').replace(/'/g,"\\'")}','${(d.telefono_contacto||'').replace(/'/g,"\\'")}')">📲 WhatsApp</button>
          ${d.status === 'resguardado' ? `<button class="btn btn-success" onclick="app.marcarReunificado(${d.id})">✅ Reunificado</button>` : ''}
          ${d.status === 'resguardado' ? `<button class="btn btn-primary" onclick="app.marcarTrasladado(${d.id})">🏥 Trasladado</button>` : ''}
        </div>
      </div>
    </div>`;
  }

  /* DESAPARECIDOS form handlers */
  
  async function handleDesapPhoto() {
    const file = document.getElementById('dFotoInput').files[0];
    if (!file) return;
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) { showToast('⚠️ La foto es muy grande (máx 5MB). Elegí una más chica.', 'error'); return; }
    const btn = document.querySelector('#desaparecidosForm button[type="submit"]');
    const origText = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ Subiendo...';
    const url = await uploadPhoto(file, 'desaparecido');
    btn.disabled = false; btn.textContent = origText;
    if (url) {
      document.getElementById('dFotoImg').src = url;
      document.getElementById('dFotoPreview').style.display = 'flex';
    } else {
      showToast('⚠️ No se pudo subir la foto. Probá de nuevo.', 'error');
    }
  }

  async function handleEncontradoPhoto() {
    const file = document.getElementById('eFotoInput').files[0];
    if (!file) return;
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) { showToast('⚠️ La foto es muy grande (máx 5MB). Elegí una más chica.', 'error'); return; }
    const btn = document.querySelector('#encontradosForm button[type="submit"]');
    const origText = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ Subiendo...';
    const url = await uploadPhoto(file, 'encontrado');
    btn.disabled = false; btn.textContent = origText;
    if (url) {
      document.getElementById('eFotoImg').src = url;
      document.getElementById('eFotoPreview').style.display = 'flex';
    } else {
      showToast('⚠️ No se pudo subir la foto. Probá de nuevo.', 'error');
    }
  }

  async function submitDesaparecido(e) {
    e.preventDefault();
    if (!(await checkServerRateLimit())) return;
    const nombre = document.getElementById('dNombre').value.trim();
    const edad = document.getElementById('dEdad').value.trim();
    const sexo = document.getElementById('dSexo').value;
    const descripcion = document.getElementById('dDescripcion').value.trim();
    const ultima_ubicacion = document.getElementById('dUltimaUbicacion').value.trim();
    const ultima_vista = document.getElementById('dUltimaVista').value.trim();
    const telefono_contacto = document.getElementById('dTelefono').value.trim();
    const reportado_por = document.getElementById('dReportadoPor').value.trim()||'Anónimo';
    const notas = document.getElementById('dNotas').value.trim();
    const foto = document.getElementById('dFotoImg').src || '';
    if (!nombre) return alert('El nombre de la persona buscada es obligatorio.');
    let lat = null, lng = null;
    if (typeof pendingLat !== 'undefined' && pendingLat !== null) { lat = pendingLat; lng = pendingLng; }
    const { error } = await sb.from('desaparecidos').insert({ nombre, edad, sexo, descripcion, foto: foto||null, ultima_ubicacion, ultima_vista, telefono_contacto, reportado_por, notas, lat, lng });
    if (error) { showToast('❌ Error: '+error.message, 'error'); return; }
    document.getElementById('desaparecidosForm').reset();
    document.getElementById('dFotoPreview').style.display = 'none';
    document.getElementById('dFotoImg').src = '';
    pendingLat = null; pendingLng = null;
    showToast('✅ Búsqueda publicada. Si alguien sabe algo, se va a contactar.', 'success');
    loadDesaparecidos();
  }

  async function submitEncontrado(e) {
    e.preventDefault();
    if (!(await checkServerRateLimit())) return;
    const nombre_aproximado = document.getElementById('eNombre').value.trim()||'No disponible';
    const edad_aproximada = document.getElementById('eEdad').value.trim();
    const sexo = document.getElementById('eSexo').value;
    const descripcion = document.getElementById('eDescripcion').value.trim();
    const ubicacion_actual = document.getElementById('eUbicacion').value.trim();
    const quien_encontro = document.getElementById('eQuien').value.trim();
    const telefono_contacto = document.getElementById('eTelefono').value.trim();
    const notas = document.getElementById('eNotas').value.trim();
    const foto = document.getElementById('eFotoImg').src || '';
    if (!quien_encontro) return alert('Decinos tu nombre para que puedan contactarte.');
    let lat = null, lng = null;
    if (typeof pendingLat !== 'undefined' && pendingLat !== null) { lat = pendingLat; lng = pendingLng; }
    const { error } = await sb.from('encontrados').insert({ nombre_aproximado, edad_aproximada, sexo, descripcion, foto: foto||null, ubicacion_actual, lat, lng, quien_encontro, telefono_contacto, notas });
    if (error) { showToast('❌ Error: '+error.message, 'error'); return; }
    document.getElementById('encontradosForm').reset();
    document.getElementById('eFotoPreview').style.display = 'none';
    document.getElementById('eFotoImg').src = '';
    pendingLat = null; pendingLng = null;
    showToast('✅ Reportaste que encontraste a esta persona. Si alguien la reconoce te van a contactar.', 'success');
    loadEncontrados();
  }

  /* Share / actions */

  window.app.shareDesapWhatsApp = function(id, nombre, ultimaUbicacion, telefono) {
    const link = window.location.origin + window.location.pathname + '?desap=' + id;
    const msg = encodeURIComponent(
      `🔍 BUSCO A - Terremoto Venezuela\n\nNombre: ${nombre}\n${ultimaUbicacion ? '📍 Última vez: '+ultimaUbicacion : ''}\n${telefono ? '📞 Contacto: '+telefono : ''}\n\nCompartí esta información 🙏\n🔗 ${link}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  window.app.shareEncontradoWhatsApp = function(id, nombre, ubicacion, telefono) {
    const link = window.location.origin + window.location.pathname + '?enc=' + id;
    const msg = encodeURIComponent(
      `🤝 ENCONTRÉ A - Terremoto Venezuela\n\nNombre: ${nombre}\n${ubicacion ? '📍 Está en: '+ubicacion : ''}\n${telefono ? '📞 Contacto: '+telefono : ''}\n\n🔗 ${link}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  window.app.marcarEncontrado = async function(id) {
    if (!confirm('¿Confirmás que esta persona fue encontrada?')) return;
    const { error } = await sb.from('desaparecidos').update({ status: 'encontrado' }).eq('id', id);
    if (error) { showToast('❌ '+error.message, 'error'); return; }
    loadDesaparecidos();
  };

  window.app.marcarReunificado = async function(id) {
    if (!confirm('¿Confirmás que esta persona fue reunificada con su familia?')) return;
    const { error } = await sb.from('encontrados').update({ status: 'reunificado' }).eq('id', id);
    if (error) { showToast('❌ '+error.message, 'error'); return; }
    loadEncontrados();
  };

  window.app.marcarTrasladado = async function(id) {
    if (!confirm('¿Confirmás que esta persona fue trasladada a una autoridad/hospital?')) return;
    const { error } = await sb.from('encontrados').update({ status: 'trasladado' }).eq('id', id);
    if (error) { showToast('❌ '+error.message, 'error'); return; }
    loadEncontrados();
  };

  /* ========== ASISTENTE DE BÚSQUEDA UNIFICADA ========== */

  function normalize(s) { return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }

  function unifiedSearch(query) {
    const q = normalize(query);
    if (!q || q.length < 2) { renderSearchResults([]); return; }
    const results = [];
    // Personas (self-registered)
    (personasData||[]).forEach(p => { if (normalize(p.nombre).includes(q)) results.push({ type:'persona', icon:'👤', label:'Persona', data:p, match: p.nombre }); });
    // Desaparecidos (being searched for)
    (desaparecidosData||[]).forEach(d => { if (normalize(d.nombre).includes(q)) results.push({ type:'desaparecido', icon:'🔍', label:'Desaparecido', data:d, match: d.nombre }); });
    // Encontrados (found someone)
    (encontradosData||[]).forEach(e => { const n = normalize(e.nombre_aproximado); if (n && n.includes(q)) results.push({ type:'encontrado', icon:'🤝', label:'Encontrado', data:e, match: e.nombre_aproximado||'?' }); });
    // Hospitales
    (ayudaData.hospitales||[]).forEach(h => { if (normalize(h.nombre).includes(q)) results.push({ type:'hospital', icon:'🏥', label:'En hospital', data:h, match: h.nombre }); });
    // Niños solos
    (ayudaData.ninos||[]).forEach(n => { const nomb = normalize(n.nombre_aproximado); if (nomb && nomb.includes(q)) results.push({ type:'nino', icon:'👶', label:'Niño solo', data:n, match: n.nombre_aproximado||'?' }); });
    // Ordenar: mejor match primero (exacto > contiene)
    results.sort((a,b) => {
      const aExact = normalize(a.match) === q ? 2 : normalize(a.match).startsWith(q) ? 1 : 0;
      const bExact = normalize(b.match) === q ? 2 : normalize(b.match).startsWith(q) ? 1 : 0;
      return bExact - aExact;
    });
    searchResults = results;
    renderSearchResults(results);
  }

  function renderSearchResults(results) {
    const el = document.getElementById('searchResults');
    if (!el) return;
    if (!results.length) {
      el.innerHTML = '<div class="feed-empty">😕 No se encontraron resultados. Probá con otro nombre.</div>';
      return;
    }
    // Group by type
    const groups = {};
    results.forEach(r => {
      if (!groups[r.type]) groups[r.type] = { icon: r.icon, label: r.label, items: [] };
      groups[r.type].items.push(r);
    });
    const typeOrder = ['persona','desaparecido','encontrado','hospital','nino'];
    el.innerHTML = typeOrder.filter(t => groups[t]).map(t => {
      const g = groups[t];
      return `<div style="margin-bottom:8px">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;padding:0 4px">${g.icon} ${g.label} · ${g.items.length}</div>
        ${g.items.map(r => {
          if (r.type === 'persona') return searchPersonaCard(r.data);
          if (r.type === 'desaparecido') return searchDesaparecidoCard(r.data);
          if (r.type === 'encontrado') return searchEncontradoCard(r.data);
          if (r.type === 'hospital') return searchHospitalCard(r.data);
          if (r.type === 'nino') return searchNinoCard(r.data);
          return '';
        }).join('')}
      </div>`;
    }).join('');
  }

  function searchPersonaCard(p) {
    const st = STATUS_PERSONA[p.status]||STATUS_PERSONA.bien;
    return `<div class="search-result-card" onclick="app.openPersona(${p.id})" style="border-left-color:${st.color}">
      <div class="search-result-icon">${p.foto ? `<img src="${p.foto}" style="width:40px;height:40px;border-radius:50%;object-fit:cover">` : (p.nombre.charAt(0).toUpperCase())}</div>
      <div class="search-result-info">
        <div class="search-result-name">${escapeHtml(p.nombre)}</div>
        <div class="search-result-meta">${st.label}${p.ubicacion_texto?' · 📍 '+escapeHtml(p.ubicacion_texto):''}</div>
      </div>
    </div>`;
  }

  function searchDesaparecidoCard(d) {
    const col = d.status === 'encontrado' ? '#27ae60' : '#e74c3c';
    return `<div class="search-result-card" style="border-left-color:${col}" onclick="app.openDesap(${d.id})">
      <div class="search-result-icon" style="background:${col}">🔍</div>
      <div class="search-result-info">
        <div class="search-result-name">🔍 ${escapeHtml(d.nombre)}</div>
        <div class="search-result-meta">${d.status === 'encontrado' ? '✅ Encontrado' : '🔴 Buscando'}${d.ultima_ubicacion ? ' · 📍 '+escapeHtml(d.ultima_ubicacion) : ''}${d.telefono_contacto ? ' · 📞 '+escapeHtml(d.telefono_contacto) : ''}</div>
      </div>
    </div>`;
  }

  function searchEncontradoCard(e) {
    const col = e.status === 'reunificado' ? '#27ae60' : '#f39c12';
    return `<div class="search-result-card" style="border-left-color:${col}" onclick="app.openEnc(${e.id})">
      <div class="search-result-icon" style="background:${col}">🤝</div>
      <div class="search-result-info">
        <div class="search-result-name">🤝 ${escapeHtml(e.nombre_aproximado||'Persona encontrada')}</div>
        <div class="search-result-meta">${e.status === 'reunificado' ? '✅ Reunificado' : '🟡 Resguardado'}${e.ubicacion_actual ? ' · 📍 '+escapeHtml(e.ubicacion_actual) : ''}</div>
      </div>
    </div>`;
  }

  function searchHospitalCard(h) {
    const estados = {ingresado:{c:'#3498db',l:'🏥 Ingresado'},uci:{c:'#e74c3c',l:'🆘 UCI'},alta:{c:'#27ae60',l:'✅ Alta'},fallecido:{c:'#7f8c8d',l:'💔 Fallecido'}};
    const e = estados[h.estado]||estados.ingresado;
    return `<div class="search-result-card" style="border-left-color:${e.c}">
      <div class="search-result-icon" style="background:${e.c}">🏥</div>
      <div class="search-result-info">
        <div class="search-result-name">${escapeHtml(h.nombre||'?')}</div>
        <div class="search-result-meta">${e.l}${h.hospital ? ' · 🏥 '+escapeHtml(h.hospital) : ''}${h.telefono ? ' · 📞 '+escapeHtml(h.telefono) : ''}</div>
      </div>
    </div>`;
  }

  function searchNinoCard(n) {
    const col = n.estado === 'reunificado' ? '#27ae60' : '#e74c3c';
    return `<div class="search-result-card" style="border-left-color:${col}">
      <div class="search-result-icon" style="background:${col}">👶</div>
      <div class="search-result-info">
        <div class="search-result-name">👶 ${escapeHtml(n.nombre_aproximado||'No disponible')}</div>
        <div class="search-result-meta">${n.estado === 'reunificado' ? '✅ Reunificado' : '🔴 Resguardado'}${n.ubicacion ? ' · 📍 '+escapeHtml(n.ubicacion) : ''}</div>
      </div>
    </div>`;
  }

  window.app.openPersona = function(id) {
    const p = personasData.find(x => x.id === id);
    if (p) { closeSearchModal(); showPersonaDetail(p); }
  };

  window.app.openDesap = function(id) {
    const d = desaparecidosData.find(x => x.id === id);
    if (d) {
      closeSearchModal();
      alert('🔍 PERSONA BUSCADA\n\nNombre: '+d.nombre+'\nÚltima ubicación: '+(d.ultima_ubicacion||'N/D')+'\nContacto: '+(d.telefono_contacto||'N/D')+'\n\nReportado por: '+(d.reportado_por||'Anónimo'));
    }
  };

  window.app.openEnc = function(id) {
    const e = encontradosData.find(x => x.id === id);
    if (e) {
      closeSearchModal();
      alert('🤝 PERSONA ENCONTRADA\n\nNombre: '+(e.nombre_aproximado||'No disponible')+'\nEstá en: '+(e.ubicacion_actual||'N/D')+'\nContacto: '+(e.telefono_contacto||'N/D')+'\n\nQuien la encontró: '+(e.quien_encontro||'Anónimo'));
    }
  };

  function closeSearchModal() {
    document.getElementById('searchModal').classList.add('hidden');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchPhotoPreview').style.display = 'none';
    document.getElementById('searchResults').innerHTML = '<div class="feed-empty">Escribí un nombre o subí una foto para buscar en todas las bases de datos.</div>';
  }

  async function handleSearchPhoto(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
      const img = document.getElementById('searchPhotoImg');
      img.src = e.target.result;
      document.getElementById('searchPhotoPreview').style.display = 'block';
      try {
        await loadTesseract();
        const { data } = await Tesseract.recognize(e.target.result, 'spa');
        const text = data.text.trim();
        if (text) {
          document.getElementById('searchInput').value = text.split('\n')[0].trim();
          unifiedSearch(document.getElementById('searchInput').value);
        } else {
          document.getElementById('searchResults').innerHTML = '<div class="feed-empty">😕 No se pudo extraer texto de la foto. Probá escribiendo el nombre.</div>';
        }
      } catch(err) {
        document.getElementById('searchResults').innerHTML = '<div class="feed-empty">❌ Error al procesar la foto: '+err.message+'</div>';
      }
    };
    reader.readAsDataURL(file);
  }

  /* ========== MAPA DE CALOR ========== */

  function buildHeatmap() {
    if (!map) return;
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
    const points = [];
    // Zonas colapsadas (intensidad según nivel)
    (allData.zonas_colapsadas||[]).forEach(z => {
      if (z.lat != null && z.lng != null) {
        const intensity = z.nivel === 'total' ? 1.0 : z.nivel === 'parcial' ? 0.6 : 0.4;
        points.push([z.lat, z.lng, intensity]);
      }
    });
    // Personas atrapadas con coordenadas
    (ayudaData.atrapadas||[]).forEach(a => {
      if (a.lat != null && a.lng != null) {
        const intensity = a.prioridad === 'alta' ? 1.0 : a.prioridad === 'media' ? 0.7 : 0.4;
        points.push([a.lat, a.lng, intensity]);
      }
    });
    // Feed items con coordenadas y categorías críticas
    (feedData||[]).forEach(f => {
      if (f.lat != null && f.lng != null && ['alerta','sismo','ultimo_minuto'].includes(f.categoria)) {
        points.push([f.lat, f.lng, 0.5]);
      }
    });
    if (points.length < 3) return;
    if (typeof L.heatLayer !== 'function') return;
    heatLayer = L.heatLayer(points, {
      radius: 30, blur: 20, maxZoom: 10, max: 1.0, gradient: { 0.2: '#3498db', 0.4: '#f39c12', 0.6: '#e74c3c', 0.8: '#ff4444', 1.0: '#ff0000' }
    });
    if (document.getElementById('filterHeatmap')?.checked !== false) {
      heatLayer.addTo(map);
    }
  }

  /* ========== MATCHING AUTOMÁTICO ========== */

  function computeMatches() {
    matches = [];
    const desaps = desaparecidosData.filter(d => d.status === 'buscando');
    const encs = encontradosData.filter(e => e.status !== 'reunificado');
    desaps.forEach(d => {
      const dName = normalize(d.nombre);
      let best = null, bestScore = 0;
      encs.forEach(e => {
        const eName = normalize(e.nombre_aproximado||'');
        if (!eName) return;
        let score = 0;
        // Name similarity
        const dWords = dName.split(/\s+/).filter(Boolean);
        const eWords = eName.split(/\s+/).filter(Boolean);
        const common = dWords.filter(w => eWords.includes(w)).length;
        score += common * 5;
        if (dName.includes(eName) || eName.includes(dName)) score += 8;
        if (common > 0 && common === Math.min(dWords.length, eWords.length)) score += 5;
        // Sex match
        if (d.sexo && e.sexo && d.sexo === e.sexo) score += 5;
        // Age proximity
        if (d.edad && e.edad_aproximada) {
          const dAge = parseInt(d.edad);
          const eAge = parseInt(e.edad_aproximada);
          if (!isNaN(dAge) && !isNaN(eAge) && Math.abs(dAge - eAge) <= 10) score += 3;
        }
        if (score > bestScore) { bestScore = score; best = e; }
      });
      if (best && bestScore >= 8) {
        matches.push({ desaparecido: d, encontrado: best, score: bestScore });
      }
    });
    matches.sort((a, b) => b.score - a.score);
    renderMatches();
  }

  function renderMatches() {
    const el = document.getElementById('matchesBadge');
    if (!el) return;
    const pending = matches.filter(m => m.score >= 10).length;
    if (pending > 0) {
      el.textContent = '🔗 '+pending;
      el.style.display = 'inline-block';
    } else {
      el.style.display = 'none';
    }
  }

  window.app.showMatches = function() {
    if (!matches.length) { alert('🔗 No hay coincidencias automáticas aún. Los matches aparecen cuando hay datos similares en desaparecidos y encontrados.'); return; }
    const top = matches.filter(m => m.score >= 10);
    if (!top.length) { alert('🔗 Coincidencias potenciales encontradas pero ninguna supera el umbral de confianza. Se necesitan más datos.'); return; }
    let msg = '🔗 POSIBLES COINCIDENCIAS:\n\n';
    top.slice(0, 5).forEach((m, i) => {
      msg += `${i+1}. 🔍 ${m.desaparecido.nombre} ↔ 🤝 ${m.encontrado.nombre_aproximado||'?'}\n   Confianza: ${m.score}/30\n\n`;
    });
    alert(msg);
  };

  /* ========== TABS ========== */

  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const tab = this.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('tab-'+tab).classList.add('active');
        if (tab === 'mapa') setTimeout(() => map.invalidateSize(), 100);
        if (tab === 'sismos') renderSismos();
        if (tab === 'chat') {
          const el = document.getElementById('chatMessages');
          if (el) el.scrollTop = el.scrollHeight;
        }
      });
    });
  }

  /* ========== RENDER ========== */

  function divIcon(emoji, bg, size) {
    return L.divIcon({ className: '', html: `<div class="custom-marker" style="background:${bg};width:${size||36}px;height:${size||36}px;font-size:${size?Math.floor(size*0.5):16}px">${emoji}</div>`, iconSize: [size||36, size||36], iconAnchor: [(size||36)/2, (size||36)/2], popupAnchor: [0, -(size||36)/2] });
  }

  function badgeFuente(f) { const i = FUENTES[f]||FUENTES.otro; return `<span style="background:${i.color}20;color:${i.color};border:1px solid ${i.color}44;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:600">${i.label}</span>`; }
  function badgeConf(c) { const i = CONFIABILIDAD[c]||CONFIABILIDAD.baja; return `<span style="background:${i.color}20;color:${i.color};border:1px solid ${i.color}44;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:600">${i.label}</span>`; }
  function badgeDenuncias(n) { return n > 0 ? `<span style="background:#e74c3c;color:#fff;border-radius:10px;padding:2px 8px;font-size:10px;font-weight:700">🚨 ${n} denuncias</span>` : ''; }

  function denunciadoCSS(n) {
    if (n >= 5) return 'border:3px solid #e74c3c;opacity:0.7';
    if (n >= 3) return 'border:3px solid #f39c12';
    return '';
  }

  function renderAll() {
    clearLayers();
    const statusColor = { activo:'#27ae60', colapsado:'#e74c3c', cerrado:'#7f8c8d', saturado:'#f39c12' };
    const cLayer = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60 });
    (allData.centros_acopio||[]).forEach(c => { L.marker([c.lat,c.lng],{icon:divIcon('📦',statusColor[c.status]||'#27ae60')}).bindPopup(centroPop(c)).addTo(cLayer); });
    cLayer.addTo(map); layers.centros = cLayer;
    const zLayer = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60 });
    (allData.zonas_colapsadas||[]).forEach(z => {
      L.marker([z.lat,z.lng],{icon:divIcon('💥','#e74c3c')}).bindPopup(colapPop(z)).addTo(zLayer);
      if (z.radio) L.circle([z.lat,z.lng],{radius:z.radio,color:z.nivel==='total'?'#e74c3c':'#f39c12',fillColor:z.nivel==='total'?'#e74c3c':'#f39c12',fillOpacity:0.1,weight:2}).addTo(zLayer);
    });
    zLayer.addTo(map); layers.colapsadas = zLayer;
    const eLayer = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60 });
    (allData.edificios_riesgo||[]).forEach(e => L.marker([e.lat,e.lng],{icon:divIcon('⚠️','#f39c12')}).bindPopup(riesgoPop(e)).addTo(eLayer));
    eLayer.addTo(map); layers.riesgo = eLayer;
    const sLayer = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60 });
    (allData.reportes_sismos||[]).forEach(s => {
      const col = s.tipo==='principal'?'#ff0000':s.tipo==='premonitor'?'#ff6600':'#ffaa00';
      const sz = s.tipo==='principal'?48:s.tipo==='premonitor'?42:30;
      L.marker([s.lat,s.lng],{icon:divIcon('🔴',col,sz)}).bindPopup(sismoPop(s)).addTo(sLayer);
    });
    sLayer.addTo(map); layers.sismos = sLayer;
    renderFeedMap();
    renderSeguridadMap();
    renderServiciosMap();
    updateUI();
    renderCifras();
  }

  function clearLayers() {
    Object.values(markers).forEach(arr => { arr.forEach(m=>m.remove()); arr.length=0; });
    Object.values(layers).forEach(l => { if(l) l.remove(); });
    layers = { centros: null, colapsadas: null, riesgo: null, sismos: null, usgs: null, feed: null, seguridad: null, servicios: null };
  }

  function btnDenunciar(type, id) {
    return `<br><button onclick="app.denunciar('${type}',${id})" style="background:transparent;border:1px solid #e74c3c;color:#e74c3c;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;margin-top:4px">🚨 Denunciar</button>`;
  }

  function refugioBadge(r) {
    const m = { listo: '🟢 Listo para recibir gente', parcial: '🟡 Parcialmente listo', no_listo: '🔴 No listo para recibir gente' };
    return r ? `<span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${r==='listo'?'#27ae6020':r==='parcial'?'#f39c1220':'#e74c3c20'};color:${r==='listo'?'#27ae60':r==='parcial'?'#f39c12':'#e74c3c'};border:1px solid ${r==='listo'?'#27ae6044':r==='parcial'?'#f39c1244':'#e74c3c44'};margin-top:4px">${m[r]||r}</span>` : '';
  }
  function excesoBadge(arr) { return arr&&arr.length ? `<p style="margin-top:4px">📦 Exceso: <strong>${arr.map(s=>escapeHtml(s)).join(', ')}</strong></p>` : ''; }
  function tieneBadge(arr) { return arr&&arr.length ? `<p>✅ Tiene: ${arr.map(s=>escapeHtml(s)).join(', ')}</p>` : ''; }

  function centroPop(c) {
    const d = c.denuncias_count||0;
    return `<div class="popup-content" style="${denunciadoCSS(d)}"><h3>📦 ${escapeHtml(c.nombre)}</h3>
      <p style="margin:4px 0">${badgeFuente(c.fuente_tipo)} ${badgeConf(c.confiabilidad)} ${badgeDenuncias(d)}</p>
      <p>📍 ${escapeHtml(c.direccion||'')}<br>📞 ${escapeHtml(c.contacto||'N/D')} ${c.horario?'| 🕐 '+escapeHtml(c.horario):''}</p>
      ${tieneBadge(c.tiene)}${excesoBadge(c.tiene_exceso)}
      <p>🆘 Necesita: ${(c.necesita||[]).join(', ')||'N/E'}</p>
      ${refugioBadge(c.status_refugio)}${c.capacidad_personas?`<span style="font-size:11px;color:var(--text-muted)"> 👥 ${c.capacidad_personas} personas</span>`:''}
      <span class="popup-status status-badge status-${c.status}">${statusL(c.status)}</span>
      <br><button onclick="app.detail('centro',${c.id})" style="background:var(--primary);color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;margin-top:6px">Ver más</button>${btnDenunciar('centro',c.id)}</div>`;
  }
  function colapPop(z) {
    const d = z.denuncias_count||0;
    return `<div class="popup-content" style="${denunciadoCSS(d)}"><h3>💥 ${escapeHtml(z.nombre)}</h3>
      <p style="margin:4px 0">${badgeFuente(z.fuente_tipo)} ${badgeConf(z.confiabilidad)} ${badgeDenuncias(d)}</p>
      <p>📍 ${escapeHtml(z.direccion||'')} | 📏 ${z.radio||'N/A'}m</p><p>${escapeHtml(z.descripcion||'')}</p>
      <span class="popup-status status-badge status-${z.nivel}">${z.nivel==='total'?'💥 Colapso Total':'⚠️ Parcial'}</span>
      <br><button onclick="app.detail('colapsada',${z.id})" style="background:var(--primary);color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;margin-top:6px">Ver más</button>${btnDenunciar('colapsada',z.id)}</div>`;
  }
  function riesgoPop(e) {
    const d = e.denuncias_count||0;
    const r={'alto':'🔴 Alto','medio':'🟡 Medio','bajo':'🟢 Bajo'};
    const s={'evacuado':'🧑‍🚒 Evacuado','ocupado':'👥 Ocupado','parcial':'⚠️ Parcial','colapsado':'💥 Colapsado'};
    return `<div class="popup-content" style="${denunciadoCSS(d)}"><h3>⚠️ ${escapeHtml(e.nombre)}</h3>
      <p style="margin:4px 0">${badgeFuente(e.fuente_tipo)} ${badgeConf(e.confiabilidad)} ${badgeDenuncias(d)}</p>
      <p>📍 ${escapeHtml(e.direccion||'')}<br>📊 ${r[e.riesgo]||e.riesgo} | ${s[e.estado]||e.estado}</p>
      <p>${escapeHtml(e.descripcion||'')}</p>
      <br><button onclick="app.detail('riesgo',${e.id})" style="background:var(--primary);color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer">Ver más</button>${btnDenunciar('riesgo',e.id)}</div>`;
  }
  function sismoPop(s) {
    const d = s.denuncias_count||0;
    const tipos = { principal:'💥 TERREMOTO PRINCIPAL', premonitor:'⚠️ SISMO PREMONITOR', replica:'🔶 RÉPLICA' };
    const prof = s.profundidad_km ? `| 📏 ${s.profundidad_km}km` : '';
    return `<div class="popup-content" style="${denunciadoCSS(d)}"><h3>${tipos[s.tipo]||'🔶 SISMO'}</h3>
      <p style="margin:4px 0">${badgeFuente(s.fuente_tipo)} ${badgeConf(s.confiabilidad)} ${badgeDenuncias(d)}</p>
      <p>⚡ Magnitud: <strong>M${s.magnitud}</strong> ${prof}<br>📍 ${escapeHtml(s.ubicacion||'')}<br>🕐 ${new Date(s.hora_utc).toLocaleString('es-VE')}</p>
      <p>${escapeHtml(s.descripcion||'')}</p>
      <p style="font-size:10px;color:var(--text-muted)">${escapeHtml(s.reportado_por)}</p>${btnDenunciar('sismo',s.id)}</div>`;
  }

  function statusL(s) { return ({ activo:'✅ Activo', colapsado:'💥 Colapsado', cerrado:'🔴 Cerrado', saturado:'⚠️ Saturado' })[s]||s; }

  function renderCifras() {
    const el = document.getElementById('crisisStatsInner');
    if (!el) return;
    if (!cifras.length) { el.innerHTML = '<div class="cifra-item"><span class="cifra-val">Cargando...</span></div>'; return; }
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-VE', {hour:'2-digit',minute:'2-digit'});
    el.innerHTML = cifras.map(c => {
      const cls = c.clave === 'ultimo_sismo' ? 'cifra-item ultimo-sismo' : 'cifra-item';
      return `<div class="${cls}" title="${escapeHtml(c.descripcion||'')}${c.fuente?' | Fuente: '+escapeHtml(c.fuente):''}"><span class="cifra-num">${escapeHtml(c.valor)}</span><span class="cifra-lbl">${escapeHtml(c.etiqueta)}</span></div>`;
    }).join('');
    document.getElementById('cifraUpdated').textContent = `🕐 ${timeStr}`;
  }

  function updateUI() {
    document.getElementById('statCentros').textContent = allData.centros_acopio.length;
    document.getElementById('statActivos').textContent = allData.centros_acopio.filter(c=>c.status==='activo').length;
    document.getElementById('statColapsadas').textContent = allData.zonas_colapsadas.length;
    document.getElementById('statRiesgo').textContent = allData.edificios_riesgo.length;
    document.getElementById('statSeguridad').textContent = allData.reportes_seguridad.length;
    document.getElementById('statServicios').textContent = allData.reportes_servicios.length;
    const total = allData.zonas_colapsadas.filter(z=>z.nivel==='total').length;
    const p = document.getElementById('statusBadge');
    p.textContent = total>0 ? `💥 ${total} COLAPSADAS` : '⚠️ SIN REPORTES';
    p.className = total>0 ? 'badge badge-danger' : 'badge badge-warning';
    const totalPts = allData.centros_acopio.length + allData.zonas_colapsadas.length + allData.edificios_riesgo.length + allData.reportes_sismos.length + allData.reportes_seguridad.length + allData.reportes_servicios.length;
    const totalDen = [allData.centros_acopio,allData.zonas_colapsadas,allData.edificios_riesgo,allData.reportes_sismos,allData.reportes_seguridad,allData.reportes_servicios].reduce((a,arr)=>a+arr.reduce((s,i)=>s+(i.denuncias_count||0),0),0);
    document.getElementById('lastUpdated').textContent = `📊 ${totalPts} puntos • ⚡ ${allData.reportes_sismos.length} sismos • 🚨 ${allData.reportes_seguridad.length} saqueos • 🔧 ${allData.reportes_servicios.length} servicios • 🚨 ${totalDen} denuncias`;
    const tipoLabel = { saqueo:'🚨 Saqueo', arma:'🔫 Arma', zona_insegura:'⚠️ Zona Insegura', otro:'❓ Otro', agua:'🚰 Agua', electricidad:'⚡ Electricidad', gas:'🔥 Gas', telefonia:'📡 Telefonía', internet:'🌐 Internet' };
    const all = [
      ...allData.reportes_sismos.map(i=>({...i,tl:`⚡ M${i.magnitud}`})),
      ...allData.centros_acopio.map(i=>({...i,tl:'📦 Centro'})),
      ...allData.zonas_colapsadas.map(i=>({...i,tl:'💥 Colapso'})),
      ...allData.edificios_riesgo.map(i=>({...i,tl:'⚠️ Riesgo'})),
      ...allData.reportes_seguridad.map(i=>({...i,tl:tipoLabel[i.tipo]||'🚨 Seguridad'})),
      ...allData.reportes_servicios.map(i=>({...i,tl:tipoLabel[i.tipo]||'🔧 Servicio'})),
    ].sort((a,b)=>b.id-a.id).slice(0,20);
    document.getElementById('recentReports').innerHTML = all.length
      ? all.map(i => {
          const type = i.tl.includes('M')?'sismo':i.tl.includes('Centro')?'centro':i.tl.includes('Colapso')?'colapsada':i.tl.includes('Riesgo')?'riesgo':i.tl.includes('Saqueo')||i.tl.includes('Arma')||i.tl.includes('Insegura')?'seguridad':'servicio';
          const den = i.denuncias_count||0;
          const ref = i.status_refugio ? (i.status_refugio==='listo'?'🟢':i.status_refugio==='parcial'?'🟡':'🔴') : '';
          return `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:11px;cursor:pointer" onclick="app.detail('${type}',${i.id})">
            <strong>${i.tl}</strong> ${ref} — ${escapeHtml(i.nombre||i.ubicacion||'')} ${den?`<span style="color:#e74c3c;font-weight:600">🚨${den}</span>`:''}
            <span style="color:var(--text-muted);font-size:10px;display:block">${badgeFuente(i.fuente_tipo)} ${badgeConf(i.confiabilidad)}</span>
          </div>`;
        }).join('')
      : '<p style="color:var(--text-muted);font-size:12px">Sin reportes aún</p>';
  }

  function showDetail(type, id) {
    const d = allData; let item, title, html = '';
    const denBtn = `<button onclick="app.denunciar('${type}',${id})" style="background:transparent;border:1px solid #e74c3c;color:#e74c3c;border-radius:4px;padding:8px;font-size:13px;cursor:pointer;width:100%;margin-top:8px">🚨 Denunciar este reporte</button>`;
    if (type === 'sismo') {
      item = d.reportes_sismos.find(s=>s.id===id); if(!item) return;
      const t={principal:'💥 TERREMOTO PRINCIPAL',premonitor:'⚠️ PREMONITOR',replica:'🔶 RÉPLICA'};
      title=`${t[item.tipo]} — M${item.magnitud}`;
      html=`<div class="detail-field"><span class="detail-label">Magnitud</span><div class="detail-value" style="font-size:24px;font-weight:800;color:#ff4444">M${item.magnitud} ${badgeDenuncias(item.denuncias_count)}</div></div>
        <div class="detail-field"><span class="detail-label">Tipo</span><div class="detail-value">${t[item.tipo]||item.tipo}</div></div>
        <div class="detail-field"><span class="detail-label">Profundidad</span><div class="detail-value">${item.profundidad_km||'N/A'} km</div></div>
        <div class="detail-field"><span class="detail-label">Ubicación</span><div class="detail-value">📍 ${escapeHtml(item.ubicacion||'N/A')}</div></div>
        <div class="detail-field"><span class="detail-label">Hora</span><div class="detail-value">🕐 ${new Date(item.hora_utc).toLocaleString('es-VE')}</div></div>
        <div class="detail-field"><span class="detail-label">Fuente</span><div class="detail-value">${badgeFuente(item.fuente_tipo)} ${badgeConf(item.confiabilidad)} · ${escapeHtml(item.reportado_por||'N/D')}</div></div>
        <div class="detail-field"><span class="detail-label">Coord.</span><div class="detail-value">${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}</div></div>
        <div class="detail-field"><span class="detail-label">Descripción</span><div class="detail-value">${escapeHtml(item.descripcion||'')}</div></div>${denBtn}`;
    } else if (type === 'centro') {
      item = d.centros_acopio.find(c=>c.id===id); if(!item) return;
      const s={'activo':'✅ Activo','colapsado':'💥 Colapsado','cerrado':'🔴 Cerrado','saturado':'⚠️ Saturado'};
      const cap={'alta':'Alta 🟢','media':'Media 🟡','baja':'Baja 🔴'};
      title=`📦 ${item.nombre}`;
      html=`<div class="detail-field"><span class="detail-label">Dirección</span><div class="detail-value">📍 ${escapeHtml(item.direccion||'N/D')}</div></div>
        <div class="detail-field"><span class="detail-label">Estado</span><div class="detail-value"><span class="status-badge status-${item.status}">${s[item.status]||item.status}</span> ${badgeDenuncias(item.denuncias_count)}</div></div>
        <div class="detail-field"><span class="detail-label">Capacidad</span><div class="detail-value">${cap[item.capacidad]||item.capacidad}</div></div>
        <div class="detail-field"><span class="detail-label">Refugio</span><div class="detail-value">${refugioBadge(item.status_refugio)} ${item.capacidad_personas?`👥 Capacidad: ${item.capacidad_personas} personas`:''}</div></div>
        <div class="detail-field"><span class="detail-label">Horario</span><div class="detail-value">🕐 ${escapeHtml(item.horario||'N/E')}</div></div>
        <div class="detail-field"><span class="detail-label">Contacto</span><div class="detail-value">📞 ${escapeHtml(item.contacto||'N/D')}</div></div>
        <div class="detail-field"><span class="detail-label">✅ Tiene</span><div class="detail-value">${(item.tiene||[]).map(s=>escapeHtml(s)).join(', ')||'N/E'}</div></div>
        <div class="detail-field"><span class="detail-label">📦 Exceso</span><div class="detail-value">${(item.tiene_exceso||[]).map(s=>escapeHtml(s)).join(', ')||'Ninguno'}</div></div>
        <div class="detail-field"><span class="detail-label">🆘 Necesita</span><div class="detail-value">${(item.necesita||[]).map(s=>escapeHtml(s)).join(', ')||'N/E'}</div></div>
        <div class="detail-field"><span class="detail-label">Fuente</span><div class="detail-value">${badgeFuente(item.fuente_tipo)} ${badgeConf(item.confiabilidad)} · ${escapeHtml(item.reportado_por||'Anónimo')}</div></div>
        <div class="detail-field"><span class="detail-label">Descripción</span><div class="detail-value">${escapeHtml(item.descripcion||'')}</div></div>${denBtn}<br><button class="btn btn-success btn-block" onclick="app.navTo(${item.lat},${item.lng})">📍 Navegar aquí</button>`;
    } else if (type === 'colapsada') {
      item = d.zonas_colapsadas.find(z=>z.id===id); if(!item) return;
      title=`💥 ${item.nombre}`;
      html=`<div class="detail-field"><span class="detail-label">Dirección</span><div class="detail-value">📍 ${escapeHtml(item.direccion||'N/D')}</div></div>
        <div class="detail-field"><span class="detail-label">Nivel</span><div class="detail-value"><span class="status-badge status-${item.nivel}">${item.nivel==='total'?'💥 Total':'⚠️ Parcial'}</span> ${badgeDenuncias(item.denuncias_count)}</div></div>
        <div class="detail-field"><span class="detail-label">Radio</span><div class="detail-value">📏 ${item.radio||'N/A'}m</div></div>
        <div class="detail-field"><span class="detail-label">Fuente</span><div class="detail-value">${badgeFuente(item.fuente_tipo)} ${badgeConf(item.confiabilidad)} · ${escapeHtml(item.reportado_por||'Anónimo')}</div></div>
        <div class="detail-field"><span class="detail-label">Descripción</span><div class="detail-value">${escapeHtml(item.descripcion||'')}</div></div>${denBtn}<br><button class="btn btn-danger btn-block" onclick="app.navTo(${item.lat},${item.lng})">📍 Navegar aquí</button>`;
    } else if (type === 'seguridad') {
      item = d.reportes_seguridad.find(s=>s.id===id); if(!item) return;
      const st = { saqueo:'🦹 Saqueo', arma:'🔫 Gente armada', zona_insegura:'⚠️ Zona insegura', otro:'❓ Otro' };
      title=`🚨 ${st[item.tipo]||'Seguridad'}`;
      html=`<div class="detail-field"><span class="detail-label">Incidente</span><div class="detail-value">${st[item.tipo]||item.tipo} ${badgeDenuncias(item.denuncias_count)}</div></div>
        <div class="detail-field"><span class="detail-label">Estatus</span><div class="detail-value">${item.estatus||'reportado'}</div></div>
        <div class="detail-field"><span class="detail-label">Dirección</span><div class="detail-value">📍 ${escapeHtml(item.direccion||item.nombre||'N/D')}</div></div>
        <div class="detail-field"><span class="detail-label">Fuente</span><div class="detail-value">${badgeFuente(item.fuente_tipo)} ${badgeConf(item.confiabilidad)} · ${escapeHtml(item.reportado_por||'Anónimo')}</div></div>
        <div class="detail-field"><span class="detail-label">Descripción</span><div class="detail-value">${escapeHtml(item.descripcion||'')}</div></div>${denBtn}<br><button class="btn btn-danger btn-block" onclick="app.navTo(${item.lat},${item.lng})">📍 Navegar aquí</button>`;
    } else if (type === 'servicio') {
      item = d.reportes_servicios.find(s=>s.id===id); if(!item) return;
      const st = { agua:'🚰 Agua', electricidad:'⚡ Electricidad', gas:'🔥 Gas', telefonia:'📡 Telefonía', internet:'🌐 Internet', otro:'🔧 Otro' };
      const est = { sin_servicio:'🔴 Sin servicio', intermitente:'🟡 Intermitente', restablecido:'🟢 Restablecido' };
      title=`🔧 ${st[item.tipo]||'Servicio'}`;
      html=`<div class="detail-field"><span class="detail-label">Servicio</span><div class="detail-value">${st[item.tipo]||item.tipo} ${badgeDenuncias(item.denuncias_count)}</div></div>
        <div class="detail-field"><span class="detail-label">Estatus</span><div class="detail-value">${est[item.estatus]||item.estatus}</div></div>
        <div class="detail-field"><span class="detail-label">Dirección</span><div class="detail-value">📍 ${escapeHtml(item.direccion||item.nombre||'N/D')}</div></div>
        <div class="detail-field"><span class="detail-label">Fuente</span><div class="detail-value">${badgeFuente(item.fuente_tipo)} ${badgeConf(item.confiabilidad)} · ${escapeHtml(item.reportado_por||'Anónimo')}</div></div>
        <div class="detail-field"><span class="detail-label">Descripción</span><div class="detail-value">${escapeHtml(item.descripcion||'')}</div></div>${denBtn}<br><button class="btn btn-warning btn-block" onclick="app.navTo(${item.lat},${item.lng})">📍 Navegar aquí</button>`;
    } else {
      item = d.edificios_riesgo.find(e=>e.id===id); if(!item) return;
      const r={'alto':'🔴 Alto','medio':'🟡 Medio','bajo':'🟢 Bajo'};
      const s={'evacuado':'🧑‍🚒 Evacuado','ocupado':'👥 Ocupado','parcial':'⚠️ Parcial','colapsado':'💥 Colapsado'};
      title=`⚠️ ${item.nombre}`;
      html=`<div class="detail-field"><span class="detail-label">Dirección</span><div class="detail-value">📍 ${escapeHtml(item.direccion||'N/D')}</div></div>
        <div class="detail-field"><span class="detail-label">Riesgo</span><div class="detail-value">${r[item.riesgo]||item.riesgo}</div></div>
        <div class="detail-field"><span class="detail-label">Estado</span><div class="detail-value">${s[item.estado]||item.estado}</div></div>
        <div class="detail-field"><span class="detail-label">Fuente</span><div class="detail-value">${badgeFuente(item.fuente_tipo)} ${badgeConf(item.confiabilidad)} · ${escapeHtml(item.reportado_por||'Anónimo')}</div></div>
        <div class="detail-field"><span class="detail-label">Descripción</span><div class="detail-value">${escapeHtml(item.descripcion||'')}</div></div>${denBtn}`;
    }
    document.getElementById('detailTitle').textContent = title;
    document.getElementById('detailBody').innerHTML = html + '<div id="detailMediaLoading" style="text-align:center;padding:16px;color:var(--text-muted)">⏳ Cargando evidencias...</div>';
    document.getElementById('detailModal').classList.remove('hidden');
    // Load media attachments async
    const tableMap2 = { centro:'centros_acopio', colapsada:'zonas_colapsadas', riesgo:'edificios_riesgo', sismo:'reportes_sismos', seguridad:'reportes_seguridad', servicio:'reportes_servicios' };
    (async () => {
      const tbl = tableMap2[type];
      if (tbl) {
        const adjuntos = await loadMediaForReport(tbl, id);
        const mediaHtml = renderMediaGalleryHtml(adjuntos);
        const loadingEl = document.getElementById('detailMediaLoading');
        if (loadingEl) loadingEl.outerHTML = mediaHtml || '<div style="text-align:center;padding:8px;font-size:12px;color:var(--text-muted)">📎 Sin archivos adjuntos</div>';
      }
    })();
  }

  function navTo(lat,lng) { window.open(`https://www.openstreetmap.org/directions?from=&to=${lat}%2C${lng}`,'_blank'); }

  /* ========== DENUNCIAS ========== */
  function abrirDenuncia(type, id) {
    // Block denuncias for verified items
    if (type === 'feed') {
      const item = feedData.find(f => f.id === id);
      if (item && item.verificada) return alert('✅ Este reporte está verificado por organismos oficiales. No se puede denunciar.');
    }
    if (type === 'sismo') {
      const item = allData.reportes_sismos.find(s => s.id === id);
      if (item && item.verificada) return alert('✅ Este reporte sísmico está verificado. No se puede denunciar.');
    }
    document.getElementById('denunciaType').value = type;
    document.getElementById('denunciaId').value = id;
    document.getElementById('denunciaForm').reset();
    document.getElementById('fieldDenunciante').value = '';
    document.getElementById('denunciaModal').classList.remove('hidden');
  }

  async function enviarDenuncia(e) {
    e.preventDefault();
    if (!(await checkServerRateLimit())) return;
    const tipo = document.getElementById('denunciaType').value;
    const id = parseInt(document.getElementById('denunciaId').value);
    const motivo = document.getElementById('fieldMotivo').value;
    const descripcion = document.getElementById('fieldDenunciaDesc').value.trim();
    const denunciado_por = document.getElementById('fieldDenunciante').value.trim()||'anonimo';
    const { error: err } = await sb.from('denuncias').insert({ tipo_reporte: tipo, reporte_id: id, motivo, descripcion, denunciado_por });
    if (err) { showToast('❌ Error: '+err.message, 'error'); return; }
    const tableMap = { centro:'centros_acopio', colapsada:'zonas_colapsadas', riesgo:'edificios_riesgo', sismo:'reportes_sismos', seguridad:'reportes_seguridad', servicio:'reportes_servicios' };
    const table = tableMap[tipo];
    if (table) {
      const { count } = await sb.from('denuncias').select('*', { count:'exact', head: true }).eq('tipo_reporte', tipo).eq('reporte_id', id);
      await sb.from(table).update({ denuncias_count: count }).eq('id', id);
    }
    document.getElementById('denunciaModal').classList.add('hidden');
    showToast('🚨 Denuncia registrada.', 'success');
    setTimeout(refresh, 500);
  }

  /* FORM */
  async function handleSubmit(e) {
    e.preventDefault();
    if (!(await checkServerRateLimit())) return;
    const lat = parseFloat(document.getElementById('fieldLat').value);
    const lng = parseFloat(document.getElementById('fieldLng').value);
    if (!lat||!lng) return alert('Haz clic en el mapa para marcar ubicación.');
    const type = document.getElementById('fieldType').value;
    const nombre = document.getElementById('fieldNombre').value.trim();
    const direccion = document.getElementById('fieldDireccion').value.trim();
    const descripcion = document.getElementById('fieldDescripcion').value.trim();
    const contacto = document.getElementById('fieldContacto').value.trim();
    const reportado_por = document.getElementById('fieldReportero').value.trim()||'anónimo';
    const fuente_tipo = document.getElementById('fieldFuenteTipo').value;
    const confiabilidad = document.getElementById('fieldConfiabilidad').value;
    let table, record;
    if (type === 'centro') {
      table = 'centros_acopio';
      const necesita = document.getElementById('fieldNecesita').value.trim().split(',').map(s=>s.trim()).filter(Boolean);
      const tiene = document.getElementById('fieldTiene').value.trim().split(',').map(s=>s.trim()).filter(Boolean);
      const tiene_exceso = document.getElementById('fieldTieneExceso').value.trim().split(',').map(s=>s.trim()).filter(Boolean);
      record = { nombre,direccion,lat,lng,descripcion,contacto,reportado_por,fuente_tipo,confiabilidad,
        status:document.getElementById('fieldStatus').value,capacidad:document.getElementById('fieldCapacidad').value,
        horario:document.getElementById('fieldHorario').value.trim(),necesita,tiene,tiene_exceso,
        status_refugio:document.getElementById('fieldStatusRefugio').value,
        capacidad_personas:parseInt(document.getElementById('fieldCapacidadPersonas').value)||0};
    } else if (type === 'colapsada') {
      table = 'zonas_colapsadas';
      record = { nombre,direccion,lat,lng,descripcion,reportado_por,fuente_tipo,confiabilidad,nivel:document.getElementById('fieldNivel').value,radio:parseInt(document.getElementById('fieldRadio').value)||200};
    } else if (type === 'riesgo') {
      table = 'edificios_riesgo';
      record = { nombre,direccion,lat,lng,descripcion,reportado_por,fuente_tipo,confiabilidad,riesgo:document.getElementById('fieldRiesgo').value,estado:document.getElementById('fieldEstado').value};
    } else if (type === 'seguridad') {
      table = 'reportes_seguridad';
      const sTipo = document.getElementById('fieldSegTipo').value;
      record = { nombre,direccion,lat,lng,descripcion,reportado_por,fuente_tipo,confiabilidad,tipo:sTipo,estatus:'reportado'};
    } else if (type === 'servicio') {
      table = 'reportes_servicios';
      record = { nombre,direccion,lat,lng,descripcion,reportado_por,fuente_tipo,confiabilidad,tipo:document.getElementById('fieldServTipo').value,estatus:document.getElementById('fieldServEstatus').value};
    } else {
      table = 'reportes_sismos';
      record = { magnitud:parseFloat(document.getElementById('fieldMagnitud').value)||0,profundidad_km:parseInt(document.getElementById('fieldProfundidad').value)||10,lat,lng,descripcion,reportado_por,fuente_tipo,confiabilidad,ubicacion:document.getElementById('fieldSismoUbicacion').value||direccion||nombre,hora_utc:new Date().toISOString(),tipo:document.getElementById('fieldTipoSismo').value};
    }
    if (_submitting) return;
    const now = Date.now();
    if (now - _lastSubmit < 2000) return showToast('⏳ Esperá un momento antes de reportar de nuevo.', 'error');
    _submitting = true;
    const submitBtn = document.querySelector('#reportForm button[type="submit"]');
    const origText = submitBtn.textContent;
    submitBtn.disabled = true; submitBtn.textContent = '⏳ Publicando...';
    try {
      const { data: inserted, error } = await sb.from(table).insert(record).select('id').single();
      if (error) { _submitting = false; submitBtn.disabled = false; submitBtn.textContent = origText; return showToast('❌ '+error.message, 'error'); }
      const reporteId = inserted.id;
      if (pendingMedia.length) {
        submitBtn.textContent = '⏳ Subiendo ' + pendingMedia.length + ' archivo(s)...';
        await submitPendingMedia(table, reporteId);
      }
      submitBtn.disabled = false; submitBtn.textContent = origText;
      _submitting = false; _lastSubmit = Date.now();
      closeModal(); showToast('✅ Reporte enviado.', 'success');
    } catch (e) { _submitting = false; submitBtn.disabled = false; submitBtn.textContent = origText; showToast('❌ Error inesperado', 'error'); console.error(e); }
  }

  function showModal(type) {
    const titles = { centro:'📦 Reportar Centro', colapsada:'💥 Zona Colapsada', riesgo:'⚠️ Edificio Riesgo', sismo:'⚡ Reportar Sismo/Réplica', seguridad:'🚨 Reporte de Saqueos/Inseguridad', servicio:'🔧 Reporte de Servicios' };
    const fields = {
      centro:`<label>Capacidad</label><select id="fieldCapacidad"><option value="alta">Alta</option><option value="media" selected>Media</option><option value="baja">Baja</option></select><label>Estado</label><select id="fieldStatus"><option value="activo" selected>Activo</option><option value="saturado">Saturado</option><option value="colapsado">Colapsado</option><option value="cerrado">Cerrado</option></select>
<label>🏠 ¿Listo para recibir gente?</label><select id="fieldStatusRefugio"><option value="listo">🟢 Sí, listo</option><option value="parcial">🟡 Parcialmente</option><option value="no_listo" selected>🔴 No</option></select>
<label>👥 Capacidad de personas</label><input type="number" id="fieldCapacidadPersonas" value="0" min="0" max="10000">
<label>✅ Tienen en stock (coma)</label><input type="text" id="fieldTiene" placeholder="agua, comida, medicinas">
<label>📦 Exceso (coma)</label><input type="text" id="fieldTieneExceso" placeholder="ropa, zapatos">
<label>🆘 Necesitan (coma)</label><input type="text" id="fieldNecesita" placeholder="agua, comida, medicinas">
<label>Horario</label><input type="text" id="fieldHorario" placeholder="8am-8pm">`,
      colapsada:`<label>Nivel</label><select id="fieldNivel"><option value="total" selected>Colapso Total</option><option value="parcial">Parcial</option></select><label>Radio (m)</label><input type="number" id="fieldRadio" value="200" min="10" max="5000">`,
      riesgo:`<label>Riesgo</label><select id="fieldRiesgo"><option value="alto" selected>Alto</option><option value="medio">Medio</option><option value="bajo">Bajo</option></select><label>Estado</label><select id="fieldEstado"><option value="evacuado" selected>Evacuado</option><option value="parcial">Parcial</option><option value="ocupado">Ocupado</option></select>`,
      sismo:`<label>Magnitud</label><input type="number" id="fieldMagnitud" step="0.1" min="1" max="10" required placeholder="Ej: 4.5"><label>Profundidad (km)</label><input type="number" id="fieldProfundidad" value="10" min="1" max="700"><label>Ubicación</label><input type="text" id="fieldSismoUbicacion" placeholder="Ej: 20km al norte de Caracas"><label>Tipo</label><select id="fieldTipoSismo"><option value="replica" selected>Réplica</option><option value="premonitor">Premonitor</option><option value="principal">Sismo Principal</option></select>`,
      seguridad:`<label>Tipo de incidente</label><select id="fieldSegTipo"><option value="saqueo" selected>🦹 Saqueo</option><option value="arma">🔫 Gente armada</option><option value="zona_insegura">⚠️ Zona insegura</option><option value="otro">❓ Otro</option></select>`,
      servicio:`<label>Tipo de servicio</label><select id="fieldServTipo"><option value="agua" selected>🚰 Agua</option><option value="electricidad">⚡ Electricidad</option><option value="gas">🔥 Gas</option><option value="telefonia">📡 Telefonía</option><option value="internet">🌐 Internet</option><option value="otro">🔧 Otro</option></select><label>Estatus</label><select id="fieldServEstatus"><option value="sin_servicio" selected>🔴 Sin servicio</option><option value="intermitente">🟡 Intermitente</option><option value="restablecido">🟢 Restablecido</option></select>`,
    };
    document.getElementById('modalTitle').textContent = titles[type]||'Reportar';
    document.getElementById('extraFields').innerHTML = fields[type]||'';
    document.getElementById('reportForm').reset();
    document.getElementById('fieldType').value = type;
    document.getElementById('fieldFuenteTipo').value = type==='sismo'?'oficial':'ciudadano';
    document.getElementById('fieldConfiabilidad').value = type==='sismo'?'alta':'baja';
    if (pendingLat != null && pendingLng != null) { document.getElementById('fieldLat').value=pendingLat; document.getElementById('fieldLng').value=pendingLng; }
    document.getElementById('reportModal').classList.remove('hidden');
  }

  function closeModal() { document.getElementById('reportModal').classList.add('hidden'); pendingLat=null; pendingLng=null; clearPendingMedia(); }

  function showToast(msg, type) {
    const el = document.getElementById('toast') || (() => { const t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--bg-card);border:1px solid var(--border);color:var(--text);padding:12px 20px;border-radius:12px;font-size:14px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5);max-width:90%;text-align:center;transition:opacity 0.3s;opacity:0'; document.body.appendChild(t); return t; })();
    el.textContent = msg; el.style.borderColor = type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : 'var(--border)';
    el.style.opacity = '1';
    clearTimeout(el._hide); el._hide = setTimeout(() => { el.style.opacity = '0'; }, 3000);
  }

  async function refresh() { try { mediaCache = {}; mediaCacheKeys = []; await loadAll(); renderAll(); setTimeout(buildHeatmap, 200); } catch(e) { showToast('Error al actualizar datos', 'error'); console.error(e); } }

  window.app = {};
  window.app.navTo = navTo;
  window.app.pickMedia = pickMedia;

  window.app.feedMap = function(lat, lng) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="mapa"]').classList.add('active');
    document.getElementById('tab-mapa').classList.add('active');
    map.setView([lat, lng], 12);
    setTimeout(() => map.invalidateSize(), 100);
  };

  /* ========== INIT ========== */
  async function init() {
    initSB(); initMap(); initEvents(); await refresh(); subscribe();
    setTimeout(buildHeatmap, 500);
    fetchUSGS(); setInterval(fetchUSGS, 60000);
    await loadFeed();
    await loadChat(); subscribeChat();
    await loadPersonas();
    await loadAyuda();
    await loadDesaparecidos(); await loadEncontrados();
    setTimeout(computeMatches, 1000);
    await loadRutas();
    // Check for ?p=ID, ?desap=ID, ?enc=ID
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('p');
    if (pid) {
      currentPersonaId = parseInt(pid);
      if (!isNaN(currentPersonaId)) {
        const { data } = await sb.from('personas').select('*').eq('id', currentPersonaId).single();
        if (data) setTimeout(() => showPersonaDetail(data), 500);
      }
    }
    const desapId = params.get('desap');
    if (desapId) {
      const numId = parseInt(desapId);
      if (!isNaN(numId)) {
        const { data } = await sb.from('desaparecidos').select('*').eq('id', numId).single();
        if (data) setTimeout(() => showToast('🔍 '+data.nombre+' — 📍 '+(data.ultima_ubicacion||'N/D')+' 📞 '+(data.telefono_contacto||'N/D'), 'success'), 500);
      }
    }
    const encId = params.get('enc');
    if (encId) {
      const numId = parseInt(encId);
      if (!isNaN(numId)) {
        const { data } = await sb.from('encontrados').select('*').eq('id', numId).single();
        if (data) setTimeout(() => showToast('🤝 '+(data.nombre_aproximado||'')+' — 📍 '+(data.ubicacion_actual||'N/D')+' 📞 '+(data.telefono_contacto||'N/D'), 'success'), 500);
      }
    }
    await loadCentrosAyuda();
    setInterval(renderSismos, 30000);
    initTabs();
    initOCR();
    window.app.detail = showDetail;
    window.app.denunciar = abrirDenuncia;
    window.app.shareWhatsApp = shareWhatsApp;
    window.app.copiarLink = copiarLink;
    window.app.openOcr = function() { $('ocrModal').classList.remove('hidden'); };
    window.app.openReportCentroAyuda = function() {
      const nombre = prompt('Nombre del centro de ayuda:')?.trim();
      if (!nombre) return;
      const tipo = prompt('Tipo (agua, comida, medico, refugio, multiples):') || 'multiples';
      const dir = prompt('Dirección:')?.trim() || '';
      const horario = prompt('Horario:')?.trim() || '';
      const contacto = prompt('Contacto:')?.trim() || '';
      checkServerRateLimit().then(ok => {
        if (!ok) return;
        sb.from('centros_ayuda').insert({ nombre, tipo, direccion: dir, horario, contacto }).then(({error}) => {
          if (error) { showToast('❌ '+error.message, 'error'); }
          else { showToast('✅ Centro de ayuda reportado.', 'success'); loadCentrosAyuda(); }
        }).catch(e => { showToast('❌ Error inesperado', 'error'); console.error(e); });
      });
    };
    window.app.showInfoTab = function() {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.tab-btn[data-tab="info"]').classList.add('active');
      document.getElementById('tab-info').classList.add('active');
    };
    window.app.shareGuiaWhatsApp = function() {
      const msg = encodeURIComponent(
        `🆘 GUÍA DE EMERGENCIA - Terremoto Venezuela 🇻🇪\n\n` +
        `1️⃣ PONETE A SALVO — Alejate de estructuras dañadas, vidrios y postes\n` +
        `2️⃣ REVISÁ A TU FAMILIA — Aplicá primeros auxilios básicos\n` +
        `3️⃣ CORTÁ GAS Y LUZ — Si olés gas, cerrá la llave. Cortá la electricidad\n` +
        `4️⃣ NO USES ASCENSORES — Bajá por escaleras con cuidado\n` +
        `5️⃣ AVISÁ QUE ESTÁS A SALVO — Un solo mensaje, no llames\n` +
        `6️⃣ PREPARÁ TU KIT — Agua, linterna, medicinas, documentos\n` +
        `7️⃣ PUNTO DE ENCUENTRO — Acordá con tu familia dónde reunirse\n` +
        `8️⃣ NO DIFUNDAS RUMORES — Verificá antes de compartir\n` +
        `9️⃣ AYUDÁ A VECINOS — Adultos mayores, niños y discapacitados\n\n` +
        `📍 Directorio de emergencia y más info en:\n` +
        `${window.location.origin}${window.location.pathname}\n\n` +
        `Compartí esta guía, puede salvar vidas 🙏`
      );
      window.open(`https://wa.me/?text=${msg}`, '_blank');
    };
  }
  document.addEventListener('DOMContentLoaded', init);

  /* ========== EXPORT ========== */
  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function flattenRows(arr, label) {
    if (!arr || !arr.length) return [];
    return arr.map(r => {
      const o = { _tipo: label };
      Object.keys(r).forEach(k => { o[k] = r[k] == null ? '' : typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]; });
      return o;
    });
  }

  window.app.exportCSV = function() {
    const d = allData;
    const rows = [
      ...flattenRows(d.centros_acopio, 'Centro Acopio'),
      ...flattenRows(d.zonas_colapsadas, 'Zona Colapsada'),
      ...flattenRows(d.edificios_riesgo, 'Edificio Riesgo'),
      ...flattenRows(d.reportes_sismos, 'Sismo'),
      ...flattenRows(d.reportes_seguridad, 'Seguridad'),
      ...flattenRows(d.reportes_servicios, 'Servicio')
    ];
    if (!rows.length) return showToast('No hay datos para exportar', 'error');
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => { const v = String(r[c]||''); return /[,"\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; }).join(','))].join('\n');
    downloadFile('\uFEFF' + csv, 'venezuela-crisis.csv', 'text/csv;charset=utf-8');
    showToast('✅ CSV exportado (' + rows.length + ' registros)', 'success');
  };

  window.app.exportGeoJSON = function() {
    const d = allData;
    const groups = [
      { items: d.centros_acopio, label: 'Centro Acopio', color: '#3498db' },
      { items: d.zonas_colapsadas, label: 'Zona Colapsada', color: '#e74c3c' },
      { items: d.edificios_riesgo, label: 'Edificio Riesgo', color: '#f39c12' },
      { items: d.reportes_sismos, label: 'Sismo', color: '#ff4444' },
      { items: d.reportes_seguridad, label: 'Seguridad', color: '#e74c3c' },
      { items: d.reportes_servicios, label: 'Servicio', color: '#f39c12' }
    ];
    const features = [];
    groups.forEach(g => {
      (g.items||[]).forEach(item => {
        if (item.lat != null && item.lng != null) {
          const props = { tipo: g.label };
          Object.keys(item).forEach(k => { if (k !== 'lat' && k !== 'lng') props[k] = item[k]; });
          features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [item.lng, item.lat] }, properties: props });
        }
      });
    });
    if (!features.length) return showToast('No hay datos con coordenadas', 'error');
    const gj = { type: 'FeatureCollection', features };
    downloadFile(JSON.stringify(gj, null, 2), 'venezuela-crisis.geojson', 'application/geo+json');
    showToast('✅ GeoJSON exportado (' + features.length + ' puntos)', 'success');
  };

  function initEvents() {
    $('menuBtn').addEventListener('click', ()=>$('sidebar').classList.toggle('hidden'));
    $('closeSidebar').addEventListener('click', ()=>$('sidebar').classList.add('hidden'));
    ['Centros','Colapsadas','Riesgo'].forEach(t => {
      $('filter'+t)?.addEventListener('change', function() {
        const key = t==='Centros'?'centros':t==='Colapsadas'?'colapsadas':'riesgo';
        if(this.checked) map.addLayer(layers[key]); else map.removeLayer(layers[key]);
      });
    });
    $('filterSismos')?.addEventListener('change', function() {
      if(this.checked) map.addLayer(layers.sismos); else map.removeLayer(layers.sismos);
    });
    $('filterUSGS')?.addEventListener('change', function() {
      if(this.checked && layers.usgs) map.addLayer(layers.usgs); else if(layers.usgs) map.removeLayer(layers.usgs);
    });
    $('filterFeed')?.addEventListener('change', function() {
      if(this.checked && layers.feed) map.addLayer(layers.feed); else if(layers.feed) map.removeLayer(layers.feed);
    });
    $('filterRutas')?.addEventListener('change', function() { renderRutasMap(); });
    $('filterSeguridad')?.addEventListener('change', function() {
      if(this.checked && layers.seguridad) map.addLayer(layers.seguridad); else if(layers.seguridad) map.removeLayer(layers.seguridad);
    });
    $('filterServicios')?.addEventListener('change', function() {
      if(this.checked && layers.servicios) map.addLayer(layers.servicios); else if(layers.servicios) map.removeLayer(layers.servicios);
    });
    $('reportRuta')?.addEventListener('click', async function() {
      if (pendingLat == null || pendingLng == null) return alert('Primero hacé clic en el mapa para marcar la ubicación.');
      if (!(await checkServerRateLimit())) return;
      const nombre = prompt('Nombre de este punto/ruta segura:')?.trim();
      if (!nombre) return;
      const tipo = prompt('Tipo: zona_segura, ruta, o punto_encuentro') || 'punto_encuentro';
      const desc = prompt('Descripción (opcional):')?.trim() || '';
      sb.from('rutas_seguras').insert({ nombre, tipo, lat: pendingLat, lng: pendingLng, descripcion: desc }).then(({error}) => {
        if (error) showToast('❌ '+error.message, 'error');
        else { showToast('✅ Ruta reportada.', 'success'); loadRutas(); pendingLat=null; pendingLng=null; }
      }).catch(e => { showToast('❌ Error inesperado', 'error'); console.error(e); });
    });
    $('filterCentrosAyuda')?.addEventListener('change', function() { renderCentrosAyudaMap(); });
    $('reportCentroAyuda')?.addEventListener('click', async function() {
      if (pendingLat == null || pendingLng == null) return alert('Primero hacé clic en el mapa para marcar la ubicación.');
      if (!(await checkServerRateLimit())) return;
      const nombre = prompt('Nombre del centro de ayuda:')?.trim();
      if (!nombre) return;
      const tipo = prompt('Tipo (agua, comida, medico, refugio, multiples):') || 'multiples';
      const dir = prompt('Dirección (opcional):')?.trim() || '';
      const horario = prompt('Horario (opcional):')?.trim() || '';
      const contacto = prompt('Contacto (opcional):')?.trim() || '';
      sb.from('centros_ayuda').insert({ nombre, tipo, direccion: dir, horario, contacto, lat: pendingLat, lng: pendingLng }).then(({error}) => {
        if (error) showToast('❌ '+error.message, 'error');
        else { showToast('✅ Centro de ayuda reportado.', 'success'); loadCentrosAyuda(); pendingLat=null; pendingLng=null; }
      }).catch(e => { showToast('❌ Error inesperado', 'error'); console.error(e); });
    });
    $('reportCentro').addEventListener('click', ()=>{ $('sidebar').classList.add('hidden'); showModal('centro'); });
    $('reportColapso').addEventListener('click', ()=>{ $('sidebar').classList.add('hidden'); showModal('colapsada'); });
    $('reportRiesgo').addEventListener('click', ()=>{ $('sidebar').classList.add('hidden'); showModal('riesgo'); });
    $('reportSismo').addEventListener('click', ()=>{ $('sidebar').classList.add('hidden'); showModal('sismo'); });
    $('reportSeguridad').addEventListener('click', ()=>{ $('sidebar').classList.add('hidden'); if(pendingLat == null || pendingLng == null) return alert('Primero hacé clic en el mapa.'); showModal('seguridad'); });
    $('reportServicio').addEventListener('click', ()=>{ $('sidebar').classList.add('hidden'); if(pendingLat == null || pendingLng == null) return alert('Primero hacé clic en el mapa.'); showModal('servicio'); });
    $('fabAdd').addEventListener('click', ()=>showModal('centro'));
    $('fabLocate').addEventListener('click', ()=>{
      if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p=>{map.setView([p.coords.latitude,p.coords.longitude],15);pendingLat=p.coords.latitude;pendingLng=p.coords.longitude;},()=>showToast('Activa el GPS.', 'error'),{enableHighAccuracy:true});
      else showToast('Geolocalización no disponible.', 'error');
    });
    $('closeModal').addEventListener('click', closeModal);
    $('closeDetail').addEventListener('click', ()=>$('detailModal').classList.add('hidden'));
    $('closeDenuncia').addEventListener('click', ()=>$('denunciaModal').classList.add('hidden'));
    $('cancelDenuncia').addEventListener('click', ()=>$('denunciaModal').classList.add('hidden'));
    $('closeFeedModal').addEventListener('click', ()=>$('feedModal').classList.add('hidden'));
    $('closePersonasModal')?.addEventListener('click', ()=>$('personasModal').classList.add('hidden'));
    $('reportForm').addEventListener('submit', handleSubmit);
    $('denunciaForm').addEventListener('submit', enviarDenuncia);
    $('feedForm').addEventListener('submit', submitFeed);
    $('personasForm')?.addEventListener('submit', submitPersona);
    $('fabFeed').addEventListener('click', ()=>{ $('feedModal').classList.remove('hidden'); });
    $('fabPersonas')?.addEventListener('click', function() {
      $('personasModal').classList.remove('hidden');
    });
    $('fabSismos')?.addEventListener('click', () => {
      $('sidebar').classList.add('hidden');
      showModal('sismo');
    });

    /* Feed filters */
    document.querySelectorAll('.feed-filter-cat').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.feed-filter-cat').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        feedFilter = this.dataset.cat;
        renderFeed();
      });
    });
    document.querySelectorAll('.feed-filter-time').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.feed-filter-time').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        feedTime = this.dataset.time;
        renderFeed();
      });
    });

    /* Personas events */
    $('pFotoBtn').addEventListener('click', ()=>$('pFotoInput').click());
    $('pFotoInput').addEventListener('change', handlePersonaPhoto);
    $('pFotoRemove').addEventListener('click', function() {
      document.getElementById('pFotoPreview').style.display = 'none';
      document.getElementById('pFotoImg').src = '';
      document.getElementById('pFotoInput').value = '';
    });
    $('pGpsBtn').addEventListener('click', function() {
      if (!navigator.geolocation) return alert('GPS no disponible.');
      navigator.geolocation.getCurrentPosition(p => {
        pendingLat = p.coords.latitude;
        pendingLng = p.coords.longitude;
        this.style.borderColor = '#27ae60';
        showToast('📍 Ubicación capturada.', 'success');
      }, () => showToast('No se pudo obtener ubicación.', 'error'), { enableHighAccuracy: true });
    });

    /* Ayuda events */
    document.addEventListener('click', function(e) {
      const card = e.target.closest('.ayuda-card');
      if (card) { openAyudaForm(card.dataset.section); }
    });
    document.addEventListener('click', function(e) {
      const filter = e.target.closest('.ayuda-filter');
      if (filter) {
        document.querySelectorAll('.ayuda-filter').forEach(b => b.classList.remove('active'));
        filter.classList.add('active');
        ayudaFilter = filter.dataset.ayuda;
        renderAyudaList();
      }
    });
    // Ayuda GPS handler (for atrapadas form)
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('#afGpsBtn');
      if (!btn) return;
      if (!navigator.geolocation) return alert('GPS no disponible.');
      navigator.geolocation.getCurrentPosition(p => {
        document.getElementById('afLat').value = p.coords.latitude;
        document.getElementById('afLng').value = p.coords.longitude;
        btn.style.borderColor = '#27ae60';
        showToast('📍 Ubicación capturada.', 'success');
      }, () => showToast('No se pudo obtener ubicación.', 'error'), { enableHighAccuracy: true });
    });
    $('closeAyudaModal').addEventListener('click', () => $('ayudaModal').classList.add('hidden'));
    $('closeOcrModal')?.addEventListener('click', () => { $('ocrModal').classList.add('hidden'); document.getElementById('ocrPreview').style.display = 'none'; document.getElementById('ocrFileInput').value = ''; });
    $('closePersonaOverlay')?.addEventListener('click', () => $('personaOverlay').classList.add('hidden'));
    $('ayudaForm').addEventListener('submit', submitAyuda);

    /* Personas search + status filters */
    const debouncedRenderPersonas = debounce(function() {
      personasSearchQuery = this.value;
      renderPersonas();
    }, 300);
    $('personasSearch').addEventListener('input', debouncedRenderPersonas);
    document.querySelectorAll('.ps-filter').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.ps-filter').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        personasStatusFilter = this.dataset.ps;
        renderPersonas();
      });
    });

    /* Sismos tab filters */
    document.querySelectorAll('.sismos-time-filter').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.sismos-time-filter').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        sismosTime = this.dataset.st;
        renderSismos();
      });
    });
    document.querySelectorAll('.sismos-mag-filter').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.sismos-mag-filter').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        sismosMag = this.dataset.sm;
        renderSismos();
      });
    });

    /* Chat events */
    $('chatSend').addEventListener('click', sendChat);
    $('chatInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });
    $('chatInput').addEventListener('input', emitTyping);
    $('chatInput').addEventListener('input', function() { $('chatSend').disabled = !this.value.trim(); });

    /* DESAPARECIDOS events */
    $('dFotoBtn').addEventListener('click', ()=>$('dFotoInput').click());
    $('dFotoInput').addEventListener('change', handleDesapPhoto);
    $('dFotoRemove').addEventListener('click', function() {
      document.getElementById('dFotoPreview').style.display = 'none';
      document.getElementById('dFotoImg').src = '';
      document.getElementById('dFotoInput').value = '';
    });
    $('dGpsBtn').addEventListener('click', function() {
      if (!navigator.geolocation) return alert('GPS no disponible.');
      navigator.geolocation.getCurrentPosition(p => {
        pendingLat = p.coords.latitude;
        pendingLng = p.coords.longitude;
        this.style.borderColor = '#27ae60';
        showToast('📍 Ubicación capturada.', 'success');
      }, () => showToast('No se pudo obtener ubicación.', 'error'), { enableHighAccuracy: true });
    });
    $('desaparecidosForm').addEventListener('submit', submitDesaparecido);

    /* ENCONTRADOS events */
    $('eFotoBtn').addEventListener('click', ()=>$('eFotoInput').click());
    $('eFotoInput').addEventListener('change', handleEncontradoPhoto);
    $('eFotoRemove').addEventListener('click', function() {
      document.getElementById('eFotoPreview').style.display = 'none';
      document.getElementById('eFotoImg').src = '';
      document.getElementById('eFotoInput').value = '';
    });
    $('eGpsBtn').addEventListener('click', function() {
      if (!navigator.geolocation) return alert('GPS no disponible.');
      navigator.geolocation.getCurrentPosition(p => {
        pendingLat = p.coords.latitude;
        pendingLng = p.coords.longitude;
        this.style.borderColor = '#27ae60';
        showToast('📍 Ubicación capturada.', 'success');
      }, () => showToast('No se pudo obtener ubicación.', 'error'), { enableHighAccuracy: true });
    });
    $('encontradosForm').addEventListener('submit', submitEncontrado);

    /* Desaparecidos tab toggle */
    document.querySelectorAll('.desap-tab-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.desap-tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        desapView = this.dataset.desap;
        renderDesaparecidos();
      });
    });

    /* Desaparecidos search */
    $('desapSearch').addEventListener('input', debounce(function() {
      desapSearchQuery = this.value;
      renderDesaparecidos();
    }, 300));

    /* Load More buttons */
    document.addEventListener('click', async function(e) {
      const btn = e.target.closest('.load-more-btn');
      if (!btn) return;
      const key = btn.dataset.pageKey;
      btn.disabled = true; btn.textContent = '⏳ Cargando...';
      try {
        if (key === 'feed') {
          const more = await loadPage('feed', 'feed', 'id', true);
          feedData = feedData.concat(more);
          renderFeed();
        } else if (key === 'personas') {
          const more = await loadPage('personas', 'personas', 'id', true);
          personasData = personasData.concat(more);
          renderPersonas();
        } else if (key === 'desaparecidos') {
          const more = await loadPage('desaparecidos', 'desaparecidos', 'id', true);
          desaparecidosData = desaparecidosData.concat(more);
          renderDesaparecidos();
        } else if (key === 'encontrados') {
          const more = await loadPage('encontrados', 'encontrados', 'id', true);
          encontradosData = encontradosData.concat(more);
          renderDesaparecidos();
        } else if (key === 'seguridad') {
          const more = await loadPage('seguridad', 'reportes_seguridad', 'id', true);
          allData.reportes_seguridad = allData.reportes_seguridad.concat(more);
          renderAll();
        } else if (key === 'servicios') {
          const more = await loadPage('servicios', 'reportes_servicios', 'id', true);
          allData.reportes_servicios = allData.reportes_servicios.concat(more);
          renderAll();
        } else if (key.startsWith('ayuda_')) {
          const ayudaKey = key.replace('ayuda_', '');
          const more = await loadPage(key, AYUDA_CONFIG[ayudaKey].table, 'id', true);
          ayudaData[ayudaKey] = (ayudaData[ayudaKey]||[]).concat(more);
          renderAyuda();
        }
      } catch(e) { console.error('Load more error:', e); }
    });

    /* Modal close */
    document.querySelectorAll('.modal').forEach(m=>{
      m.addEventListener('click', function(e){ if(e.target===this) this.classList.add('hidden'); });
    });
    document.addEventListener('keydown', e=>{
      if(e.key==='Escape') {
        if(!$('reportModal').classList.contains('hidden')) closeModal();
        else if(!$('detailModal').classList.contains('hidden')) $('detailModal').classList.add('hidden');
        else if(!$('denunciaModal').classList.contains('hidden')) $('denunciaModal').classList.add('hidden');
        else if(!$('feedModal').classList.contains('hidden')) $('feedModal').classList.add('hidden');
        else if(!$('sidebar').classList.contains('hidden')) $('sidebar').classList.add('hidden');
      }
    });

    /* Language / Idioma */
    /* SEARCH events */
    $('searchToggle').addEventListener('click', () => {
      $('searchModal').classList.remove('hidden');
      setTimeout(() => $('searchInput').focus(), 300);
    });
    $('closeSearchModal').addEventListener('click', closeSearchModal);
    $('searchInput').addEventListener('input', debounce(function() { unifiedSearch(this.value); }, 300));
    $('searchPhotoBtn').addEventListener('click', () => $('searchPhotoInput').click());
    $('searchPhotoInput').addEventListener('change', function() {
      if (this.files[0]) handleSearchPhoto(this.files[0]);
    });
    $('filterHeatmap')?.addEventListener('change', function() {
      if (heatLayer) {
        if (this.checked) map.addLayer(heatLayer);
        else map.removeLayer(heatLayer);
      }
    });

    $('langToggle').addEventListener('click', () => $('langMenu').classList.remove('hidden'));
    $('closeLangMenu').addEventListener('click', () => $('langMenu').classList.add('hidden'));
    document.querySelectorAll('.lang-option').forEach(el => {
      el.addEventListener('click', function() {
        document.querySelectorAll('.lang-option').forEach(o => o.classList.remove('active'));
        this.classList.add('active');
        $('langMenu').classList.add('hidden');
        const lang = this.dataset.lang;
        // For now just show desktop notification about language change
        // Full i18n can be implemented later
        if (lang !== 'es') alert('🌐 ' + (lang === 'en' ? 'Language changed to English. Full translation coming soon.' : 'Idioma alterado para Português. Tradução completa em breve.'));
      });
    });

    /* Push notifications permission */
    if ('Notification' in window && Notification.permission === 'default') {
      // Ask on first interaction with a sismo or alerta
      document.querySelector('.feed-filter-cat[data-cat="alerta"]')?.addEventListener('click', function askPush() {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
              reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array('BIsZ0cC9pOlFOFXq-2I6DcsbQqdJxlG5ELAhEJvkIxWMk_Tm-O0kgYR0o0R0_kTzCjZ-nhFpBiQOsBqPFdFh8bI') })
                .then(() => showToast('✅ Notificaciones activadas.', 'success'))
                .catch(() => {});
            });
          }
        });
        this.removeEventListener('click', askPush);
      }, { once: true });
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }
})();
