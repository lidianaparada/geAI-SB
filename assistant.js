import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.NVIDIA_API_KEY;

async function getAssistantResponse(userInput) {
  try {
    const response = await axios.post(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        model: "meta/llama-3.3-70b-instruct",
        messages: [
          {
            role: "system",
            content:
              "Eres un asistente de compras para una cafetería. Da recomendaciones personalizadas y amables.",
          },
          { role: "user", content: userInput },
        ],
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("💬 Respuesta del asistente:");
    console.log(response.data.choices[0].message.content);
  } catch (error) {
    console.error("❌ Error:", error.response?.status, error.response?.data || error.message);
  }
}

async function main() {
  const userInput = "Quiero una bebida dulce para el desayuno";
  await getAssistantResponse(userInput);
}

main();
