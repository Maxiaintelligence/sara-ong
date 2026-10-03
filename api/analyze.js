export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'La variable GROQ_API_KEY no está configurada en las variables de entorno de Vercel.' 
    });
  }

  const { localidad, amenaza, clima, pronostico3Dias } = req.body;

  const promptSistema = `Eres el Director Operativo de Protección Civil y Gestión de Emergencias de CÁRITAS PASTORAL SOCIAL (Arquidiócesis de Tulancingo).
Tu misión es emitir dictámenes claros, directos, sin rodeos y altamente comprensibles para los párrocos, brigadistas y coordinadores comunitarios.

Debes responder OBLIGATORIAMENTE respondiendo estas 4 preguntas exactas:

1. 🔴 ¿QUÉ POBLACIÓN ESTÁ EN RIESGO Y SU VULNERABILIDAD?
   (Detalla la comunidad, habitantes en riesgo, acceso vial y si quedará incomunicada).

2. ⚠️ ¿QUÉ RIESGO EXACTO TIENE?
   (Explica si es deslave por ladera empinada, desbordamiento de río por posición baja en la cuenca, corte de caminos o choque térmico).

3. ⏱️ ¿CUÁNDO VA A PASAR Y CUÁNTAS HORAS TIENEN PARA EVACUAR?
   (Calcula la ventana de tiempo basándote en el Tiempo de Concentración Hidrológico y el pronóstico de Hoy, Mañana y Pasado Mañana).

4. 💥 ¿DE QUÉ FUERZA ES EL PELIGRO?
   (Nivel: EXTREMO / SEVERO / MODERADO, sustentado en la pendiente máxima, lluvia acumulada en mm y distancia al hospital más cercano).

5. 📋 PROTOCOLO INMEDIATO DE 3 PASOS PARA LA BRIGADA PARROQUIAL DE CÁRITAS.`;

  let promptUsuario = `Amenaza analizada: ${amenaza}\n\n`;

  if (localidad) {
    promptUsuario += `DATOS TÉCNICOS Y GEOMORFOLÓGICOS:
- Localidad: ${localidad.NOM_LOC}, Municipio: ${localidad.NOM_MUN}, Estado: ${localidad.NOM_ENT}
- Población en riesgo directo: ${localidad.pobtot} habitantes
- Población acumulada aguas arriba: ${localidad.poblacion_total_aguas_arriba} habitantes
- Topografía: ${localidad.tipo_relieve} con Pendiente Máxima de ${localidad.pendiente_maxima_grados}°
- Hidrología: Posición ${localidad.posicion_hidrologica} en cuenca | Distancia al cauce: ${localidad.distancia_al_cauce_principal_km} km
- Ventana de llegada de crecida (Tiempo de Concentración): ${localidad.tiempo_concentracion_horas} horas
- Vulnerabilidad de Acceso: Camino tipo ${localidad.tipo_acceso_vial} | Distancia al hospital: ${localidad.distancia_hospital_km} km
- PRONÓSTICO METEOROLÓGICO 3 DÍAS:
  * HOY: Lluvia: ${pronostico3Dias?.hoy?.lluvia ?? clima?.rain24h ?? 0} mm | Temp: ${pronostico3Dias?.hoy?.tMin ?? '--'}° a ${pronostico3Dias?.hoy?.tMax ?? '--'}°C
  * MAÑANA: Lluvia: ${pronostico3Dias?.manana?.lluvia ?? 0} mm | Temp: ${pronostico3Dias?.manana?.tMin ?? '--'}° a ${pronostico3Dias?.manana?.tMax ?? '--'}°C
  * PASADO MAÑANA: Lluvia: ${pronostico3Dias?.pasado?.lluvia ?? 0} mm | Temp: ${pronostico3Dias?.pasado?.tMin ?? '--'}° a ${pronostico3Dias?.pasado?.tMax ?? '--'}°C`;
  } else {
    promptUsuario += `DIAGNÓSTICO GENERAL: Evalúa la red completa de las 106 comunidades atendidas por la Diócesis de Tulancingo en Hidalgo, Sierra Norte de Puebla y Sierra de Huayacocotla Veracruz.`;
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: promptSistema },
          { role: "user", content: promptUsuario }
        ],
        temperature: 0.2,
        max_tokens: 950
      })
    });

    const data = await response.json();
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    return res.status(200).json({ 
      analisis: data.choices[0].message.content 
    });

  } catch (error) {
    return res.status(500).json({ error: 'Error al contactar a Groq Cloud: ' + error.message });
  }
}