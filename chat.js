import axios from "axios";
import dotenv from "dotenv";
import readline from "readline";

dotenv.config();

const API_KEY = process.env.NVIDIA_API_KEY;
const MODEL = "meta/llama-3.3-70b-instruct";

// 🗨️ Guardamos el historial de conversación
const conversation = [
  {
    role: "system",
    content:
      "Eres un asistente de compras para una cafetería. Da recomendaciones personalizadas y amables.",
  },
];

// Configuramos la interfaz de línea de comandos
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 🔁 Función principal para enviar y recibir mensajes
async function chat() {
  rl.question("Tú: ", async (userInput) => {
    if (userInput.toLowerCase() === "salir") {
      console.log("👋 ¡Hasta luego!");
      rl.close();
      return;
    }

    // Añadimos el mensaje del usuario al historial
    conversation.push({ role: "user", content: userInput });

    try {
      const response = await axios.post(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          model: MODEL,
          messages: conversation,
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const assistantMessage = response.data.choices[0].message.content;

      console.log(`Asistente: ${assistantMessage}\n`);

      // Guardamos también la respuesta en el historial
      conversation.push({ role: "assistant", content: assistantMessage });
    } catch (error) {
      console.error(
        "❌ Error:",
        error.response?.status,
        error.response?.data || error.message
      );
    }

    // 🔁 Continuamos el chat
    chat();
  });
}

// Iniciamos el chat
console.log("☕ Bienvenido al asistente de cafetería (escribe 'salir' para terminar)\n");
chat();
