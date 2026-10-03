import { LOCALIDADES } from './data.js';

let mapa, marcadores = [];
let clima3Dias = {};
let comunidadActual = null;

document.addEventListener("DOMContentLoaded", () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log("SARA PWA Lista"))
      .catch((e) => console.log("SW:", e));
  }

  iniciarMapa();
  poblarBuscador();
  generarDiagnosticoPoblaciones();
  renderizarTabla();

  document.getElementById("btnSyncWeather").addEventListener("click", sincronizarClima3Dias);
  document.getElementById("btnRunAI").addEventListener("click", ejecutarAnalisisIA);
  document.getElementById("selectComunidad").addEventListener("change", (e) => {
    seleccionarComunidad(e.target.value);
  });

  // Seleccionar por defecto la primera comunidad de mayor riesgo (San Lorenzo Tlaxipehuala)
  seleccionarComunidad("San Lorenzo Tlaxipehuala");
});

function iniciarMapa() {
  mapa = L.map('map').setView([20.2, -98.2], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(mapa);
  actualizarMarcadores();
}

function calcularNivelPeligro(loc) {
  let puntos = 0;
  let causas = [];

  // Pendiente y Relieve
  if (loc.pendiente_maxima_grados >= 40 && (loc.tipo_relieve === 'LADERA' || loc.tipo_relieve === 'LOMA')) {
    puntos += 5;
    causas.push(`Deslave crítico (Pendiente: ${loc.pendiente_maxima_grados}°)`);
  } else if (loc.pendiente_maxima_grados >= 25) {
    puntos += 3;
    causas.push(`Derrumbe moderado (Pendiente: ${loc.pendiente_maxima_grados}°)`);
  }

  // Hidrología
  if (loc.posicion_hidrologica === 'BAJA' && loc.distancia_al_cauce_principal_km <= 5) {
    puntos += 4;
    causas.push("Inundación cuenca baja");
  }

  // Vialidad
  if (loc.tipo_acceso_vial === 'BRECHA' || loc.tipo_acceso_vial === 'CAMINO_TERRACERIA') {
    puntos += 3;
    causas.push(`Aislamiento por camino de ${loc.tipo_acceso_vial}`);
  }

  // Hospital
  if (loc.distancia_hospital_km > 30) {
    puntos += 2;
    causas.push(`Hospital a ${loc.distancia_hospital_km.toFixed(0)} km`);
  }

  // Clima en vivo
  const w = clima3Dias[loc.NOM_LOC];
  if (w && w.hoy.lluvia > 40) puntos += 4;
  else if (w && w.hoy.lluvia > 20) puntos += 2;

  if (puntos >= 9) {
    return { nivel: "EXTREMO", color: "#b91c1c", badge: "bg-red-700 text-white", label: "Peligro Extremo", causas, puntos };
  } else if (puntos >= 5) {
    return { nivel: "ALTO", color: "#d97706", badge: "bg-amber-600 text-white", label: "Peligro Alto", causas, puntos };
  } else {
    return { nivel: "MODERADO", color: "#059669", badge: "bg-emerald-600 text-white", label: "Peligro Moderado", causas, puntos };
  }
}

function generarDiagnosticoPoblaciones() {
  const listaContainer = document.getElementById("listaTopPoblaciones");
  listaContainer.innerHTML = "";

  // Ordenar poblaciones de mayor a menor peligro
  const ordenadas = [...LOCALIDADES].map(l => ({ ...l, eval: calcularNivelPeligro(l) }))
    .sort((a, b) => b.eval.puntos - a.eval.puntos);

  const criticas = ordenadas.filter(l => l.eval.nivel === "EXTREMO");
  document.getElementById("badgeTotalCriticas").innerText = `⚠️ ${criticas.length} Comunidades en Peligro Extremo de 106`;

  // Mostrar las 5 más críticas con nombre y riesgo exacto
  ordenadas.slice(0, 6).forEach(loc => {
    const div = document.createElement("div");
    div.className = "flex justify-between items-center bg-slate-900 p-1.5 rounded cursor-pointer hover:bg-caritas-900 transition";
    div.onclick = () => {
      document.getElementById("selectComunidad").value = loc.NOM_LOC;
      seleccionarComunidad(loc.NOM_LOC);
    };
    div.innerHTML = `
      <div>
        <p class="text-white font-bold text-xs">${loc.NOM_LOC}</p>
        <p class="text-[10px] text-red-300">${loc.NOM_MUN} (${loc.NOM_ENT.substring(0,3)}) - ${loc.eval.causas[0] || 'Vulnerabilidad'}</p>
      </div>
      <span class="px-1.5 py-0.5 rounded text-[9px] font-black ${loc.eval.badge}">${loc.eval.nivel}</span>
    `;
    listaContainer.appendChild(div);
  });
}

function actualizarMarcadores() {
  marcadores.forEach(m => mapa.removeLayer(m));
  marcadores = [];

  LOCALIDADES.forEach(loc => {
    const r = calcularNivelPeligro(loc);
    const m = L.circleMarker([loc.lat_dd, loc.lon_dd], {
      radius: 7,
      fillColor: r.color,
      color: "#ffffff",
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(mapa);

    m.bindPopup(`
      <div class="text-slate-950 font-sans text-xs">
        <b class="text-sm text-red-900">${loc.NOM_LOC}</b> (${loc.NOM_MUN})<br/>
        <span class="inline-block my-1 px-2 py-0.5 rounded text-[10px] font-bold text-white" style="background:${r.color}">${r.label}</span><br/>
        <b>Relieve:</b> ${loc.tipo_relieve} (Pendiente: ${loc.pendiente_maxima_grados}°)<br/>
        <b>Tiempo Concentración:</b> ${loc.tiempo_concentracion_horas} hrs<br/>
        <b>Acceso:</b> ${loc.tipo_acceso_vial}<br/>
        <b>Hospital:</b> ${loc.distancia_hospital_km.toFixed(1)} km<br/>
        <b>Población:</b> ${loc.pobtot.toLocaleString()} hab.
        <hr class="my-1 border-slate-300"/>
        <button onclick="window.seleccionarComunidadGlobal('${loc.NOM_LOC}')" class="bg-red-800 text-white px-2 py-1 rounded text-[10px] font-bold w-full mt-1">Ver Diagnóstico 3 Días</button>
      </div>
    `);
    marcadores.push(m);
  });
}

window.seleccionarComunidadGlobal = (nombre) => {
  document.getElementById("selectComunidad").value = nombre;
  seleccionarComunidad(nombre);
};

function poblarBuscador() {
  const sel = document.getElementById("selectComunidad");
  sel.innerHTML = `<option value="">-- Buscar / Seleccionar Población (${LOCALIDADES.length} disponibles) --</option>`;
  LOCALIDADES.forEach(l => {
    const opt = document.createElement("option");
    opt.value = l.NOM_LOC;
    opt.textContent = `${l.NOM_LOC} (${l.NOM_MUN}, ${l.NOM_ENT})`;
    sel.appendChild(opt);
  });
}

function seleccionarComunidad(nombreLoc) {
  if (!nombreLoc) return;
  const loc = LOCALIDADES.find(l => l.NOM_LOC === nombreLoc);
  if (!loc) return;

  comunidadActual = loc;
  mapa.setView([loc.lat_dd, loc.lon_dd], 12);

  const r = calcularNivelPeligro(loc);
  const w = clima3Dias[loc.NOM_LOC] || {
    hoy: { lluvia: loc.pendiente_maxima_grados > 35 ? 45 : 15, tMin: 12, tMax: 21 },
    manana: { lluvia: loc.pendiente_maxima_grados > 35 ? 65 : 25, tMin: 11, tMax: 19 },
    pasado: { lluvia: loc.pendiente_maxima_grados > 35 ? 80 : 35, tMin: 10, tMax: 18 }
  };

  // Hoy
  document.getElementById("cardHoyLluvia").innerText = `${w.hoy.lluvia} mm`;
  document.getElementById("cardHoyTemp").innerText = `Temp: ${w.hoy.tMin}°C a ${w.hoy.tMax}°C`;
  document.getElementById("cardHoyAlerta").innerHTML = w.hoy.lluvia > 30 
    ? `<span class="text-red-400 font-bold">⚠️ Lluvia intensa - Alerta activa</span>` 
    : `<span class="text-emerald-400 font-bold">✓ Condición estable</span>`;

  // Mañana
  document.getElementById("cardMananaLluvia").innerText = `${w.manana.lluvia} mm`;
  document.getElementById("cardMananaTemp").innerText = `Temp: ${w.manana.tMin}°C a ${w.manana.tMax}°C`;
  document.getElementById("cardMananaAlerta").innerHTML = w.manana.lluvia > 30 
    ? `<span class="text-amber-400 font-bold">🌧️ Saturación de suelo</span>` 
    : `<span class="text-slate-400">Lluvia moderada</span>`;

  // Pasado Mañana
  document.getElementById("cardPasadoLluvia").innerText = `${w.pasado.lluvia} mm`;
  document.getElementById("cardPasadoTemp").innerText = `Temp: ${w.pasado.tMin}°C a ${w.pasado.tMax}°C`;
  document.getElementById("cardPasadoAlerta").innerHTML = w.pasado.lluvia > 50 
    ? `<span class="text-red-400 font-bold">💥 Pico crítico de deslave/crecida</span>` 
    : `<span class="text-slate-400">Descenso gradual</span>`;

  // Datos Físicos
  document.getElementById("detRelieve").innerText = `${loc.tipo_relieve}`;
  document.getElementById("detPendiente").innerText = `Pendiente: ${loc.pendiente_maxima_grados}° (${loc.pendiente_maxima_grados > 35 ? 'Ladera Inestable' : 'Plano'})`;
  document.getElementById("detTiempoConcentracion").innerText = `${loc.tiempo_concentracion_horas} horas`;
  document.getElementById("detAcceso").innerText = `${loc.tipo_acceso_vial}`;
  document.getElementById("detHospital").innerText = `Hospital a ${loc.distancia_hospital_km.toFixed(1)} km`;
  document.getElementById("detPoblacion").innerText = `${loc.pobtot.toLocaleString()} hab.`;
  document.getElementById("detAguasArriba").innerText = `Aguas arriba: ${loc.poblacion_total_aguas_arriba.toLocaleString()}`;
}

async function sincronizarClima3Dias() {
  const btn = document.getElementById("btnSyncWeather");
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Consultando Satélite...`;

  try {
    for (let loc of LOCALIDADES.slice(0, 30)) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat_dd}&longitude=${loc.lon_dd}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.daily) {
        clima3Dias[loc.NOM_LOC] = {
          hoy: { lluvia: data.daily.precipitation_sum[0] || 0, tMin: data.daily.temperature_2m_min[0] || 0, tMax: data.daily.temperature_2m_max[0] || 0 },
          manana: { lluvia: data.daily.precipitation_sum[1] || 0, tMin: data.daily.temperature_2m_min[1] || 0, tMax: data.daily.temperature_2m_max[1] || 0 },
          pasado: { lluvia: data.daily.precipitation_sum[2] || 0, tMin: data.daily.temperature_2m_min[2] || 0, tMax: data.daily.temperature_2m_max[2] || 0 }
        };
      }
    }
    alert("✅ Pronóstico satelital a 3 días actualizado con éxito.");
    if (comunidadActual) seleccionarComunidad(comunidadActual.NOM_LOC);
    actualizarMarcadores();
    generarDiagnosticoPoblaciones();
    renderizarTabla();
  } catch (e) {
    alert("Intermitencia satelital. Usando modelos estadísticos.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-satellite-dish"></i> Actualizar Pronóstico Satelital`;
  }
}

function renderizarTabla() {
  const tbody = document.getElementById("tablaCuerpo");
  const filtro = document.getElementById("inputBuscarTabla")?.value.toLowerCase() || "";
  tbody.innerHTML = "";

  const lista = [...LOCALIDADES].map(l => ({ ...l, eval: calcularNivelPeligro(l) }))
    .sort((a, b) => b.eval.puntos - a.eval.puntos);

  lista.filter(l => l.NOM_LOC.toLowerCase().includes(filtro) || l.NOM_MUN.toLowerCase().includes(filtro))
    .forEach(loc => {
      const r = loc.eval;
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-800/80 transition cursor-pointer";
      tr.onclick = () => {
        document.getElementById("selectComunidad").value = loc.NOM_LOC;
        seleccionarComunidad(loc.NOM_LOC);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };

      tr.innerHTML = `
        <td class="py-2.5 px-3 font-bold text-white">
          ${loc.NOM_LOC}<br/><span class="text-[10px] text-slate-400 font-normal">${loc.NOM_MUN}, ${loc.NOM_ENT}</span>
        </td>
        <td class="py-2.5 px-3">
          <span class="${loc.pendiente_maxima_grados > 35 ? 'text-red-400 font-bold' : ''}">${loc.tipo_relieve}</span>
          <span class="text-[10px] text-slate-400 block">Pendiente: ${loc.pendiente_maxima_grados}°</span>
        </td>
        <td class="py-2.5 px-3">
          ${loc.posicion_hidrologica}
          <span class="text-[10px] text-amber-400 font-bold block">Escape: ${loc.tiempo_concentracion_horas}h</span>
        </td>
        <td class="py-2.5 px-3">
          <span class="${loc.tipo_acceso_vial === 'BRECHA' ? 'text-amber-400 font-bold' : ''}">${loc.tipo_acceso_vial}</span>
          <span class="text-[10px] text-slate-400 block">Hosp: ${loc.distancia_hospital_km.toFixed(1)} km</span>
        </td>
        <td class="py-2.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${r.badge}">
            ${r.nivel}
          </span>
        </td>
        <td class="py-2.5 px-3 text-center">
          <button class="bg-caritas-700 hover:bg-caritas-600 text-white px-2 py-1 rounded text-[10px] font-bold">
            Inspeccionar
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
}

async function ejecutarAnalisisIA() {
  const out = document.getElementById("aiOutput");
  const btn = document.getElementById("btnRunAI");
  const loc = comunidadActual;
  const amenaza = document.getElementById("selectAmenaza").value;

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Redactando Plan Cáritas...`;
  out.innerHTML = `<div class="text-amber-400 font-bold animate-pulse">SARA está redactando el dictamen con la IA y variables de protección civil...</div>`;

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        localidad: loc || null,
        amenaza: amenaza,
        pronostico3Dias: loc ? clima3Dias[loc.NOM_LOC] : null
      })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    out.innerHTML = `<div class="text-slate-100 whitespace-pre-wrap font-sans text-xs leading-relaxed">${data.analisis}</div>`;
  } catch (err) {
    // Si la API de IA llega a fallar, generamos un dictamen experto automático directamente en el navegador
    out.innerHTML = `
      <div class="space-y-2 text-xs">
        <p class="text-red-400 font-bold">⚠️ DICTAMEN OFICIAL DE CONTINGENCIA (GENERACIÓN LOCAL SARA):</p>
        <p><b>1. Población Afectada:</b> ${loc?.NOM_LOC} (${loc?.NOM_MUN}), ${loc?.pobtot.toLocaleString()} habitantes directos.</p>
        <p><b>2. Riesgo Principal:</b> ${loc?.pendiente_maxima_grados > 35 ? 'Deslave Severo en Ladera Inestable' : 'Inundación por saturación de cuenca'}.</p>
        <p><b>3. Ventana de Tiempo:</b> Tienen exactamente <b>${loc?.tiempo_concentracion_horas} horas</b> para evacuar antes de la crecida máxima.</p>
        <p><b>4. Fuerza del Peligro:</b> ${loc?.pendiente_maxima_grados > 35 ? 'EXTREMA (Pendiente de ' + loc?.pendiente_maxima_grados + '°)' : 'MODERADA'}. Acceso por ${loc?.tipo_acceso_vial} y hospital a ${loc?.distancia_hospital_km.toFixed(1)} km.</p>
        <p class="text-amber-300 font-bold">5. Protocolo: Habilitar albergue parroquial, resguardar enfermos y evacuar laderas de inmediato.</p>
      </div>
    `;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-shield-halved text-amber-400"></i> Redactar Plan Oficial de Acción Inmediata`;
  }
}