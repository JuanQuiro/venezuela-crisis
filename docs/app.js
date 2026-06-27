(function() {
  'use strict';
  const SUPABASE_URL = 'https://eedvfmohqletqcgkxcuf.supabase.co';
  const ANON_KEY = 'sb_publishable_FA6pZQhz5-xy0PYvECMR2A_rbDrxBat';
  let sb = null, map = null, layers = { centros: null, colapsadas: null, riesgo: null, sismos: null, usgs: null, feed: null };
  let markers = { centros: [], colapsadas: [], riesgo: [], sismos: [] };
  let pendingLat = null, pendingLng = null;
  let allData = { centros_acopio: [], zonas_colapsadas: [], edificios_riesgo: [], reportes_sismos: [] };
  let cifras = [];
  let usgsQuakes = [];
  const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=2&maxlatitude=13&minlongitude=-74&maxlongitude=-59&minmagnitude=2.5&orderby=time&limit=30';

  let feedData = [];
  let feedFilter = 'todas';
  let feedTime = '24h';
  let feedSub = null;
  let chatData = [];
  let chatSub = null;
  let chatBroadcast = null;
  let personasData = [];
  let personasSub = null;
  let personasStatusFilter = 'todas';
  let personasSearchQuery = '';
  let sismosTime = '24h';
  let sismosMag = 'todas';
  let ayudaData = { atrapadas: [], hospitales: [], ninos: [], necesidades: [], mascotas: [], ayudantes: [] };
  let ayudaFilter = 'todas';
  let ayudaSubs = [];

  const FUENTES = { oficial:{label:'🏛 Gobierno/Oficial',color:'#3498db'}, organismo:{label:'🔬 Organismo Técnico',color:'#2ecc71'}, medio:{label:'📰 Medio',color:'#f39c12'}, ciudadano:{label:'👤 Ciudadano',color:'#95a5a6'}, otro:{label:'❓ Otra',color:'#7f8c8d'} };
  const CONFIABILIDAD = { alta:{label:'🟢 Alta',color:'#27ae60'}, media:{label:'🟡 Media',color:'#f39c12'}, baja:{label:'🔴 Baja',color:'#e74c3c'} };
  const CATS = { ultimo_minuto:{label:'⚡Último Min',color:'#9b59b6'}, alerta:{label:'🚨Alerta',color:'#e74c3c'}, noticia:{label:'📰Noticia',color:'#3498db'}, desplazamiento:{label:'🚶Desplaz.',color:'#e67e22'}, medicamentos:{label:'💊Medic.',color:'#27ae60'}, sismo:{label:'🔴Sismo',color:'#ff4444'} };
  const STATUS_PERSONA = { bien:{label:'✅ Bien',color:'#27ae60'}, herido:{label:'🆘 Herido',color:'#e74c3c'}, buscando_familiares:{label:'🔍 Busca familiares',color:'#f39c12'}, necesita_medicamentos:{label:'💊 Necesita medic.',color:'#9b59b6'}, voluntario:{label:'🙋 Voluntario',color:'#3498db'}, fallecido:{label:'💔 Fallecido',color:'#7f8c8d'} };
  const AYUDA_TABLES = ['atrapadas','hospitales','ninos','necesidades','mascotas','ayudantes'];
  const AYUDA_CONFIG = {
    atrapadas: {
      label: '🆘 Personas Atrapadas', icon: '🆘', table: 'personas_atrapadas',
      fields: (d) => `
<label>📍 Ubicación / Dirección</label><input type="text" id="af_ubicacion" required placeholder="Ej: Esquina de San Juan, Caracas">
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
          <div class="ayuda-card-desc">📍 ${d.ubicacion||'Sin ubicación'}${d.tipo_estructura?' · 🏗️ '+d.tipo_estructura:''}${d.rescatado?'<br><strong style="color:#27ae60">✅ Rescatado</strong>':''}</div>
          <div class="feed-card-footer">${d.contacto?'📞 '+d.contacto:''}${d.reportado_por?' · 👤 '+d.reportado_por:''}</div>
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
          <div class="ayuda-card-title">👤 ${d.nombre||'?'}</div>
          <div class="ayuda-card-desc">🏥 ${d.hospital||'Sin hospital'}${d.telefono?' · 📞 '+d.telefono:''}</div>
          ${d.notas?`<div class="ayuda-card-desc" style="color:var(--text-muted);font-style:italic">${d.notas}</div>`:''}
          <div class="feed-card-footer">👤 ${d.reportado_por||'Anónimo'}</div>
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
          <div class="ayuda-card-title">👶 ${d.nombre_aproximado||'Nombre no disponible'}</div>
          <div class="ayuda-card-desc">${d.edad_aproximada?'🎂 '+d.edad_aproximada:''}${d.sexo?' · '+d.sexo:''}${d.descripcion?'<br>📝 '+d.descripcion:''}</div>
          <div class="ayuda-card-desc">📍 ${d.ubicacion||'Sin ubicación'}</div>
          ${d.quien_lo_tiene?`<div class="ayuda-card-desc">👤 Resguardo: ${d.quien_lo_tiene}${d.telefono_contacto?' · 📞 '+d.telefono_contacto:''}</div>`:''}
          <div class="feed-card-footer">👤 ${d.reportado_por||'Anónimo'}</div>
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
          ${d.descripcion?`<div class="ayuda-card-desc">${d.descripcion}</div>`:''}
          <div class="ayuda-card-desc">📍 ${d.ubicacion||'Sin ubicación'}</div>
          <div class="feed-card-footer">${d.contacto?'📞 '+d.contacto:''}${d.reportado_por?' · 👤 '+d.reportado_por:''}${d.cubierta?'<strong style="color:#27ae60"> · ✅ Cubierta</strong>':''}</div>
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
          <div class="ayuda-card-title">${d.tipo==='perro'?'🐕':d.tipo==='gato'?'🐈':'🐹'} ${d.nombre||(d.tipo==='perro'?'Perro':d.tipo==='gato'?'Gato':'Mascota')}</div>
          ${d.descripcion?`<div class="ayuda-card-desc">${d.descripcion}</div>`:''}
          <div class="ayuda-card-desc">📍 ${d.ubicacion||'Sin ubicación'}</div>
          <div class="feed-card-footer">${d.contacto?'📞 '+d.contacto:''}${d.reportado_por?' · 👤 '+d.reportado_por:''}</div>
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
          <div class="ayuda-card-title">🙋 ${d.nombre||'?'}</div>
          <div class="ayuda-card-desc">🔧 ${d.tipo||'No especifica'}${d.telefono?' · 📞 '+d.telefono:''}</div>
          ${d.ubicacion?`<div class="ayuda-card-desc">📍 ${d.ubicacion}</div>`:''}
          ${d.notas?`<div class="ayuda-card-desc" style="color:var(--text-muted);font-style:italic">${d.notas}</div>`:''}
          <div class="feed-card-footer">👤 ${d.reportado_por||'Anónimo'}</div>
        </div>`;
      }
    }
  };

  function initSB() { sb = window.supabase.createClient(SUPABASE_URL, ANON_KEY); }

  async function loadAll() {
    const [c,z,e,s,cf] = await Promise.all([
      ...['centros_acopio','zonas_colapsadas','edificios_riesgo','reportes_sismos'].map(t => sb.from(t).select('*').order('id',{ascending:false})),
      sb.from('cifras').select('*').order('prioridad',{ascending:true})
    ]);
    allData.centros_acopio = c.data.reverse(); allData.zonas_colapsadas = z.data.reverse();
    allData.edificios_riesgo = e.data.reverse(); allData.reportes_sismos = s.data.reverse();
    cifras = cf.data||[];
  }

  function subscribe() {
    const ch = sb.channel('venezuela-cambios');
    ['centros_acopio','zonas_colapsadas','edificios_riesgo','reportes_sismos','denuncias','cifras'].forEach(t => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => refresh());
    });
    ch.subscribe();
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
    const g = L.layerGroup();
    usgsQuakes.forEach(q => {
      const col = q.mag >= 5 ? '#e74c3c' : q.mag >= 4 ? '#f39c12' : '#3498db';
      const r = q.mag >= 5 ? 14 : q.mag >= 4 ? 10 : 7;
      L.circleMarker([q.lat, q.lng], {
        radius: r, color: col, fillColor: col, fillOpacity: 0.6, weight: 2, opacity: 0.8
      }).bindPopup(`<div class="popup-content"><h3>📡 USGS — M${q.mag}</h3>
        <p>📍 ${q.lugar}</p><p>📏 ${q.depth.toFixed(1)} km profundidad</p>
        <p>🕐 ${new Date(q.time).toLocaleString('es-VE')}</p>
        <p style="font-size:10px;color:var(--text-muted)">Fuente: USGS · actualiza cada 60s</p>
        <a href="${q.url}" target="_blank" style="color:#3498db;font-size:11px">Ver en USGS ↗</a></div>`).addTo(g);
    });
    g.addTo(map); layers.usgs = g;
  }

  /* ========== FEED ========== */

  async function loadFeed() {
    const { data } = await sb.from('feed').select('*').order('id', { ascending: false }).limit(100);
    feedData = data||[];
    renderFeed();
  }

  function subscribeFeed() {
    if (feedSub) feedSub.unsubscribe();
    feedSub = sb.channel('feed-cambios');
    feedSub.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed' }, payload => {
      feedData.unshift(payload.new);
      if (feedData.length > 100) feedData.pop();
      renderFeed(); renderFeedMap();
    });
    feedSub.subscribe();
  }

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
    el.innerHTML = combined.map(f => feedCard(f)).join('');
  }

  function feedCard(f) {
    const cat = CATS[f.categoria]||{label:'❓',color:'#7f8c8d'};
    const fuente = FUENTES[f.fuente_tipo]||FUENTES.otro;
    const conf = CONFIABILIDAD[f.confiabilidad]||CONFIABILIDAD.media;
    const t = timeAgo(f.created_at);
    const coords = (f.lat&&f.lng) ? `onclick="app.feedMap(${f.lat},${f.lng})"` : '';
    const isSismo = f.categoria === 'sismo';
    return `<div class="feed-card" style="border-left:4px solid ${cat.color}">
      <div class="feed-card-header">
        <span class="feed-cat" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">${cat.label}${isSismo ? ' M'+(f.mag||'') : ''}</span>
        <span class="feed-time">${t}</span>
      </div>
      <div class="feed-card-title">${f.titulo}</div>
      ${f.descripcion ? `<div class="feed-card-desc">${f.descripcion}</div>` : ''}
      <div class="feed-card-footer">
        ${isSismo ? `<span style="font-weight:600;color:#ff6666">📡 ${f.reportado_por} / Funvisis / SGC</span>` : `<span>${fuente.label}</span>`}
        <span>${conf.label}</span>
        ${f.ubicacion_nombre ? `<span class="feed-loc" ${coords}>📍 ${f.ubicacion_nombre}</span>` : ''}
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
    const allItems = [...feedData.filter(f => f.lat && f.lng), ...usgsToFeed().filter(f => f.lat && f.lng)];
    if (!allItems.length) return;
    const g = L.layerGroup();
    allItems.forEach(f => {
      const cat = CATS[f.categoria]||{color:'#7f8c8d'};
      const t = timeAgo(f.created_at);
      L.circleMarker([f.lat, f.lng], {
        radius: 6, color: cat.color, fillColor: cat.color, fillOpacity: 0.5, weight: 2
      }).bindPopup(`<div style="font-size:12px"><strong>${f.titulo}</strong><br>${f.descripcion||''}<br><span style="color:var(--text-muted);font-size:10px">${t}</span></div>`).addTo(g);
    });
    g.addTo(map); layers.feed = g;
  }

  async function submitFeed(e) {
    e.preventDefault();
    const titulo = document.getElementById('feedTitulo').value.trim();
    const categoria = document.getElementById('feedCategoria').value;
    const descripcion = document.getElementById('feedDescripcion').value.trim();
    const ubicacion_nombre = document.getElementById('feedUbicacion').value.trim();
    const fuente_tipo = document.getElementById('feedFuenteTipo').value;
    const confiabilidad = document.getElementById('feedConfiabilidad').value;
    const reportado_por = document.getElementById('feedReportadoPor').value.trim()||'anónimo';
    if (!titulo) return alert('El título es obligatorio.');
    const record = { titulo, categoria, descripcion, ubicacion_nombre, fuente_tipo, confiabilidad, reportado_por };
    if (pendingLat && pendingLng) { record.lat = pendingLat; record.lng = pendingLng; }
    const { error } = await sb.from('feed').insert(record);
    if (error) return alert('❌ Error: '+error.message);
    document.getElementById('feedForm').reset();
    document.getElementById('feedModal').classList.add('hidden');
    pendingLat = null; pendingLng = null;
    renderFeed(); renderFeedMap();
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
    input.value = '';
    document.getElementById('chatSend').disabled = true;
    const { error } = await sb.from('chat_mensajes').insert({ alias, mensaje });
    if (error) { console.error('Chat error:', error); alert('❌ Error: '+error.message); document.getElementById('chatSend').disabled = false; return; }
    setTimeout(() => document.getElementById('chatSend').disabled = false, 300);
  }

  function emitTyping() {
    const alias = currentAlias();
    if (chatBroadcast && alias) chatBroadcast.send({ type: 'broadcast', event: 'typing', payload: { alias } }).catch(()=>{});
  }

  /* ========== PERSONAS ========== */

  async function loadPersonas() {
    const { data } = await sb.from('personas').select('*').order('id', { ascending: false }).limit(200);
    personasData = data||[];
    renderPersonas();
  }

  function subscribePersonas() {
    if (personasSub) personasSub.unsubscribe();
    personasSub = sb.channel('personas-cambios');
    personasSub.on('postgres_changes', { event: '*', schema: 'public', table: 'personas' }, () => { loadPersonas(); });
    personasSub.subscribe();
  }

  function renderPersonas() {
    const el = document.getElementById('personasList');
    if (!el) return;
    let filtered = personasData;
    if (personasStatusFilter !== 'todas') filtered = filtered.filter(p => p.status === personasStatusFilter);
    if (personasSearchQuery) {
      const q = personasSearchQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      filtered = filtered.filter(p => p.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q));
    }
    if (!filtered.length) {
      el.innerHTML = '<div class="feed-empty">No hay personas registradas. ¡Registrate para que te encuentren!</div>';
      return;
    }
    el.innerHTML = filtered.map(p => {
      const st = STATUS_PERSONA[p.status]||STATUS_PERSONA.bien;
      const t = timeAgo(p.created_at);
      const foto = p.foto ? `<img src="${p.foto}" class="persona-foto">` : `<div class="persona-foto persona-foto-placeholder">${p.nombre.charAt(0).toUpperCase()}</div>`;
      const needs = p.necesidades&&p.necesidades.length ? `<div class="persona-needs">🆘 ${(Array.isArray(p.necesidades)?p.necesidades:[]).join(', ')}</div>` : '';
      return `<div class="persona-card">
        ${foto}
        <div class="persona-info">
          <div class="persona-name">${p.nombre}</div>
          <span class="persona-status" style="background:${st.color}22;color:${st.color};border:1px solid ${st.color}44">${st.label}</span>
          ${p.ubicacion_texto ? `<div class="persona-loc">📍 ${p.ubicacion_texto}</div>` : ''}
          ${p.telefono ? `<div class="persona-tel">📞 ${p.telefono}</div>` : ''}
          ${needs}
          ${p.notas ? `<div class="persona-notes">${p.notas}</div>` : ''}
          <div class="persona-time">${t}</div>
        </div>
      </div>`;
    }).join('');
  }

  async function submitPersona(e) {
    e.preventDefault();
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
    const { error } = await sb.from('personas').insert({ nombre, status, lat, lng, ubicacion_texto, telefono, notas, necesidades, foto: foto||null });
    if (error) return alert('❌ Error: '+error.message);
    document.getElementById('personasForm').reset();
    document.getElementById('pFotoPreview').style.display = 'none';
    document.getElementById('pFotoImg').src = '';
    pendingLat = null; pendingLng = null;
    document.getElementById('pGpsBtn').style.borderColor = 'var(--border)';
    alert('✅ Te registraste. Tus seres queridos pueden encontrarte ahora.');
  }

  function handlePersonaPhoto() {
    const file = document.getElementById('pFotoInput').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = document.getElementById('pFotoImg');
      img.src = e.target.result;
      document.getElementById('pFotoPreview').style.display = 'flex';
    };
    reader.readAsDataURL(file);
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
        <div class="feed-card-title" style="color:${col};font-size:18px">M${q.mag} <span style="font-size:13px;color:var(--text)">— ${q.lugar}</span></div>
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
      const { data } = await sb.from(AYUDA_CONFIG[key].table).select('*').order('id', { ascending: false }).limit(200);
      ayudaData[key] = data||[];
    });
    await Promise.all(promises);
    renderAyuda();
  }

  function subscribeAyuda() {
    ayudaSubs.forEach(s => { try { s.unsubscribe(); } catch(e) {} });
    ayudaSubs = AYUDA_TABLES.map((key) => {
      const chan = sb.channel('ayuda-'+key);
      chan.on('postgres_changes', { event: '*', schema: 'public', table: AYUDA_CONFIG[key].table }, () => { loadAyudaTable(key); });
      chan.subscribe();
      return chan;
    });
  }

  async function loadAyudaTable(key) {
    const { data } = await sb.from(AYUDA_CONFIG[key].table).select('*').order('id', { ascending: false }).limit(200);
    ayudaData[key] = data||[];
    renderAyuda();
  }

  function renderAyuda() {
    const grid = document.getElementById('ayudaGrid');
    const filters = document.getElementById('ayudaFilters');
    if (!grid) return;
    // Build action cards
    grid.innerHTML = AYUDA_TABLES.map((key, i) => {
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
    // Build filter pills
    const allFilters = [{key:'todas',icon:'📋',label:'Todas'}]
      .concat(AYUDA_TABLES.map(k => ({key:k, icon:AYUDA_CONFIG[k].icon, label:AYUDA_CONFIG[k].label.replace(/^..\s/,'').split(' ')[0]})));
    filters.innerHTML = allFilters.map(f =>
      `<button class="feed-filter ayuda-filter ${f.key===ayudaFilter?'active':''}" data-ayuda="${f.key}">${f.icon} ${f.label}</button>`
    ).join('');
    // Render list
    renderAyudaList();
  }

  function renderAyudaList() {
    const el = document.getElementById('ayudaList');
    if (!el) return;
    let items = [];
    if (ayudaFilter === 'todas') {
      AYUDA_TABLES.forEach(key => {
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
    el.innerHTML = items.map(({key, data}) => {
      const fn = AYUDA_CONFIG[key] && AYUDA_CONFIG[key].render;
      return fn ? fn(data) : `<div class="ayuda-card-item">${JSON.stringify(data).slice(0,100)}</div>`;
    }).join('');
  }

  function openAyudaForm(type) {
    const cfg = AYUDA_CONFIG[type];
    if (!cfg) return;
    document.getElementById('ayudaModalTitle').textContent = cfg.icon + ' ' + cfg.label;
    document.getElementById('ayudaType').value = type;
    document.getElementById('ayudaFields').innerHTML = cfg.fields();
    document.getElementById('ayudaForm').reset();
    document.getElementById('ayudaModal').classList.remove('hidden');
  }

  async function submitAyuda(e) {
    e.preventDefault();
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
    if ($('afLat')?.value) data.lat = parseFloat($('afLat').value) || null;
    if ($('afLng')?.value) data.lng = parseFloat($('afLng').value) || null;
    if (!data.nombre && !data.nombre_aproximado && type === 'hospitales') return alert('El nombre es obligatorio.');
    if (!data.nombre && type === 'ayudantes') return alert('El nombre es obligatorio.');
    if (!data.nombre_aproximado && type === 'ninos') data.nombre_aproximado = 'No disponible';
    const { error } = await sb.from(cfg.table).insert(data);
    if (error) return alert('❌ Error: '+error.message);
    document.getElementById('ayudaForm').reset();
    document.getElementById('ayudaModal').classList.add('hidden');
    alert('✅ Reportado. Aparece al instante.');
    loadAyudaTable(type);
  }

  window.app.rescatar = async function(key, id) {
    if (!confirm('¿Confirmás que fueron rescatados?')) return;
    const cfg = key === 'atrapadas' ? AYUDA_CONFIG.atrapadas : null;
    if (!cfg) return;
    const { error } = await sb.from(cfg.table).update({ rescatado: true }).eq('id', id);
    if (error) return alert('❌ '+error.message);
    loadAyudaTable(key);
  };
  window.app.reunificar = async function(id) {
    if (!confirm('¿Confirmás que este niño/a fue reunificado con su familia?')) return;
    const { error } = await sb.from('ninos_solos').update({ estado: 'reunificado' }).eq('id', id);
    if (error) return alert('❌ '+error.message);
    loadAyudaTable('ninos');
  };
  window.app.cubrir = async function(id) {
    if (!confirm('¿Confirmás que esta necesidad está cubierta?')) return;
    const { error } = await sb.from('necesidades').update({ cubierta: true }).eq('id', id);
    if (error) return alert('❌ '+error.message);
    loadAyudaTable('necesidades');
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
    const cLayer = L.layerGroup();
    (allData.centros_acopio||[]).forEach(c => { L.marker([c.lat,c.lng],{icon:divIcon('📦',statusColor[c.status]||'#27ae60')}).bindPopup(centroPop(c)).addTo(cLayer); });
    cLayer.addTo(map); layers.centros = cLayer;
    const zLayer = L.layerGroup();
    (allData.zonas_colapsadas||[]).forEach(z => {
      L.marker([z.lat,z.lng],{icon:divIcon('💥','#e74c3c')}).bindPopup(colapPop(z)).addTo(zLayer);
      if (z.radio) L.circle([z.lat,z.lng],{radius:z.radio,color:z.nivel==='total'?'#e74c3c':'#f39c12',fillColor:z.nivel==='total'?'#e74c3c':'#f39c12',fillOpacity:0.1,weight:2}).addTo(zLayer);
    });
    zLayer.addTo(map); layers.colapsadas = zLayer;
    const eLayer = L.layerGroup();
    (allData.edificios_riesgo||[]).forEach(e => L.marker([e.lat,e.lng],{icon:divIcon('⚠️','#f39c12')}).bindPopup(riesgoPop(e)).addTo(eLayer));
    eLayer.addTo(map); layers.riesgo = eLayer;
    const sLayer = L.layerGroup();
    (allData.reportes_sismos||[]).forEach(s => {
      const col = s.tipo==='principal'?'#ff0000':s.tipo==='premonitor'?'#ff6600':'#ffaa00';
      const sz = s.tipo==='principal'?48:s.tipo==='premonitor'?42:30;
      L.marker([s.lat,s.lng],{icon:divIcon('🔴',col,sz)}).bindPopup(sismoPop(s)).addTo(sLayer);
    });
    sLayer.addTo(map); layers.sismos = sLayer;
    renderFeedMap();
    updateUI();
    renderCifras();
  }

  function clearLayers() {
    Object.values(markers).forEach(arr => { arr.forEach(m=>m.remove()); arr.length=0; });
    Object.values(layers).forEach(l => { if(l) l.remove(); });
    layers = { centros: null, colapsadas: null, riesgo: null, sismos: null, usgs: null, feed: null };
  }

  function btnDenunciar(type, id) {
    return `<br><button onclick="app.denunciar('${type}',${id})" style="background:transparent;border:1px solid #e74c3c;color:#e74c3c;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;margin-top:4px">🚨 Denunciar</button>`;
  }

  function refugioBadge(r) {
    const m = { listo: '🟢 Listo para recibir gente', parcial: '🟡 Parcialmente listo', no_listo: '🔴 No listo para recibir gente' };
    return r ? `<span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${r==='listo'?'#27ae6020':r==='parcial'?'#f39c1220':'#e74c3c20'};color:${r==='listo'?'#27ae60':r==='parcial'?'#f39c12':'#e74c3c'};border:1px solid ${r==='listo'?'#27ae6044':r==='parcial'?'#f39c1244':'#e74c3c44'};margin-top:4px">${m[r]||r}</span>` : '';
  }
  function excesoBadge(arr) { return arr&&arr.length ? `<p style="margin-top:4px">📦 Exceso: <strong>${arr.join(', ')}</strong></p>` : ''; }
  function tieneBadge(arr) { return arr&&arr.length ? `<p>✅ Tiene: ${arr.join(', ')}</p>` : ''; }

  function centroPop(c) {
    const d = c.denuncias_count||0;
    return `<div class="popup-content" style="${denunciadoCSS(d)}"><h3>📦 ${c.nombre}</h3>
      <p style="margin:4px 0">${badgeFuente(c.fuente_tipo)} ${badgeConf(c.confiabilidad)} ${badgeDenuncias(d)}</p>
      <p>📍 ${c.direccion||''}<br>📞 ${c.contacto||'N/D'} ${c.horario?'| 🕐 '+c.horario:''}</p>
      ${tieneBadge(c.tiene)}${excesoBadge(c.tiene_exceso)}
      <p>🆘 Necesita: ${(c.necesita||[]).join(', ')||'N/E'}</p>
      ${refugioBadge(c.status_refugio)}${c.capacidad_personas?`<span style="font-size:11px;color:var(--text-muted)"> 👥 ${c.capacidad_personas} personas</span>`:''}
      <span class="popup-status status-badge status-${c.status}">${statusL(c.status)}</span>
      <br><button onclick="app.detail('centro',${c.id})" style="background:var(--primary);color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;margin-top:6px">Ver más</button>${btnDenunciar('centro',c.id)}</div>`;
  }
  function colapPop(z) {
    const d = z.denuncias_count||0;
    return `<div class="popup-content" style="${denunciadoCSS(d)}"><h3>💥 ${z.nombre}</h3>
      <p style="margin:4px 0">${badgeFuente(z.fuente_tipo)} ${badgeConf(z.confiabilidad)} ${badgeDenuncias(d)}</p>
      <p>📍 ${z.direccion||''} | 📏 ${z.radio||'N/A'}m</p><p>${z.descripcion||''}</p>
      <span class="popup-status status-badge status-${z.nivel}">${z.nivel==='total'?'💥 Colapso Total':'⚠️ Parcial'}</span>
      <br><button onclick="app.detail('colapsada',${z.id})" style="background:var(--primary);color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer;margin-top:6px">Ver más</button>${btnDenunciar('colapsada',z.id)}</div>`;
  }
  function riesgoPop(e) {
    const d = e.denuncias_count||0;
    const r={'alto':'🔴 Alto','medio':'🟡 Medio','bajo':'🟢 Bajo'};
    const s={'evacuado':'🧑‍🚒 Evacuado','ocupado':'👥 Ocupado','parcial':'⚠️ Parcial','colapsado':'💥 Colapsado'};
    return `<div class="popup-content" style="${denunciadoCSS(d)}"><h3>⚠️ ${e.nombre}</h3>
      <p style="margin:4px 0">${badgeFuente(e.fuente_tipo)} ${badgeConf(e.confiabilidad)} ${badgeDenuncias(d)}</p>
      <p>📍 ${e.direccion||''}<br>📊 ${r[e.riesgo]||e.riesgo} | ${s[e.estado]||e.estado}</p>
      <p>${e.descripcion||''}</p>
      <br><button onclick="app.detail('riesgo',${e.id})" style="background:var(--primary);color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;cursor:pointer">Ver más</button>${btnDenunciar('riesgo',e.id)}</div>`;
  }
  function sismoPop(s) {
    const d = s.denuncias_count||0;
    const tipos = { principal:'💥 TERREMOTO PRINCIPAL', premonitor:'⚠️ SISMO PREMONITOR', replica:'🔶 RÉPLICA' };
    const prof = s.profundidad_km ? `| 📏 ${s.profundidad_km}km` : '';
    return `<div class="popup-content" style="${denunciadoCSS(d)}"><h3>${tipos[s.tipo]||'🔶 SISMO'}</h3>
      <p style="margin:4px 0">${badgeFuente(s.fuente_tipo)} ${badgeConf(s.confiabilidad)} ${badgeDenuncias(d)}</p>
      <p>⚡ Magnitud: <strong>M${s.magnitud}</strong> ${prof}<br>📍 ${s.ubicacion||''}<br>🕐 ${new Date(s.hora_utc).toLocaleString('es-VE')}</p>
      <p>${s.descripcion||''}</p>
      <p style="font-size:10px;color:var(--text-muted)">${s.reportado_por}</p>${btnDenunciar('sismo',s.id)}</div>`;
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
      return `<div class="${cls}" title="${(c.descripcion||'')}${c.fuente?' | Fuente: '+c.fuente:''}"><span class="cifra-num">${c.valor}</span><span class="cifra-lbl">${c.etiqueta}</span></div>`;
    }).join('');
    document.getElementById('cifraUpdated').textContent = `🕐 ${timeStr}`;
  }

  function updateUI() {
    document.getElementById('statCentros').textContent = allData.centros_acopio.length;
    document.getElementById('statActivos').textContent = allData.centros_acopio.filter(c=>c.status==='activo').length;
    document.getElementById('statColapsadas').textContent = allData.zonas_colapsadas.length;
    document.getElementById('statRiesgo').textContent = allData.edificios_riesgo.length;
    const total = allData.zonas_colapsadas.filter(z=>z.nivel==='total').length;
    const p = document.getElementById('statusBadge');
    p.textContent = total>0 ? `💥 ${total} COLAPSADAS` : '⚠️ SIN REPORTES';
    p.className = total>0 ? 'badge badge-danger' : 'badge badge-warning';
    const totalPts = allData.centros_acopio.length + allData.zonas_colapsadas.length + allData.edificios_riesgo.length + allData.reportes_sismos.length;
    const totalDen = [allData.centros_acopio,allData.zonas_colapsadas,allData.edificios_riesgo,allData.reportes_sismos].reduce((a,arr)=>a+arr.reduce((s,i)=>s+(i.denuncias_count||0),0),0);
    document.getElementById('lastUpdated').textContent = `📊 ${totalPts} puntos • ⚡ ${allData.reportes_sismos.length} sismos • 🚨 ${totalDen} denuncias`;
    const all = [
      ...allData.reportes_sismos.map(i=>({...i,tl:`⚡ M${i.magnitud}`})),
      ...allData.centros_acopio.map(i=>({...i,tl:'📦 Centro'})),
      ...allData.zonas_colapsadas.map(i=>({...i,tl:'💥 Colapso'})),
      ...allData.edificios_riesgo.map(i=>({...i,tl:'⚠️ Riesgo'})),
    ].sort((a,b)=>b.id-a.id).slice(0,20);
    document.getElementById('recentReports').innerHTML = all.length
      ? all.map(i => {
          const type = i.tl.includes('M')?'sismo':i.tl.includes('Centro')?'centro':i.tl.includes('Colapso')?'colapsada':'riesgo';
          const den = i.denuncias_count||0;
          const ref = i.status_refugio ? (i.status_refugio==='listo'?'🟢':i.status_refugio==='parcial'?'🟡':'🔴') : '';
          return `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:11px;cursor:pointer" onclick="app.detail('${type}',${i.id})">
            <strong>${i.tl}</strong> ${ref} — ${i.nombre||i.ubicacion||''} ${den?`<span style="color:#e74c3c;font-weight:600">🚨${den}</span>`:''}
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
        <div class="detail-field"><span class="detail-label">Ubicación</span><div class="detail-value">📍 ${item.ubicacion||'N/A'}</div></div>
        <div class="detail-field"><span class="detail-label">Hora</span><div class="detail-value">🕐 ${new Date(item.hora_utc).toLocaleString('es-VE')}</div></div>
        <div class="detail-field"><span class="detail-label">Fuente</span><div class="detail-value">${badgeFuente(item.fuente_tipo)} ${badgeConf(item.confiabilidad)} · ${item.reportado_por||'N/D'}</div></div>
        <div class="detail-field"><span class="detail-label">Coord.</span><div class="detail-value">${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}</div></div>
        <div class="detail-field"><span class="detail-label">Descripción</span><div class="detail-value">${item.descripcion||''}</div></div>${denBtn}`;
    } else if (type === 'centro') {
      item = d.centros_acopio.find(c=>c.id===id); if(!item) return;
      const s={'activo':'✅ Activo','colapsado':'💥 Colapsado','cerrado':'🔴 Cerrado','saturado':'⚠️ Saturado'};
      const cap={'alta':'Alta 🟢','media':'Media 🟡','baja':'Baja 🔴'};
      title=`📦 ${item.nombre}`;
      html=`<div class="detail-field"><span class="detail-label">Dirección</span><div class="detail-value">📍 ${item.direccion||'N/D'}</div></div>
        <div class="detail-field"><span class="detail-label">Estado</span><div class="detail-value"><span class="status-badge status-${item.status}">${s[item.status]||item.status}</span> ${badgeDenuncias(item.denuncias_count)}</div></div>
        <div class="detail-field"><span class="detail-label">Capacidad</span><div class="detail-value">${cap[item.capacidad]||item.capacidad}</div></div>
        <div class="detail-field"><span class="detail-label">Refugio</span><div class="detail-value">${refugioBadge(item.status_refugio)} ${item.capacidad_personas?`👥 Capacidad: ${item.capacidad_personas} personas`:''}</div></div>
        <div class="detail-field"><span class="detail-label">Horario</span><div class="detail-value">🕐 ${item.horario||'N/E'}</div></div>
        <div class="detail-field"><span class="detail-label">Contacto</span><div class="detail-value">📞 ${item.contacto||'N/D'}</div></div>
        <div class="detail-field"><span class="detail-label">✅ Tiene</span><div class="detail-value">${(item.tiene||[]).join(', ')||'N/E'}</div></div>
        <div class="detail-field"><span class="detail-label">📦 Exceso</span><div class="detail-value">${(item.tiene_exceso||[]).join(', ')||'Ninguno'}</div></div>
        <div class="detail-field"><span class="detail-label">🆘 Necesita</span><div class="detail-value">${(item.necesita||[]).join(', ')||'N/E'}</div></div>
        <div class="detail-field"><span class="detail-label">Fuente</span><div class="detail-value">${badgeFuente(item.fuente_tipo)} ${badgeConf(item.confiabilidad)} · ${item.reportado_por||'Anónimo'}</div></div>
        <div class="detail-field"><span class="detail-label">Descripción</span><div class="detail-value">${item.descripcion||''}</div></div>${denBtn}<br><button class="btn btn-success btn-block" onclick="navTo(${item.lat},${item.lng})">📍 Navegar aquí</button>`;
    } else if (type === 'colapsada') {
      item = d.zonas_colapsadas.find(z=>z.id===id); if(!item) return;
      title=`💥 ${item.nombre}`;
      html=`<div class="detail-field"><span class="detail-label">Dirección</span><div class="detail-value">📍 ${item.direccion||'N/D'}</div></div>
        <div class="detail-field"><span class="detail-label">Nivel</span><div class="detail-value"><span class="status-badge status-${item.nivel}">${item.nivel==='total'?'💥 Total':'⚠️ Parcial'}</span> ${badgeDenuncias(item.denuncias_count)}</div></div>
        <div class="detail-field"><span class="detail-label">Radio</span><div class="detail-value">📏 ${item.radio||'N/A'}m</div></div>
        <div class="detail-field"><span class="detail-label">Fuente</span><div class="detail-value">${badgeFuente(item.fuente_tipo)} ${badgeConf(item.confiabilidad)} · ${item.reportado_por||'Anónimo'}</div></div>
        <div class="detail-field"><span class="detail-label">Descripción</span><div class="detail-value">${item.descripcion||''}</div></div>${denBtn}<br><button class="btn btn-danger btn-block" onclick="navTo(${item.lat},${item.lng})">📍 Navegar aquí</button>`;
    } else {
      item = d.edificios_riesgo.find(e=>e.id===id); if(!item) return;
      const r={'alto':'🔴 Alto','medio':'🟡 Medio','bajo':'🟢 Bajo'};
      const s={'evacuado':'🧑‍🚒 Evacuado','ocupado':'👥 Ocupado','parcial':'⚠️ Parcial','colapsado':'💥 Colapsado'};
      title=`⚠️ ${item.nombre}`;
      html=`<div class="detail-field"><span class="detail-label">Dirección</span><div class="detail-value">📍 ${item.direccion||'N/D'}</div></div>
        <div class="detail-field"><span class="detail-label">Riesgo</span><div class="detail-value">${r[item.riesgo]||item.riesgo}</div></div>
        <div class="detail-field"><span class="detail-label">Estado</span><div class="detail-value">${s[item.estado]||item.estado}</div></div>
        <div class="detail-field"><span class="detail-label">Fuente</span><div class="detail-value">${badgeFuente(item.fuente_tipo)} ${badgeConf(item.confiabilidad)} · ${item.reportado_por||'Anónimo'}</div></div>
        <div class="detail-field"><span class="detail-label">Descripción</span><div class="detail-value">${item.descripcion||''}</div></div>${denBtn}`;
    }
    document.getElementById('detailTitle').textContent = title;
    document.getElementById('detailBody').innerHTML = html;
    document.getElementById('detailModal').classList.remove('hidden');
  }

  function navTo(lat,lng) { window.open(`https://www.openstreetmap.org/directions?from=&to=${lat}%2C${lng}`,'_blank'); }

  /* ========== DENUNCIAS ========== */
  function abrirDenuncia(type, id) {
    document.getElementById('denunciaType').value = type;
    document.getElementById('denunciaId').value = id;
    document.getElementById('denunciaForm').reset();
    document.getElementById('fieldDenunciante').value = '';
    document.getElementById('denunciaModal').classList.remove('hidden');
  }

  async function enviarDenuncia(e) {
    e.preventDefault();
    const tipo = document.getElementById('denunciaType').value;
    const id = parseInt(document.getElementById('denunciaId').value);
    const motivo = document.getElementById('fieldMotivo').value;
    const descripcion = document.getElementById('fieldDenunciaDesc').value.trim();
    const denunciado_por = document.getElementById('fieldDenunciante').value.trim()||'anonimo';
    const { error: err } = await sb.from('denuncias').insert({ tipo_reporte: tipo, reporte_id: id, motivo, descripcion, denunciado_por });
    if (err) return alert('❌ Error: '+err.message);
    const tableMap = { centro:'centros_acopio', colapsada:'zonas_colapsadas', riesgo:'edificios_riesgo', sismo:'reportes_sismos' };
    const table = tableMap[tipo];
    if (table) {
      const { count } = await sb.from('denuncias').select('*', { count:'exact', head: true }).eq('tipo_reporte', tipo).eq('reporte_id', id);
      await sb.from(table).update({ denuncias_count: count }).eq('id', id);
    }
    document.getElementById('denunciaModal').classList.add('hidden');
    alert('🚨 Denuncia registrada.');
    setTimeout(refresh, 500);
  }

  /* FORM */
  async function handleSubmit(e) {
    e.preventDefault();
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
    } else {
      table = 'reportes_sismos';
      record = { magnitud:parseFloat(document.getElementById('fieldMagnitud').value)||0,profundidad_km:parseInt(document.getElementById('fieldProfundidad').value)||10,lat,lng,descripcion,reportado_por,fuente_tipo,confiabilidad,ubicacion:document.getElementById('fieldSismoUbicacion').value||direccion||nombre,hora_utc:new Date().toISOString(),tipo:document.getElementById('fieldTipoSismo').value};
    }
    const { error } = await sb.from(table).insert(record);
    if (error) return alert('❌ Error: '+error.message);
    closeModal(); alert('✅ Reporte enviado.');
  }

  function showModal(type) {
    const titles = { centro:'📦 Reportar Centro', colapsada:'💥 Zona Colapsada', riesgo:'⚠️ Edificio Riesgo', sismo:'⚡ Reportar Sismo/Réplica' };
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
    };
    document.getElementById('modalTitle').textContent = titles[type]||'Reportar';
    document.getElementById('extraFields').innerHTML = fields[type]||'';
    document.getElementById('reportForm').reset();
    document.getElementById('fieldType').value = type;
    document.getElementById('fieldFuenteTipo').value = type==='sismo'?'oficial':'ciudadano';
    document.getElementById('fieldConfiabilidad').value = type==='sismo'?'alta':'baja';
    if (pendingLat&&pendingLng) { document.getElementById('fieldLat').value=pendingLat; document.getElementById('fieldLng').value=pendingLng; }
    document.getElementById('reportModal').classList.remove('hidden');
  }

  function closeModal() { document.getElementById('reportModal').classList.add('hidden'); pendingLat=null; pendingLng=null; }

  async function refresh() { try { await loadAll(); renderAll(); } catch(e) { console.error(e); } }

  window.app = {};

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
    initSB(); initMap(); await refresh(); subscribe();
    fetchUSGS(); setInterval(fetchUSGS, 60000);
    await loadFeed(); subscribeFeed();
    await loadChat(); subscribeChat();
    await loadPersonas(); subscribePersonas();
    await loadAyuda(); subscribeAyuda();
    setInterval(renderSismos, 30000);
    initTabs();
    window.app.detail = showDetail;
    window.app.denunciar = abrirDenuncia;
  }
  document.addEventListener('DOMContentLoaded', init);

  /* EVENTS */
  document.addEventListener('DOMContentLoaded', function() {
    const $ = id => document.getElementById(id);
    $('menuBtn').addEventListener('click', ()=>$('sidebar').classList.toggle('hidden'));
    $('closeSidebar').addEventListener('click', ()=>$('sidebar').classList.add('hidden'));
    ['Centros','Colapsadas','Riesgo'].forEach(t => {
      $('filter'+t).addEventListener('change', function() {
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
    $('reportCentro').addEventListener('click', ()=>{ $('sidebar').classList.add('hidden'); showModal('centro'); });
    $('reportColapso').addEventListener('click', ()=>{ $('sidebar').classList.add('hidden'); showModal('colapsada'); });
    $('reportRiesgo').addEventListener('click', ()=>{ $('sidebar').classList.add('hidden'); showModal('riesgo'); });
    $('reportSismo').addEventListener('click', ()=>{ $('sidebar').classList.add('hidden'); showModal('sismo'); });
    $('fabAdd').addEventListener('click', ()=>showModal('centro'));
    $('fabLocate').addEventListener('click', ()=>{
      if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p=>{map.setView([p.coords.latitude,p.coords.longitude],15);pendingLat=p.coords.latitude;pendingLng=p.coords.longitude;},()=>alert('Activa el GPS.'),{enableHighAccuracy:true});
      else alert('Geolocalización no disponible.');
    });
    $('closeModal').addEventListener('click', closeModal);
    $('closeDetail').addEventListener('click', ()=>$('detailModal').classList.add('hidden'));
    $('closeDenuncia').addEventListener('click', ()=>$('denunciaModal').classList.add('hidden'));
    $('cancelDenuncia').addEventListener('click', ()=>$('denunciaModal').classList.add('hidden'));
    $('closeFeedModal').addEventListener('click', ()=>$('feedModal').classList.add('hidden'));
    $('reportForm').addEventListener('submit', handleSubmit);
    $('denunciaForm').addEventListener('submit', enviarDenuncia);
    $('feedForm').addEventListener('submit', submitFeed);
    $('fabFeed').addEventListener('click', ()=>{ $('feedModal').classList.remove('hidden'); });

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
        alert('📍 Ubicación capturada.');
      }, () => alert('No se pudo obtener ubicación.'), { enableHighAccuracy: true });
    });
    $('personasForm').addEventListener('submit', submitPersona);

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
    $('closeAyudaModal').addEventListener('click', () => $('ayudaModal').classList.add('hidden'));
    $('ayudaForm').addEventListener('submit', submitAyuda);

    /* Personas search + status filters */
    $('personasSearch').addEventListener('input', function() {
      personasSearchQuery = this.value;
      renderPersonas();
    });
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

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  });
})();
