import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";
import FormData from "form-data";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Configurar multer para archivos de audio en memoria
const upload = multer({ storage: multer.memoryStorage() });

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "meta/llama-3.3-70b-instruct";

// =========================
// ENDPOINT: Chat con LLM (NVIDIA)
// =========================
app.post("/chat", async (req, res) => {
  const { userInput, history = [] } = req.body;
  const messages = [
    {
      role: "system",
      content:
        "Eres un asistente de compras para Starbucks. Habla español, breve y amable. " +
        "Confirma tamaño (Short/Grande/Venti), leche (entera/deslact/almendra/avena), " +
        "temperatura (frío/caliente), endulzante (normal/light/sin) y extras. " +
        "Si falta info, haz UNA sola pregunta. Cierra con: RESUMEN: <pedido>."
    },
    ...history,
    { role: "user", content: userInput }
  ];

  try {
    const { data } = await axios.post(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      { model: MODEL, messages, temperature: 0.4 },
      { 
        headers: { 
          Authorization: `Bearer ${NVIDIA_API_KEY}`, 
          "Content-Type": "application/json" 
        } 
      }
    );
    const reply = data?.choices?.[0]?.message?.content?.trim() ?? "(sin respuesta)";
    return res.json({ reply });
  } catch (e) {
    console.error("Error LLM:", e.response?.data || e.message);
    return res.status(500).json({ error: "LLM error" });
  }
});

// =========================
// ENDPOINT: ASR (Audio → Texto) con OpenAI Whisper
// =========================
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió archivo de audio" });
    }

    console.log("📥 Audio recibido:", req.file.originalname, `(${req.file.size} bytes)`);

    // Crear FormData para OpenAI Whisper
    const formData = new FormData();
    formData.append("file", req.file.buffer, {
      filename: "audio.webm",
      contentType: req.file.mimetype
    });
    formData.append("model", "whisper-1");
    formData.append("language", "es"); // Español
    formData.append("response_format", "json");

    console.log("📤 Enviando a OpenAI Whisper...");

    // OpenAI Whisper endpoint
    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          ...formData.getHeaders()
        },
        timeout: 30000
      }
    );

    const transcript = response.data?.text?.trim() || "";
    console.log("✅ Transcripción:", transcript);

    return res.json({ transcript });

  } catch (error) {
    console.error("❌ Error ASR:");
    console.error("  - Status:", error.response?.status);
    console.error("  - Data:", JSON.stringify(error.response?.data, null, 2));
    console.error("  - Message:", error.message);
    
    return res.status(500).json({ 
      error: "Error en transcripción",
      details: error.response?.data?.error?.message || error.message,
      status: error.response?.status
    });
  }
});

// =========================
// ENDPOINT: TTS (Texto → Audio) con NVIDIA Magpie TTS
// =========================
app.post("/speak", async (req, res) => {
  try {
    const { text, voice = "Magpie-Multilingual.ES-US.Luna" } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Falta el texto a sintetizar" });
    }

    console.log("🔊 Generando audio con NVIDIA Magpie TTS...");
    console.log("   Voz:", voice);
    console.log("   Texto:", text.substring(0, 50) + "...");

    // Crear FormData para NVIDIA Magpie TTS
    const formData = new FormData();
    formData.append("text", text);
    formData.append("language", "es-US"); // Español
    formData.append("voice", voice);
    
    // Voces disponibles:
    // Español: Magpie-Multilingual.ES-US.Luna, Magpie-Multilingual.ES-US.Carlos
    // Inglés: Magpie-Multilingual.EN-US.Sofia, Magpie-Multilingual.EN-US.Ray
    // Francés: Magpie-Multilingual.FR-FR.Camille, Magpie-Multilingual.FR-FR.Pascal
    // Alemán: Magpie-Multilingual.DE-DE.Aria, Magpie-Multilingual.DE-DE.Leo

    try {
      // Intentar con NVIDIA Magpie TTS
      const response = await axios.post(
        "https://integrate.api.nvidia.com/v1/audio/speech",
        formData,
        {
          headers: {
            Authorization: `Bearer ${NVIDIA_API_KEY}`,
            ...formData.getHeaders()
          },
          responseType: "arraybuffer",
          timeout: 30000
        }
      );

      console.log("✅ Audio NVIDIA generado");

      // Enviar audio como WAV
      res.set({
        "Content-Type": "audio/wav",
        "Content-Length": response.data.length
      });
      res.send(Buffer.from(response.data));

    } catch (nvidiaError) {
      console.error("❌ Error NVIDIA TTS:", nvidiaError.response?.status, nvidiaError.response?.data);
      
      // Fallback a OpenAI TTS si está disponible
      if (OPENAI_API_KEY) {
        console.log("⚠️ Fallback a OpenAI TTS...");
        
        const openaiResponse = await axios.post(
          "https://api.openai.com/v1/audio/speech",
          {
            model: "tts-1",
            voice: "nova",
            input: text,
            speed: 1.0
          },
          {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            responseType: "arraybuffer"
          }
        );

        console.log("✅ Audio OpenAI generado (fallback)");

        res.set({
          "Content-Type": "audio/mpeg",
          "Content-Length": openaiResponse.data.length
        });
        res.send(Buffer.from(openaiResponse.data));
      } else {
        throw nvidiaError;
      }
    }

  } catch (error) {
    console.error("❌ Error TTS completo:");
    console.error("  - Status:", error.response?.status);
    console.error("  - Message:", error.message);
    
    return res.status(500).json({ 
      error: "Error en síntesis de voz",
      details: error.response?.data || error.message,
      suggestion: "Verifica tu API key de NVIDIA y que Magpie TTS esté disponible"
    });
  }
});

// =========================
// ENDPOINT: Flujo completo ASR → LLM → TTS
// =========================
app.post("/voice-chat", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió archivo de audio" });
    }

    // 1. Transcribir con OpenAI Whisper
    console.log("🎤 Transcribiendo...");
    const formData = new FormData();
    formData.append("file", req.file.buffer, {
      filename: "audio.webm",
      contentType: req.file.mimetype
    });
    formData.append("model", "whisper-1");
    formData.append("language", "es");

    const asrResponse = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          ...formData.getHeaders()
        }
      }
    );

    const userInput = asrResponse.data?.text?.trim() || "";
    console.log("📝 Usuario dijo:", userInput);

    if (!userInput) {
      return res.status(400).json({ error: "No se pudo transcribir el audio" });
    }

    // 2. Obtener respuesta del LLM (NVIDIA)
    console.log("🤖 Generando respuesta...");
    const history = JSON.parse(req.body.history || "[]");
    const messages = [
      {
        role: "system",
        content:
          "Eres un asistente de compras para Starbucks. Habla español, breve y amable. " +
          "Confirma tamaño (Short/Grande/Venti), leche (entera/deslact/almendra/avena), " +
          "temperatura (frío/caliente), endulzante (normal/light/sin) y extras. " +
          "Si falta info, haz UNA sola pregunta. Cierra con: RESUMEN: <pedido>."
      },
      ...history,
      { role: "user", content: userInput }
    ];

    const llmResponse = await axios.post(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      { model: MODEL, messages, temperature: 0.4 },
      { 
        headers: { 
          Authorization: `Bearer ${NVIDIA_API_KEY}`, 
          "Content-Type": "application/json" 
        } 
      }
    );

    const reply = llmResponse.data?.choices?.[0]?.message?.content?.trim() || "";
    console.log("🤖 Asistente responde:", reply);

    if (!reply) {
      return res.status(500).json({ error: "Sin respuesta del LLM" });
    }

    // 3. Convertir respuesta a audio con OpenAI TTS
    console.log("🔊 Sintetizando voz...");
    const ttsResponse = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "tts-1",
        voice: "nova",
        input: reply,
        response_format: "mp3"
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        responseType: "arraybuffer"
      }
    );

    console.log("✅ Flujo completo exitoso");

    // Retornar todo junto
    return res.json({
      transcript: userInput,
      reply,
      audioBase64: Buffer.from(ttsResponse.data).toString("base64")
    });

  } catch (error) {
    console.error("❌ Error en flujo completo:", error.response?.data || error.message);
    return res.status(500).json({ 
      error: "Error en el flujo de voz",
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// =========================
// ENDPOINT: Test de conexión
// =========================
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK",
    nvidia: NVIDIA_API_KEY ? "✓" : "✗ FALTA",
    openai: OPENAI_API_KEY ? "✓" : "✗ FALTA"
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`✅ NVIDIA API: ${NVIDIA_API_KEY ? "Configurada" : "❌ FALTA"}`);
  console.log(`✅ OpenAI API: ${OPENAI_API_KEY ? "Configurada" : "❌ FALTA"}`);
});