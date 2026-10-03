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

  const { localidad, amenaza, pronostico3Dias } = req.body;

  const promptSistema = `Eres el Director de Emergencias de CÁRITAS PASTORAL SOCIAL (Arquidiócesis de Tulancingo).
Emite un dictamen directo, claro y urgente para los párrocos y brigadistas.
Responde OBLIGATORIAMENTE con esta estructura:

1. 🔴 ¿QUÉ POBLACIÓN ESTÁ EN RIESGO? (Nombre, municipio, habitantes expuestos y estado de vías).
2. ⚠️ ¿QUÉ RIESGO EXACTO TIENE? (Deslave en ladera, desbordamiento de cuenca baja o aislamiento).
3. ⏱️ ¿CUÁNDO VA A PASAR Y HORAS PARA EVACUAR? (Ventana de tiempo según Tiempo de Concentración e impacto de lluvia).
4. 💥 ¿DE QUÉ FUERZA ES EL PELIGRO? (EXTREMO / SEVERO / MODERADO, explicando pendiente y mm de lluvia).
5. 📋 PROTOCOLO INMEDIATO DE 3 PASOS PARA LA BRIGADA PARROQUIAL.`;

  let promptUsuario = `Amenaza analizada: ${amenaza}\n\n`;

  if (localidad) {
    promptUsuario += `DATOS TÉCNICOS:
- Localidad: ${localidad.NOM_LOC} (${localidad.NOM_MUN}, ${localidad.NOM_ENT})
- Habitantes directos: ${localidad.pobtot} | Habitantes aguas arriba: ${localidad.poblacion_total_aguas_arriba}
- Relieve: ${localidad.tipo_relieve} | Pendiente Máxima: ${localidad.pendiente_maxima_grados}°
- Hidrología: Posición ${localidad.posicion_hidrologica} | Distancia al cauce: ${localidad.distancia_al_cauce_principal_km} km
- Tiempo de Concentración (Escape): ${localidad.tiempo_concentracion_horas} horas
- Acceso: ${localidad.tipo_acceso_vial} | Distancia a Hospital: ${localidad.distancia_hospital_km} km
- Pronóstico 3 Días: Hoy: ${pronostico3Dias?.hoy?.lluvia ?? 15}mm | Mañana: ${pronostico3Dias?.manana?.lluvia ?? 35}mm | Pasado: ${pronostico3Dias?.pasado?.lluvia ?? 50}mm`;
  } else {
    promptUsuario += `DIAGNÓSTICO GENERAL: Red de comunidades en Hidalgo, Puebla y Veracruz de la Diócesis de Tulancingo.`;
  }

  // Lista de modelos compatibles de Groq en orden de intento
  const modelosGroq = [
    "llama-3.3-70b-versatile",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "mixtral-8x7b-32768",
    "gemma2-9b-it"
  ];

  let ultimoError = null;

  for (const modelo of modelosGroq) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modelo,
          messages: [
            { role: "system", content: promptSistema },
            { role: "user", content: promptUsuario }
          ],
          temperature: 0.2,
          max_tokens: 850
        })
      });

      const data = await response.json();
      if (!data.error && data.choices && data.choices[0]) {
        return res.status(200).json({ 
          analisis: data.choices[0].message.content,
          modeloUsado: modelo 
        });
      } else {
        ultimoError = data.error?.message || "Error desconocido en el modelo";
      }
    } catch (err) {
      ultimoError = err.message;
    }
  }

  return res.status(500).json({ error: 'No se pudo conectar a los modelos de Groq: ' + ultimoError });
}