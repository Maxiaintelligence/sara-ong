import { LOCALIDADES } from './data.js';

let mapa, marcadores = [];
let climaEnVivo = {};

document.addEventListener("DOMContentLoaded", () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log("SARA PWA: Service Worker listo"))
      .catch((err) => console.log("Service Worker omitido:", err));
  }

  iniciarMapa();
  poblarSelects();
  calcularKPIs();

  document.getElementById("btnSyncWeather").addEventListener("click", sincronizarClimaEnVivo);
  document.getElementById("btnRunAI").addEventListener("click", ejecutarAnalisisIA);
  document.getElementById("selectComunidad").addEventListener("change", (e) => {
    const loc = LOCALIDADES.find(l => l.NOM_LOC === e.target.value);
    if (loc && mapa) {
      mapa.setView([loc.lat_dd, loc.lon_dd], 13);
    }
  });
});

function iniciarMapa() {
  mapa = L.map('map').setView([20.25, -98.45], 8);
  
  // Capa OpenStreetMap 100% libre sin API key ni marcas de agua
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(mapa);

  actualizarMarcadores();
}

function calcularNivelRiesgo(loc) {
  let puntos = 0;
  if (loc.pendiente_maxima_grados > 40 && loc.tipo_relieve === 'LADERA') puntos += 4;
  else if (loc.pendiente_maxima_grados > 25) puntos += 2;
  if (loc.posicion_hidrologica === 'BAJA' && loc.distancia_al_cauce_principal_km < 5) puntos += 3;
  if (loc.tiempo_concentracion_horas < 6) puntos += 2;
  if (loc.tipo_acceso_vial === 'BRECHA' || loc.tipo_acceso_vial === 'CAMINO_TERRACERIA') puntos += 2;
  if (loc.distancia_hospital_km > 30) puntos += 2;

  if (puntos >= 7) return { color: "#ef4444", label: "Crítico" };
  if (puntos >= 4) return { color: "#f59e0b", label: "Alto" };
  return { color: "#10b981", label: "Moderado" };
}

function actualizarMarcadores() {
  marcadores.forEach(m => mapa.removeLayer(m));
  marcadores = [];

  LOCALIDADES.forEach(loc => {
    const r = calcularNivelRiesgo(loc);
    const m = L.circleMarker([loc.lat_dd, loc.lon_dd], {
      radius: 6.5,
      fillColor: r.color,
      color: "#ffffff",
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.85
    }).addTo(mapa);

    m.bindPopup(`
      <div class="text-slate-900 text-xs font-sans">
        <b class="text-sm">${loc.NOM_LOC}</b> (${loc.NOM_MUN})<br>
        <b>Nivel:</b> <span style="color:${r.color}; font-weight:bold;">${r.label}</span><br>
        <hr class="my-1 border-slate-300"/>
        • <b>Relieve:</b> ${loc.tipo_relieve} (Máx: ${loc.pendiente_maxima_grados}°)<br>
        • <b>Posición Cuenca:</b> ${loc.posicion_hidrologica}<br>
        • <b>Acceso Vial:</b> ${loc.tipo_acceso_vial}<br>
        • <b>Tiempo Concentración:</b> ${loc.tiempo_concentracion_horas}h<br>
        • <b>Dist. Hospital:</b> ${loc.distancia_hospital_km.toFixed(1)} km<br>
        • <b>Población:</b> ${loc.pobtot.toLocaleString()} hab.
      </div>
    `);
    marcadores.push(m);
  });
}

function poblarSelects() {
  const sel = document.getElementById("selectComunidad");
  sel.innerHTML = `<option value="">-- Todas las Comunidades (Diagnóstico Global) --</option>`;
  LOCALIDADES.forEach(l => {
    const opt = document.createElement("option");
    opt.value = l.NOM_LOC;
    opt.textContent = `${l.NOM_LOC} (${l.NOM_MUN}, ${l.NOM_ENT})`;
    sel.appendChild(opt);
  });
}

function calcularKPIs() {
  let deslaves = 0, crecidas = 0, aislamiento = 0, pobTotal = 0, tcTotal = 0;
  LOCALIDADES.forEach(l => {
    if (l.pendiente_maxima_grados >= 35 && (l.tipo_relieve === 'LADERA' || l.tipo_relieve === 'LOMA')) deslaves++;
    if (l.posicion_hidrologica === 'BAJA') crecidas++;
    if (l.tipo_acceso_vial === 'BRECHA' || l.tipo_acceso_vial === 'CAMINO_TERRACERIA') aislamiento++;
    pobTotal += l.pobtot;
    tcTotal += l.tiempo_concentracion_horas;
  });

  document.getElementById("kpiTotal").innerText = LOCALIDADES.length;
  document.getElementById("kpiDeslave").innerText = deslaves;
  document.getElementById("kpiInundacion").innerText = crecidas;
  document.getElementById("kpiAislamiento").innerText = aislamiento;
  document.getElementById("kpiTiempo").innerText = (tcTotal / LOCALIDADES.length).toFixed(1) + " h";
  document.getElementById("kpiPoblacion").innerText = (pobTotal / 1000).toFixed(0) + "k";
}

async function sincronizarClimaEnVivo() {
  const btn = document.getElementById("btnSyncWeather");
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando satélite...`;

  try {
    for (let loc of LOCALIDADES.slice(0, 20)) {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat_dd}&longitude=${loc.lon_dd}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`);
      const data = await res.json();
      if (data.daily) {
        climaEnVivo[loc.NOM_LOC] = {
          rain24h: data.daily.precipitation_sum[0] || 0,
          tMax: data.daily.temperature_2m_max[0] || 0,
          tMin: data.daily.temperature_2m_min[0] || 0
        };
      }
    }
    alert("✅ Clima satelital en tiempo real sincronizado correctamente.");
  } catch (err) {
    alert("Hubo una intermitencia con Open-Meteo. Usando base hidrogeológica.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-cloud-bolt"></i> Sincronizar Clima en Vivo`;
  }
}

async function ejecutarAnalisisIA() {
  const out = document.getElementById("aiOutput");
  const btn = document.getElementById("btnRunAI");
  const nombreLoc = document.getElementById("selectComunidad").value;
  const amenaza = document.getElementById("selectAmenaza").value;
  const loc = LOCALIDADES.find(l => l.NOM_LOC === nombreLoc);

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-gear fa-spin"></i> Procesando con Groq...`;
  out.innerHTML = `<span class="text-cyan-400 animate-pulse">SARA AI calculando variables hidrogeológicas en el servidor...</span>`;

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        localidad: loc || null,
        amenaza: amenaza,
        clima: loc ? climaEnVivo[loc.NOM_LOC] : null
      })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    out.innerHTML = `<div class="text-slate-100 whitespace-pre-wrap font-sans leading-relaxed text-xs">${data.analisis}</div>`;
  } catch (err) {
    out.innerHTML = `<span class="text-red-400">Error: ${err.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-bolt"></i> Calcular Ventana de Acción con IA`;
  }
}