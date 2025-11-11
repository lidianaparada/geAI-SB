import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.NVIDIA_API_KEY;
const MODEL = "meta/llama-3.3-70b-instruct";

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
      { headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" } }
    );
    const reply = data?.choices?.[0]?.message?.content?.trim() ?? "(sin respuesta)";
    return res.json({ reply });
  } catch (e) {
    console.error(e.response?.data || e.message);
    return res.status(500).json({ error: "LLM error" });
  }
});

app.listen(3000, () => console.log("LLM proxy en http://localhost:3000"));