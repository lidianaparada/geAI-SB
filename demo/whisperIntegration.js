import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar cliente de OpenAI
dotenv.config();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * OPCIÓN 1: Transcribir audio desde un ARCHIVO
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
async function transcribirArchivo(rutaArchivo) {
  try {
    console.log(`🎤 Transcribiendo archivo: ${rutaArchivo}`);
    
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(rutaArchivo),
      model: 'whisper-1',
      language: 'es',  // Español (mejora precisión si sabes el idioma)
      response_format: 'json',  // Opciones: json, text, srt, verbose_json, vtt
    });
    
    console.log(' *_* Transcripción *_*', transcription.text);
    return transcription.text;
    
  } catch (error) {
    console.error('  Error:', error.message);
    throw error;
  }
}

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * OPCIÓN 2: Transcribir audio desde un BUFFER (para streaming)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
async function transcribirBuffer(audioBuffer, nombreArchivo = 'audio.webm') {
  try {
    console.log(`🎤 Transcribiendo buffer de ${audioBuffer.length} bytes`);
    
    // Crear un File-like object desde el buffer
    const file = new File([audioBuffer], nombreArchivo, { 
      type: 'audio/webm' 
    });
    
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'es',
    });
    
    console.log('  Transcripción:', transcription.text);
    return transcription.text;
    
  } catch (error) {
    console.error('  Error:', error.message);
    throw error;
  }
}

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * OPCIÓN 3: Transcripción con timestamps (verbose)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
async function transcribirConTimestamps(rutaArchivo) {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(rutaArchivo),
      model: 'whisper-1',
      language: 'es',
      response_format: 'verbose_json',  // Incluye timestamps
      timestamp_granularities: ['word', 'segment'],
      prompt: 'Starbucks, Latte, Cappuccino, Venti, Grande, Caffi', 
    });
    
    console.log('📝 Texto completo:', transcription.text);
    console.log('⏱️ Segmentos:', transcription.segments);
    console.log('📍 Palabras:', transcription.words);
    
    return transcription;
    
  } catch (error) {
    console.error('  Error:', error.message);
    throw error;
  }
}

async function prueba() {
  console.log(' Prueba de Whisper\n');
  
  // Verificar API key
  if (!process.env.OPENAI_API_KEY) {
    console.error(' Falta OPENAI_API_KEY en las variables de entorno');
    return;
  }
  
  // Si tienes un archivo de audio de prueba:
  const archivoTest = './demo/test_audio.mp3';
  
  if (fs.existsSync(archivoTest)) {
    await transcribirArchivo(archivoTest);
  } else {
    console.log('ℹ️ Para probar, crea un archivo test_audio.mp3 con tu voz');
    console.log('   O usa el endpoint /transcribe con audio del navegador');
  }
}

// Ejecutar prueba si se corre directamente
prueba();

export { 
  transcribirArchivo, 
  transcribirBuffer, 
  transcribirConTimestamps
};