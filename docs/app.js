(function() {
  'use strict';
  const SUPABASE_URL = 'https://eedvfmohqletqcgkxcuf.supabase.co';
  const ANON_KEY = 'sb_publishable_FA6pZQhz5-xy0PYvECMR2A_rbDrxBat';
  let sb = null, map = null, layers = { centros: null, colapsadas: null, riesgo: null, sismos: null };
  let markers = { centros: [], colapsadas: [], riesgo: [], sismos: [] };
  let pendingLat = null, pendingLng = null;
  let allData = { centros_acopio: [], zonas_colapsadas: [], edificios_riesgo: [], reportes_sismos: [] };

  const FUENTES = { oficial:{label:'🏛 Gobierno/Oficial',color:'#3498db'}, organismo:{label:'🔬 Organismo Técnico',color:'#2ecc71'}, medio:{label:'📰 Medio',color:'#f39c12'}, ciudadano:{label:'👤 Ciudadano',color:'#95a5a6'}, otro:{label:'❓ Otra',color:'#7f8c8d'} };
  const CONFIABILIDAD = { alta:{label:'🟢 Alta',color:'#27ae60'}, media:{label:'🟡 Media',color:'#f39c12'}, baja:{label:'🔴 Baja',color:'#e74c3c'} };

  function initSB() { sb = window.supabaseClient.createClient(SUPABASE_URL, ANON_KEY); }

  async function loadAll() {
    const [c,z,e,s] = await Promise.all(['centros_acopio','zonas_colapsadas','edificios_riesgo','reportes_sismos'].map(t => sb.from(t).select('*').order('id',{ascending:false})));
    allData.centros_acopio = c.data.reverse(); allData.zonas_colapsadas = z.data.reverse();
    allData.edificios_riesgo = e.data.reverse(); allData.reportes_sismos = s.data.reverse();
  }

  function subscribe() {
    const ch = sb.channel('venezuela-cambios');
    ['centros_acopio','zonas_colapsadas','edificios_riesgo','reportes_sismos','denuncias'].forEach(t => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => refresh());
    });
    ch.subscribe();
  }

  function initMap() {
    map = L.map('map', { center: [10.4800, -67.5000], zoom: 7, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM | VENEZUELA CRISIS', maxZoom: 19 }).addTo(map);
    map.on('click', e => { pendingLat = e.latlng.lat; pendingLng = e.latlng.lng; });
  }

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
    (allData.centros_acopio||[]).forEach(c => {
      const flags = c.denuncias_count||0;
      L.marker([c.lat,c.lng],{icon:divIcon('📦',statusColor[c.status]||'#27ae60')}).bindPopup(centroPop(c)).addTo(cLayer);
    });
    cLayer.addTo(map); layers.centros = cLayer;

    const zLayer = L.layerGroup();
    (allData.zonas_colapsadas||[]).forEach(z => {
      const opts = {};
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

    updateUI();
  }

  function clearLayers() {
    Object.values(markers).forEach(arr => { arr.forEach(m=>m.remove()); arr.length=0; });
    Object.values(layers).forEach(l => { if(l) l.remove(); });
  }

  function btnDenunciar(type, id) {
    return `<br><button onclick="app.denunciar('${type}',${id})" style="background:transparent;border:1px solid #e74c3c;color:#e74c3c;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;margin-top:4px">🚨 Denunciar</button>`;
  }

  function refugioBadge(r) {
    const m = { listo: '🟢 Listo para recibir gente', parcial: '🟡 Parcialmente listo', no_listo: '🔴 No listo para recibir gente' };
    return r ? `<span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${r==='listo'?'#27ae6020':r==='parcial'?'#f39c1220':'#e74c3c20'};color:${r==='listo'?'#27ae60':r==='parcial'?'#f39c12':'#e74c3c'};border:1px solid ${r==='listo'?'#27ae6044':r==='parcial'?'#f39c1244':'#e74c3c44'};margin-top:4px">${m[r]||r}</span>` : '';
  }
  function excesoBadge(arr) {
    return arr&&arr.length ? `<p style="margin-top:4px">📦 Exceso: <strong>${arr.join(', ')}</strong></p>` : '';
  }
  function tieneBadge(arr) {
    return arr&&arr.length ? `<p>✅ Tiene: ${arr.join(', ')}</p>` : '';
  }

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
          return `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:11px;cursor:pointer"
             onclick="app.detail('${type}',${i.id})">
            <strong>${i.tl}</strong> ${ref} — ${i.nombre||i.ubicacion||''} ${den?`<span style="color:#e74c3c;font-weight:600">🚨${den}</span>`:''}
            <span style="color:var(--text-muted);font-size:10px;display:block">${badgeFuente(i.fuente_tipo)} ${badgeConf(i.confiabilidad)}</span>
          </div>`;
        }).join('')
      : '<p style="color:var(--text-muted);font-size:12px">Sin reportes aún</p>';
  }

  /* DETAIL con denuncias */
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
      const refugio = { listo:'🟢 Listo', parcial:'🟡 Parcial', no_listo:'🔴 No listo' };
      title=`📦 ${item.nombre}`;
      html=`<div class="detail-field"><span class="detail-label">Dirección</span><div class="detail-value">📍 ${item.direccion||'N/D'}</div></div>
        <div class="detail-field"><span class="detail-label">Estado</span><div class="detail-value"><span class="status-badge status-${item.status}">${s[item.status]||item.status}</span> ${badgeDenuncias(item.denuncias_count)}</div></div>
        <div class="detail-field"><span class="detail-label">Capacidad</span><div class="detail-value">${cap[item.capacidad]||item.capacidad}</div></div>
        <div class="detail-field"><span class="detail-label">Refugio</span><div class="detail-value">${refugioBadge(item.status_refugio)} ${item.capacidad_personas?`👥 Capacidad: ${item.capacidad_personas} personas`:''}</div></div>
        <div class="detail-field"><span class="detail-label">Horario</span><div class="detail-value">🕐 ${item.horario||'N/E'}</div></div>
        <div class="detail-field"><span class="detail-label">Contacto</span><div class="detail-value">📞 ${item.contacto||'N/D'}</div></div>
        <div class="detail-field"><span class="detail-label">✅ Tiene en stock</span><div class="detail-value">${(item.tiene||[]).join(', ')||'N/E'}</div></div>
        <div class="detail-field"><span class="detail-label">📦 Exceso de</span><div class="detail-value">${(item.tiene_exceso||[]).join(', ')||'Ninguno'}</div></div>
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
        <div class="detail-field"><span class="detail-label">Descripción</span><div class="detail-value">${item.descripcion||''}</div></div>${denBtn}<br><button class="btn btn-warning btn-block" onclick="navTo(${item.lat},${item.lng})">📍 Navegar aquí</button>`;
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

    const { error: err } = await sb.from('denuncias').insert({
      tipo_reporte: tipo, reporte_id: id, motivo, descripcion, denunciado_por
    });
    if (err) return alert('❌ Error: '+err.message);

    // Update denuncias_count
    const tableMap = { centro:'centros_acopio', colapsada:'zonas_colapsadas', riesgo:'edificios_riesgo', sismo:'reportes_sismos' };
    const table = tableMap[tipo];
    if (table) {
      const { count } = await sb.from('denuncias').select('*', { count:'exact', head: true }).eq('tipo_reporte', tipo).eq('reporte_id', id);
      await sb.from(table).update({ denuncias_count: count }).eq('id', id);
    }

    document.getElementById('denunciaModal').classList.add('hidden');
    alert('🚨 Denuncia registrada. Gracias por ayudar a mantener la información confiable.');
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

  function fuenteOptions(s) { return Object.entries(FUENTES).map(([k,v])=>`<option value="${k}" ${k===s?'selected':''}>${v.label}</option>`).join(''); }
  function confOptions(s) { return Object.entries(CONFIABILIDAD).map(([k,v])=>`<option value="${k}" ${k===s?'selected':''}>${v.label}</option>`).join(''); }

  function showModal(type) {
    const titles = { centro:'📦 Reportar Centro', colapsada:'💥 Zona Colapsada', riesgo:'⚠️ Edificio Riesgo', sismo:'⚡ Reportar Sismo/Réplica' };
    const fields = {
      centro:`<label>Capacidad</label><select id="fieldCapacidad"><option value="alta">Alta</option><option value="media" selected>Media</option><option value="baja">Baja</option></select><label>Estado</label><select id="fieldStatus"><option value="activo" selected>Activo</option><option value="saturado">Saturado</option><option value="colapsado">Colapsado</option><option value="cerrado">Cerrado</option></select>
<label>🏠 ¿Listo para recibir gente?</label><select id="fieldStatusRefugio"><option value="listo">🟢 Sí, listo</option><option value="parcial">🟡 Parcialmente</option><option value="no_listo" selected>🔴 No</option></select>
<label>👥 Capacidad de personas</label><input type="number" id="fieldCapacidadPersonas" value="0" min="0" max="10000">
<label>✅ ¿Qué tienen en stock? (coma)</label><input type="text" id="fieldTiene" placeholder="agua, comida, medicinas">
<label>📦 ¿Qué tienen en EXCESO? (coma)</label><input type="text" id="fieldTieneExceso" placeholder="ropa, zapatos">
<label>🆘 ¿Qué necesitan? (coma)</label><input type="text" id="fieldNecesita" placeholder="agua, comida, medicinas">
<label>Horario</label><input type="text" id="fieldHorario" placeholder="8am - 8pm">`,
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

  /* INIT */
  async function init() {
    initSB(); initMap(); await refresh(); subscribe();
    window.app = { detail: showDetail, denunciar: abrirDenuncia };
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
    $('reportForm').addEventListener('submit', handleSubmit);
    $('denunciaForm').addEventListener('submit', enviarDenuncia);
    document.querySelectorAll('.modal').forEach(m=>{
      m.addEventListener('click', function(e){ if(e.target===this) this.classList.add('hidden'); });
    });
    document.addEventListener('keydown', e=>{
      if(e.key==='Escape') {
        if(!$('reportModal').classList.contains('hidden')) closeModal();
        else if(!$('detailModal').classList.contains('hidden')) $('detailModal').classList.add('hidden');
        else if(!$('denunciaModal').classList.contains('hidden')) $('denunciaModal').classList.add('hidden');
        else if(!$('sidebar').classList.contains('hidden')) $('sidebar').classList.add('hidden');
      }
    });
  });
})();
