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

  const { localidad, amenaza, clima } = req.body;

  const promptSistema = `Eres el Comandante Táctico de Protección Civil y Gestión de Riesgos de la ONG SARA.
Tu objetivo es emitir un reporte conciso, directo, urgente y operativo en español para los coordinadores de campo.
Debes responder obligatoriamente con esta estructura:

1. ⚠️ DIAGNÓSTICO DEL RIESGO REAL (Evalúa según las pendientes, tipo de relieve y posición hidrológica).
2. ⏱️ VENTANA DE TIEMPO DE ACCIÓN (Horas disponibles antes del impacto crítico según el tiempo de concentración hidrológico).
3. 🚧 RIESGO DE AISLAMIENTO Y RUTAS (Considerando tipo de acceso vial y distancia al hospital).
4. 📋 PROTOCOLO INMEDIATO DE 3 PASOS PARA EL PERSONAL EN CAMPO.`;

  let promptUsuario = `Amenaza evaluada: ${amenaza}\n\n`;

  if (localidad) {
    promptUsuario += `DATOS DE CAMPO DE LA LOCALIDAD:
- Nombre: ${localidad.NOM_LOC} (${localidad.NOM_MUN}, ${localidad.NOM_ENT})
- Población: ${localidad.pobtot} hab. (Población aguas arriba: ${localidad.poblacion_total_aguas_arriba})
- Relieve: ${localidad.tipo_relieve} | Pendiente Media: ${localidad.pendiente_promedio_grados}° | Pendiente Máxima: ${localidad.pendiente_maxima_grados}°
- Hidrología: Posición ${localidad.posicion_hidrologica} | Distancia al cauce: ${localidad.distancia_al_cauce_principal_km} km
- Tiempo de Concentración (Tc): ${localidad.tiempo_concentracion_horas} horas
- Vialidad: ${localidad.tipo_acceso_vial} | Distancia al Hospital: ${localidad.distancia_hospital_km} km
- Pronóstico 24h: Lluvia: ${clima?.rain24h ?? 'N/D'} mm | Temp: ${clima?.tMin ?? 'N/D'}°C a ${clima?.tMax ?? 'N/D'}°C`;
  } else {
    promptUsuario += `ANÁLISIS GLOBAL: Evalúa la red completa de sedes de la ONG en Hidalgo, Puebla y Veracruz ante la alerta meteorológica actual.`;
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
        max_tokens: 850
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