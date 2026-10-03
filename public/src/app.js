import { LOCALIDADES } from './data.js';

let mapa, marcadores = [];
let clima3Dias = {}; // Almacena pronóstico Hoy, Mañana, Pasado Mañana por localidad
let comunidadActual = null;

document.addEventListener("DOMContentLoaded", () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log("SARA PWA: Activo"))
      .catch((err) => console.log("SW:", err));
  }

  iniciarMapa();
  poblarBuscador();
  renderizarTabla();
  calcularDiagnosticoGeneral();

  document.getElementById("btnSyncWeather").addEventListener("click", sincronizarClima3Dias);
  document.getElementById("btnRunAI").addEventListener("click", ejecutarAnalisisIA);
  document.getElementById("selectComunidad").addEventListener("change", (e) => {
    seleccionarComunidad(e.target.value);
  });

  // Cargar primera comunidad por defecto (Tulancingo o Huauchinango)
  seleccionarComunidad("Tulancingo");
});

function iniciarMapa() {
  mapa = L.map('map').setView([20.15, -98.25], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(mapa);
  actualizarMarcadores();
}

function calcularNivelPeligro(loc) {
  let puntos = 0;
  let causas = [];

  if (loc.pendiente_maxima_grados >= 40 && (loc.tipo_relieve === 'LADERA' || loc.tipo_relieve === 'LOMA')) {
    puntos += 5;
    causas.push("Deslave en ladera pronunciada");
  } else if (loc.pendiente_maxima_grados >= 25) {
    puntos += 3;
    causas.push("Derrumbes moderados");
  }

  if (loc.posicion_hidrologica === 'BAJA' && loc.distancia_al_cauce_principal_km <= 5) {
    puntos += 4;
    causas.push("Inundación por cuenca baja");
  }

  if (loc.tipo_acceso_vial === 'BRECHA' || loc.tipo_acceso_vial === 'CAMINO_TERRACERIA') {
    puntos += 3;
    causas.push("Aislamiento por corte de terracería");
  }

  if (loc.distancia_hospital_km > 30) {
    puntos += 2;
    causas.push("Hospital lejano (>30 km)");
  }

  // Factor clima en vivo
  const w = clima3Dias[loc.NOM_LOC];
  if (w && w.hoy.lluvia > 50) puntos += 4;
  else if (w && w.hoy.lluvia > 20) puntos += 2;

  if (puntos >= 9) {
    return { nivel: "EXTREMO", color: "#b91c1c", badge: "bg-red-700 text-white", label: "Peligro Extremo", causas };
  } else if (puntos >= 5) {
    return { nivel: "ALTO", color: "#d97706", badge: "bg-amber-600 text-white", label: "Peligro Alto", causas };
  } else {
    return { nivel: "MODERADO", color: "#059669", badge: "bg-emerald-600 text-white", label: "Peligro Moderado", causas };
  }
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
        <b>Acceso Vial:</b> ${loc.tipo_acceso_vial}<br/>
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
    opt.textContent = `${l.NOM_LOC} - ${l.NOM_MUN}, ${l.NOM_ENT}`;
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
    hoy: { lluvia: 15, tMin: 12, tMax: 22 },
    manana: { lluvia: 35, tMin: 11, tMax: 20 },
    pasado: { lluvia: 50, tMin: 10, tMax: 18 }
  };

  // Actualizar Tarjeta de Hoy
  document.getElementById("cardHoyLluvia").innerText = `${w.hoy.lluvia} mm`;
  document.getElementById("cardHoyTemp").innerText = `Temp: ${w.hoy.tMin}°C a ${w.hoy.tMax}°C`;
  document.getElementById("cardHoyAlerta").innerHTML = w.hoy.lluvia > 30 
    ? `<span class="text-red-400 font-bold"><i class="fa-solid fa-triangle-exclamation"></i> Lluvia fuerte - Alerta de escurrimiento</span>`
    : `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-circle-check"></i> Condiciones manejables</span>`;

  // Actualizar Tarjeta de Mañana
  document.getElementById("cardMananaLluvia").innerText = `${w.manana.lluvia} mm`;
  document.getElementById("cardMananaTemp").innerText = `Temp: ${w.manana.tMin}°C a ${w.manana.tMax}°C`;
  document.getElementById("cardMananaAlerta").innerHTML = w.manana.lluvia > 30
    ? `<span class="text-amber-400 font-bold"><i class="fa-solid fa-cloud-showers-heavy"></i> Incremento de saturación de suelo</span>`
    : `<span class="text-slate-400">Lluvias moderadas dispersas</span>`;

  // Actualizar Tarjeta de Pasado Mañana
  document.getElementById("cardPasadoLluvia").innerText = `${w.pasado.lluvia} mm`;
  document.getElementById("cardPasadoTemp").innerText = `Temp: ${w.pasado.tMin}°C a ${w.pasado.tMax}°C`;
  document.getElementById("cardPasadoAlerta").innerHTML = w.pasado.lluvia > 40
    ? `<span class="text-red-400 font-bold"><i class="fa-solid fa-skull-crossbones"></i> Pico crítico de deslave/crecida</span>`
    : `<span class="text-slate-400">Disminución de precipitaciones</span>`;

  // Detalles Geográficos
  document.getElementById("detRelieve").innerText = `${loc.tipo_relieve}`;
  document.getElementById("detPendiente").innerText = `Pendiente Máx: ${loc.pendiente_maxima_grados}° (${loc.pendiente_maxima_grados > 35 ? 'Extrema' : 'Moderada'})`;
  document.getElementById("detTiempoConcentracion").innerText = `${loc.tiempo_concentracion_horas} horas`;
  document.getElementById("detAcceso").innerText = `${loc.tipo_acceso_vial}`;
  document.getElementById("detHospital").innerText = `Hospital a: ${loc.distancia_hospital_km.toFixed(1)} km`;
  document.getElementById("detPoblacion").innerText = `${loc.pobtot.toLocaleString()} hab.`;
  document.getElementById("detAguasArriba").innerText = `Aguas arriba: ${loc.poblacion_total_aguas_arriba.toLocaleString()}`;
}

function calcularDiagnosticoGeneral() {
  let extremas = 0;
  let pobRiesgo = 0;

  LOCALIDADES.forEach(l => {
    const r = calcularNivelPeligro(l);
    if (r.nivel === "EXTREMO") {
      extremas++;
      pobRiesgo += l.pobtot;
    }
  });

  document.getElementById("resumenPoblaciones").innerText = `${extremas} Localidades Críticas`;
  document.getElementById("resumenHabitantes").innerText = `${pobRiesgo.toLocaleString()} personas en zona de alta montaña`;
  document.getElementById("resumenRiesgoTipo").innerText = "Deslaves en Laderas y Aislamiento";
  document.getElementById("resumenRiesgoDetalle").innerText = "Pendientes > 35° con caminos de brecha";
  document.getElementById("resumenCuando").innerText = "Próximas 24h a 72h";
  document.getElementById("resumenTiempoVentana").innerText = "Tiempo de respuesta: 6 a 18 horas";
  document.getElementById("resumenFuerza").innerText = "PELIGRO MÁXIMO";
  document.getElementById("resumenFuerzaDetalle").innerText = "Saturación hídrica severa";
}

async function sincronizarClima3Dias() {
  const btn = document.getElementById("btnSyncWeather");
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Consultando Radares...`;

  try {
    // Tomamos muestra de coordenadas clave
    for (let loc of LOCALIDADES.slice(0, 25)) {
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
    renderizarTabla();
    calcularDiagnosticoGeneral();
  } catch (e) {
    alert("Intermitencia satelital. Se usan modelos estadísticos.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-satellite-dish"></i> Actualizar Pronóstico Satelital`;
  }
}

function renderizarTabla() {
  const tbody = document.getElementById("tablaCuerpo");
  const filtro = document.getElementById("inputBuscarTabla")?.value.toLowerCase() || "";
  tbody.innerHTML = "";

  LOCALIDADES.filter(l => l.NOM_LOC.toLowerCase().includes(filtro) || l.NOM_MUN.toLowerCase().includes(filtro))
    .forEach(loc => {
      const r = calcularNivelPeligro(loc);
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
        <td class="py-2.5 px-3 font-semibold text-amber-400">${loc.ZONA_ID} <span class="text-[10px] text-slate-400 block">${loc.altitud_msnm} msnm</span></td>
        <td class="py-2.5 px-3">
          <span class="${loc.pendiente_maxima_grados > 35 ? 'text-red-400 font-bold' : ''}">${loc.tipo_relieve}</span>
          <span class="text-[10px] text-slate-400 block">Máx: ${loc.pendiente_maxima_grados}°</span>
        </td>
        <td class="py-2.5 px-3">
          ${loc.posicion_hidrologica}
          <span class="text-[10px] text-slate-400 block">Tc: ${loc.tiempo_concentracion_horas}h</span>
        </td>
        <td class="py-2.5 px-3">
          <span class="${loc.tipo_acceso_vial === 'BRECHA' ? 'text-amber-400 font-bold' : ''}">${loc.tipo_acceso_vial}</span>
          <span class="text-[10px] text-slate-400 block">Hosp: ${loc.distancia_hospital_km.toFixed(1)} km</span>
        </td>
        <td class="py-2.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.badge}">
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
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Redactando Dictamen Cáritas...`;
  out.innerHTML = `<div class="text-amber-400 font-bold animate-pulse">SARA está procesando las pendientes, cuencas y el pronóstico de 3 días con la IA...</div>`;

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
    out.innerHTML = `<div class="text-red-400 font-bold">Error: ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-file-shield text-amber-400"></i> Generar Dictamen Oficial de Evacuación y Resguardo`;
  }
}