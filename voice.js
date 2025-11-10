// app-voice-chat-starbucks.js
// Demo Node.js: Voz -> ASR -> LLM -> TTS (Starbucks)
// Requisitos: npm i axios dotenv mic play-sound form-data wav
import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";
import mic from "mic";
import player from "play-sound";
import FormData from "form-data";
import wav from "wav";

dotenv.config();

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

// --- Config endpoints ---
const LLM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"; // fijo (NIM)
const ASR_URL = process.env.ASR_URL; // p.ej. un endpoint HTTP de Riva/Whisper en NVCF
const TTS_URL = process.env.TTS_URL; // opcional: endpoint HTTP de Riva TTS NIM

// --- Modelo LLM ---
const LLM_MODEL = "meta/llama-3.3-70b-instruct"; // NIM

// --- Conversación con contexto de Starbucks ---
const conversation = [
  {
    role: "system",
    content:
      "Eres un asistente de compras para Starbucks. Hablas español, eres breve y amable. " +
      "Siempre confirmas tamaño (Short/Grande/Venti), tipo de leche (entera/deslact./almendra/avena), " +
      "temperatura (frío/caliente), endulzante (normal/light/sin), y extras (shot extra, canela, jarabes). " +
      "Si el usuario no dice algo, pregunta con 1 sola pregunta inteligente. " +
      "Da 1 recomendación personalizada si aplica. Al final, devuelve un RESUMEN en una sola línea."
  },
];

// ---------- Grabación de audio (WAV mono 16k) ----------
function recordAudio(outFile = "input.wav", durationMs = 6000) {
  return new Promise((resolve, reject) => {
    const micInstance = mic({
      rate: "16000",
      channels: "1",
      debug: false,
      fileType: "wav",
      // en Windows, si hay problemas, probar con "sox" instalado o cambiar dispositivo
    });

    const micInputStream = micInstance.getAudioStream();
    const outputFile = fs.createWriteStream(outFile);

    micInputStream.on("error", reject);
    micInputStream.pipe(outputFile);

    micInstance.start();
    console.log(`🎤 Grabando ${durationMs / 1000}s...`);

    setTimeout(() => {
      micInstance.stop();
      console.log("⏹️ Grabación finalizada:", outFile);
      resolve(outFile);
    }, durationMs);
  });
}

// ---------- Verificación/normalización WAV 16k mono ----------
async function ensureWavMono16k(filePath) {
  // Si grabas con mic({rate:16000, channels:1, fileType:'wav'}) normalmente ya está bien.
  // Aquí solo validamos encabezado.
  return new Promise((resolve, reject) => {
    const reader = new wav.Reader();
    fs.createReadStream(filePath)
      .pipe(reader)
      .on("format", (fmt) => {
        if (fmt.audioFormat !== 1 || fmt.sampleRate !== 16000 || fmt.channels !== 1) {
          console.warn("⚠️ El WAV no es PCM 16k mono. Ajusta la config de 'mic'.");
        }
      })
      .on("end", () => resolve(filePath))
      .on("error", reject);
  });
}

// ---------- ASR (WAV -> texto) ----------
async function speechToText(wavPath) {
  if (!ASR_URL) throw new Error("Falta ASR_URL en .env (endpoint de Riva/Whisper)");
  const fd = new FormData();
  fd.append("file", fs.createReadStream(wavPath), { filename: "audio.wav", contentType: "audio/wav" });
  // Algunas implementaciones aceptan params extra, p.ej. language="es", enable_punctuation=true, etc.
  // fd.append("language", "es");

  const response = await axios.post(ASR_URL, fd, {
    headers: {
      ...fd.getHeaders(),
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
    },
    timeout: 60000,
  });

  // Normaliza posible respuesta
  const txt =
    response.data?.text ||
    response.data?.transcript ||
    response.data?.result?.text ||
    JSON.stringify(response.data);
  console.log("🗣️ Texto reconocido:", txt);
  return txt;
}

// ---------- LLM (texto -> respuesta) ----------
async function getAssistantResponse(userInput) {
  conversation.push({ role: "user", content: userInput });

  const body = {
    model: LLM_MODEL,
    messages: conversation,
    temperature: 0.4,
  };

  const { data } = await axios.post(LLM_URL, body, {
    headers: {
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: 60000,
  });

  const reply = data?.choices?.[0]?.message?.content?.trim() ?? "(sin respuesta)";
  conversation.push({ role: "assistant", content: reply });
  console.log("🤖 Asistente:\n", reply, "\n");
  return reply;
}

// ---------- TTS (texto -> WAV) ----------
async function textToSpeech(text, outFile = "reply.wav") {
  if (!TTS_URL) {
    console.log("🔇 TTS desactivado (sin TTS_URL).");
    return null;
  }
  const resp = await axios.post(
    TTS_URL,
    { text, language: "es-ES" }, // ajusta según tu Riva TTS (magpie, voz, etc.)
    {
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      responseType: "arraybuffer",
      timeout: 60000,
    }
  );
  fs.writeFileSync(outFile, resp.data);
  console.log("🎧 Audio TTS generado:", outFile);
  return outFile;
}

function playAudio(file) {
  if (!file) return Promise.resolve();
  return new Promise((resolve, reject) => {
    player().play(file, (err) => (err ? reject(err) : resolve()));
  });
}

// ---------- Flujo completo ----------
async function main() {
  try {
    const audioFile = await recordAudio("input.wav", 6000);
    await ensureWavMono16k(audioFile);

    const userText = await speechToText(audioFile);
    const assistantText = await getAssistantResponse(userText);

    const ttsFile = await textToSpeech(assistantText, "reply.wav");
    await playAudio(ttsFile);
  } catch (err) {
    console.error("❌ Error en flujo completo:", err?.response?.data || err.message);
  }
}

main();