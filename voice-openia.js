import fs from "fs";
import axios from "axios";
import OpenAI from "openai";
import dotenv from "dotenv";
import player from "play-sound";
import record from "node-record-lpcm16";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const play = player({});

async function recordAudio(durationSec = 5, filePath = "./input.wav") {
  console.log(`🎙️ Grabando durante ${durationSec} segundos...`);
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath, { encoding: "binary" });
    const recorder = record.record({
        sampleRate: 16000,
        verbose: false,
        recordProgram: "rec", // usa 'sox' o 'rec' en macOS/Linux, 'sox' en Windows
      });
      
      recorder.stream().on("error", reject).pipe(file);
      
      setTimeout(() => {
        recorder.stop();
        console.log("✅ Grabación finalizada");
        resolve(filePath);
      }, durationSec * 1000);
  });
}

async function speechToText(filePath) {
  console.log("🧠 Transcribiendo audio con Whisper...");
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1",
  });
  console.log("🗣️ Usuario dijo:", transcription.text);
  return transcription.text;
}

async function getAssistantReply(text) {
  console.log("🤖 Consultando NVIDIA Llama 3.3...");
  const res = await axios.post(
    "https://integrate.api.nvidia.com/v1/chat/completions",
    {
      model: "meta/llama-3.3-70b-instruct",
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente de pedidos para una cafetería. Responde amablemente y da sugerencias personalizadas.",
        },
        { role: "user", content: text },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const reply = res.data.choices[0].message.content;
  console.log("💬 Asistente:", reply);
  return reply;
}

async function textToSpeech(text) {
  console.log("🎧 Generando respuesta en voz...");
  const mp3 = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    input: text,
  });

  const file = "./response.mp3";
  fs.writeFileSync(file, Buffer.from(await mp3.arrayBuffer()));
  play.play(file);
}

async function main() {
  try {
    const audioFile = await recordAudio(5); // graba 5 segundos
    const userText = await speechToText(audioFile);
    const reply = await getAssistantReply(userText);
    await textToSpeech(reply);
  } catch (err) {
    console.error("❌ Error en el flujo completo:", err);
  }
}

main();
