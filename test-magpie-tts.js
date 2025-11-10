import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

console.log("\n🧪 ===== TEST NVIDIA MAGPIE TTS =====\n");

if (!NVIDIA_API_KEY) {
  console.error("❌ Falta NVIDIA_API_KEY en .env");
  process.exit(1);
}

console.log("✅ API Key encontrada:", NVIDIA_API_KEY.substring(0, 10) + "...\n");

// Lista de endpoints posibles para probar
const ENDPOINTS = [
  {
    name: "NVIDIA Audio Speech (estándar)",
    url: "https://integrate.api.nvidia.com/v1/audio/speech",
    method: "json"
  },
  {
    name: "NVIDIA Audio Speech (FormData)",
    url: "https://integrate.api.nvidia.com/v1/audio/speech",
    method: "formdata"
  },
  {
    name: "NVIDIA TTS Generate",
    url: "https://integrate.api.nvidia.com/v1/tts/generate",
    method: "json"
  },
  {
    name: "NVIDIA Magpie Direct",
    url: "https://integrate.api.nvidia.com/v1/magpie/tts",
    method: "json"
  }
];

const TEST_TEXT = "Hola, bienvenido a Starbucks. ¿Qué te gustaría ordenar hoy?";
const VOICES = [
  "Magpie-Multilingual.ES-US.Luna",
  "Luna",
  "es-US-Luna",
  "spanish-female"
];

async function testEndpoint(endpoint, voice) {
  console.log(`\n🔍 Probando: ${endpoint.name}`);
  console.log(`   URL: ${endpoint.url}`);
  console.log(`   Voz: ${voice}`);
  
  try {
    let response;
    
    if (endpoint.method === "json") {
      // Método 1: JSON body
      response = await axios.post(
        endpoint.url,
        {
          text: TEST_TEXT,
          voice: voice,
          language: "es-US",
          model: "magpie-multilingual-tts"
        },
        {
          headers: {
            Authorization: `Bearer ${NVIDIA_API_KEY}`,
            "Content-Type": "application/json"
          },
          responseType: "arraybuffer",
          timeout: 15000,
          validateStatus: () => true // No lanzar error en 4xx/5xx
        }
      );
    } else {
      // Método 2: FormData
      const formData = new FormData();
      formData.append("text", TEST_TEXT);
      formData.append("voice", voice);
      formData.append("language", "es-US");
      
      response = await axios.post(
        endpoint.url,
        formData,
        {
          headers: {
            Authorization: `Bearer ${NVIDIA_API_KEY}`,
            ...formData.getHeaders()
          },
          responseType: "arraybuffer",
          timeout: 15000,
          validateStatus: () => true
        }
      );
    }
    
    console.log(`   Status: ${response.status}`);
    
    if (response.status === 200) {
      const filename = `test_audio_${Date.now()}.wav`;
      fs.writeFileSync(filename, Buffer.from(response.data));
      console.log(`   ✅ ¡ÉXITO! Audio guardado en: ${filename}`);
      console.log(`   Tamaño: ${response.data.length} bytes`);
      console.log(`   Content-Type: ${response.headers['content-type']}`);
      return true;
    } else if (response.status === 404) {
      console.log(`   ❌ Endpoint no encontrado (404)`);
      const text = Buffer.from(response.data).toString();
      console.log(`   Respuesta: ${text.substring(0, 100)}`);
    } else if (response.status === 401 || response.status === 403) {
      console.log(`   ❌ Error de autenticación (${response.status})`);
      console.log(`   Verifica tu API key`);
    } else {
      console.log(`   ❌ Error ${response.status}`);
      try {
        const text = Buffer.from(response.data).toString();
        console.log(`   Respuesta: ${text.substring(0, 200)}`);
      } catch (e) {
        console.log(`   No se pudo leer la respuesta`);
      }
    }
    
    return false;
    
  } catch (error) {
    if (error.code === "ECONNABORTED") {
      console.log(`   ⏱️ Timeout - El servidor no respondió a tiempo`);
    } else if (error.code === "ENOTFOUND") {
      console.log(`   🌐 No se pudo resolver el dominio`);
    } else {
      console.log(`   ❌ Error: ${error.message}`);
    }
    return false;
  }
}

async function testNVIDIACatalog() {
  console.log("\n📚 Consultando catálogo de modelos NVIDIA...\n");
  
  try {
    const response = await axios.get(
      "https://integrate.api.nvidia.com/v1/models",
      {
        headers: {
          Authorization: `Bearer ${NVIDIA_API_KEY}`
        },
        timeout: 10000
      }
    );
    
    console.log("✅ Modelos disponibles:");
    
    const ttsModels = response.data.data?.filter(m => 
      m.id.toLowerCase().includes('tts') || 
      m.id.toLowerCase().includes('speech') ||
      m.id.toLowerCase().includes('magpie')
    );
    
    if (ttsModels && ttsModels.length > 0) {
      ttsModels.forEach(model => {
        console.log(`   - ${model.id}`);
        if (model.description) {
          console.log(`     ${model.description}`);
        }
      });
    } else {
      console.log("   ℹ️ No se encontraron modelos TTS/Speech en el catálogo");
      console.log("   Total de modelos disponibles:", response.data.data?.length || 0);
    }
    
  } catch (error) {
    console.log("❌ No se pudo obtener el catálogo:", error.message);
  }
}

async function main() {
  // Primero consultar el catálogo
  await testNVIDIACatalog();
  
  console.log("\n" + "=".repeat(60));
  console.log("🎤 INICIANDO PRUEBAS DE ENDPOINTS TTS");
  console.log("=".repeat(60));
  
  let success = false;
  
  // Probar cada combinación de endpoint y voz
  for (const endpoint of ENDPOINTS) {
    for (const voice of VOICES) {
      const result = await testEndpoint(endpoint, voice);
      if (result) {
        success = true;
        console.log("\n🎉 ¡ENCONTRAMOS UN ENDPOINT QUE FUNCIONA!");
        console.log(`   Usa: ${endpoint.url}`);
        console.log(`   Voz: ${voice}`);
        console.log(`   Método: ${endpoint.method}`);
        break;
      }
      
      // Pequeña pausa entre pruebas
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (success) break;
  }
  
  if (!success) {
    console.log("\n\n❌ NINGÚN ENDPOINT FUNCIONÓ");
    console.log("\n💡 RECOMENDACIÓN:");
    console.log("   NVIDIA Magpie TTS no está disponible públicamente en Build API aún.");
    console.log("   \n   Alternativas:");
    console.log("   1. Usar OpenAI TTS (requiere créditos, ~$0.015/1000 chars)");
    console.log("   2. Usar Web Speech API del navegador (gratis, buena calidad)");
    console.log("   3. Usar ElevenLabs (10,000 chars/mes gratis)");
    console.log("   4. Usar Google Cloud TTS (4M chars/mes gratis)");
    console.log("\n   La versión híbrida que te di usa Web Speech API (opción 2)");
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("🏁 TEST FINALIZADO");
  console.log("=".repeat(60) + "\n");
}

main().catch(err => {
  console.error("\n💥 Error fatal:", err.message);
  process.exit(1);
});