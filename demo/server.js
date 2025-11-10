import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import * as menuUtils from "./menuUtils.js";
import * as priceCalc from "./priceCalculator.js";
import * as orderValidation from "./orderValidation.js";
import * as promptGen from "./promptGenerator.js";
import * as sizeDetection from "./sizeDetection.js";
import * as recommendationEngine from "./recommendationEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "meta/llama-3.3-70b-instruct";

const SUCURSALES = [
  { id: 1, nombre: "Starbucks Reforma 222", direccion: "Av. Reforma 222, CDMX" },
  { id: 2, nombre: "Starbucks Insurgentes Sur", direccion: "Av. Insurgentes Sur 1431, CDMX" },
  { id: 3, nombre: "Starbucks Condesa", direccion: "Av. Tamaulipas 123, CDMX" },
];

const responseCache = new Map();
const sessionContext = new Map();
const MAX_CACHE_SIZE = 50;

let MENU = {};

function loadMenu() {
  try {
    const menuPath = path.join(__dirname, "menu_simplificado_CORRECTO.json");
    const menuData = fs.readFileSync(menuPath, "utf-8");
    MENU = JSON.parse(menuData);
    console.log("✅ Menú cargado correctamente");
  } catch (error) {
    console.error("❌ Error cargando menú:", error.message);
    process.exit(1);
  }
}

loadMenu();

// ✅ FUNCIÓN CRÍTICA: getCurrentStep con validación de bebida completa y paso de revisión
function getCurrentStep(order) {
  console.log(`\n📋 getCurrentStep() - Estado actual:`);
  console.log(`   sucursal: ${order.sucursal || 'falta'}`);
  console.log(`   bebida: ${order.bebida || 'falta'}`);
  console.log(`   tamano: ${order.tamano || 'falta'}`);
  console.log(`   modificadores: ${JSON.stringify(order.modificadores || [])}`);
  console.log(`   metodoPago: ${order.metodoPago || 'falta'}`);
  console.log(`   revisado: ${order.revisado || 'falta'}`);
  
  if (!order.sucursal) {
    console.log(`   → Retorna: sucursal`);
    return "sucursal";
  }
  if (!order.bebida) {
    console.log(`   → Retorna: bebida`);
    return "bebida";
  }

  const producto = menuUtils.findProductByName(MENU, order.bebida);
  if (producto && sizeDetection.requiresSize(producto) && !order.tamano) {
    console.log(`   → Retorna: tamano`);
    return "tamano";
  }

  if (producto) {
    const requiredMods = menuUtils.getRequiredModifiers(producto);
    console.log(`   Modificadores requeridos: ${requiredMods.map(m => `${m.id}(${m.nombre})`).join(", ")}`);
    
    for (const mod of requiredMods) {
      const hasModifier = order.modificadores?.some(m => m.grupoId === mod.id);
      console.log(`     - ${mod.id}: ${hasModifier ? '✓ existe' : '✗ FALTA'}`);
      
      if (!hasModifier) {
        console.log(`   → Retorna: modifier_${mod.id}`);
        return `modifier_${mod.id}`;
      }
    }
  }

  if (order.alimento === undefined) {
    console.log(`   → Retorna: alimento`);
    return "alimento";
  }
  
  // ✅ NUEVO: Verificar que bebida esté completa antes de pedir pago
  if (!order.metodoPago) {
    const bebidaCompleta = isBebidaCompleta(order, MENU);
    if (!bebidaCompleta) {
      console.log(`   ⚠️ Bebida no completa, no preguntar pago aún`);
      // Retornar al paso que falta
      if (producto && sizeDetection.requiresSize(producto) && !order.tamano) {
        return "tamano";
      }
      const requiredMods = menuUtils.getRequiredModifiers(producto);
      for (const mod of requiredMods) {
        if (!order.modificadores?.some(m => m.grupoId === mod.id)) {
          return `modifier_${mod.id}`;
        }
      }
    }
    console.log(`   → Retorna: metodoPago`);
    return "metodoPago";
  }
  
  // ✅ NUEVO: Paso de revisión después de pago
  if (!order.revisado) {
    console.log(`   → Retorna: revision`);
    return "revision";
  }
  
  if (!order.confirmado) {
    console.log(`   → Retorna: confirmacion`);
    return "confirmacion";
  }
  
  console.log(`   → Retorna: finalizar`);
  return "finalizar";
}

// ✅ FUNCIÓN NUEVA: Fuzzy matching para modificadores
function findBestMatchingOption(userInput, opciones) {
  const inputLower = userInput.toLowerCase();
  const inputNormalizado = inputLower
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "");
  
  const palabrasClave = {
    'espresso': ['espresso', 'expreso', 'expres', 'expresso', 'esprreso'],
    'anniversary': ['anniversary', 'aniversario', 'anniversario', 'aniversary', 'blend'],
    'entera': ['entera', 'completa', 'normal', 'whole'],
    'light': ['light', 'ligera', 'baja grasa', 'descremada', 'semidescremada'],
    'coco': ['coco', 'coconut'],
    'sin leche': ['sin leche', 'sin', 'no leche', 'ninguna', 'black', 'negro'],
    'soya': ['soya', 'soy', 'soja'],
    'almendra': ['almendra', 'almond'],
    'deslactosada': ['deslactosada', 'lactose free', 'sin lactosa']
  };
  
  // 1. Coincidencia directa
  for (const opcion of opciones) {
    const opcionLower = opcion.nombre.toLowerCase();
    if (inputLower.includes(opcionLower) || opcionLower.includes(inputLower)) {
      console.log(`         ✓ MATCH DIRECTO: "${opcion.nombre}"`);
      return opcion;
    }
  }
  
  // 2. Coincidencia normalizada
  for (const opcion of opciones) {
    const opcionNormalizada = opcion.nombre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, "");
    
    if (inputNormalizado.includes(opcionNormalizada) || opcionNormalizada.includes(inputNormalizado)) {
      console.log(`         ✓ MATCH NORMALIZADO: "${opcion.nombre}"`);
      return opcion;
    }
  }
  
  // 3. Coincidencia por palabras clave
  for (const opcion of opciones) {
    const opcionNormalizada = opcion.nombre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, "");
    
    for (const [clave, variantes] of Object.entries(palabrasClave)) {
      if (opcionNormalizada.includes(clave)) {
        for (const variante of variantes) {
          if (inputNormalizado.includes(variante)) {
            console.log(`         ✓ MATCH KEYWORD: "${opcion.nombre}" vía "${variante}"`);
            return opcion;
          }
        }
      }
    }
  }
  
  // 4. Coincidencia parcial
  const inputWords = inputNormalizado.split(/\s+/);
  for (const opcion of opciones) {
    const opcionWords = opcion.nombre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/\s+/);
    
    for (const word of inputWords) {
      if (word.length >= 4) {
        for (const opcionWord of opcionWords) {
          if (opcionWord.includes(word) || word.includes(opcionWord)) {
            console.log(`         ✓ MATCH PARCIAL: "${opcion.nombre}" vía "${word}"`);
            return opcion;
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * ✅ Detectar si el usuario quiere hacer un nuevo pedido o modificar
 */
function detectOrderIntent(userInput) {
  const lower = userInput.toLowerCase();
  const normalizado = lower
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  
  // Palabras clave para nuevo pedido
  const nuevoPedidoKeywords = [
    'nuevo pedido', 'otra orden', 'otro pedido', 'quiero pedir',
    'quiero ordenar', 'hacer otro pedido', 'nuevo', 'otra vez'
  ];
  
  // Palabras clave para modificar
  const modificarKeywords = [
    'agrega', 'agregar', 'añade', 'añadir', 'pon', 'incluye',
    'quiero agregar', 'también quiero', 'y también'
  ];
  
  // Palabras clave para quitar
  const quitarKeywords = [
    'quita', 'quitar', 'elimina', 'eliminar', 'sin', 'mejor no',
    'cancela', 'ya no quiero'
  ];
  
  for (const keyword of nuevoPedidoKeywords) {
    if (normalizado.includes(keyword)) {
      return { tipo: 'nuevo', confidence: 'high' };
    }
  }
  
  for (const keyword of modificarKeywords) {
    if (normalizado.includes(keyword)) {
      return { tipo: 'modificar', accion: 'agregar', confidence: 'high' };
    }
  }
  
  for (const keyword of quitarKeywords) {
    if (normalizado.includes(keyword)) {
      return { tipo: 'modificar', accion: 'quitar', confidence: 'high' };
    }
  }
  
  // Detectar mención de productos (posible nuevo pedido)
  const productKeywords = [
    'latte', 'cappuccino', 'americano', 'espresso', 'mocha',
    'frappuccino', 'té', 'cafe', 'café',
    'muffin', 'croissant', 'brownie', 'sandwich', 'bagel'
  ];
  
  for (const product of productKeywords) {
    if (normalizado.includes(product)) {
      return { tipo: 'posible_nuevo', producto: product, confidence: 'medium' };
    }
  }
  
  return { tipo: 'ninguno', confidence: 'none' };
}

// ✅ FUNCIÓN: updateOrderFromInput
function updateOrderFromInput(session, userInput) {
  const order = session.currentOrder;
  const lower = userInput.toLowerCase();
  const proximoPaso = getCurrentStep(order);

  console.log(`\n✏️  updateOrderFromInput()`);
  console.log(`   Paso actual: ${proximoPaso}`);
  console.log(`   Input del usuario: "${userInput}"`);

  switch (proximoPaso) {
    case "sucursal":
      const sucursal = SUCURSALES.find(s =>
        lower.includes(s.nombre.toLowerCase()) ||
        (lower.includes("reforma") && s.nombre.includes("Reforma")) ||
        (lower.includes("insurgentes") && s.nombre.includes("Insurgentes")) ||
        (lower.includes("condesa") && s.nombre.includes("Condesa"))
      );
      if (sucursal) {
        order.sucursal = sucursal.nombre;
        console.log(`   ✅ Guardado: sucursal = ${sucursal.nombre}`);
      }
      break;

    case "bebida":
      const producto = menuUtils.findProductByName(MENU, userInput);
      if (producto) {
        order.bebida = producto.nombre;
        order.bebida_id = producto.id;
        console.log(`   ✅ Guardado: bebida = ${producto.nombre}`);
      }
      break;

    case "tamano":
      const productoActual = menuUtils.findProductByName(MENU, order.bebida);
      if (productoActual) {
        const detectedSizeId = sizeDetection.detectSizeFromInput(userInput, productoActual);
        if (detectedSizeId) {
          order.tamano = detectedSizeId;
          const sizeName = sizeDetection.getSizeName(productoActual, detectedSizeId);
          console.log(`   ✅ Guardado: tamano = ${sizeName}`);
        }
      }
      break;

    case "alimento":
      // Primero verificar si el usuario NO quiere alimento
      if (lower.includes("no") || lower.includes("sin") || lower.includes("ninguno") || lower.includes("nada")) {
        order.alimento = "ninguno";
        console.log(`   ✅ Guardado: alimento = ninguno`);
      } else {
        // ✅ NUEVA LÓGICA: Fuzzy matching para alimentos comunes
        let alimentoDetectado = null;
        
        // Diccionario de alimentos con variaciones
        const alimentosComunes = {
          'croissant': ['croissant', 'cruasan', 'croissan', 'croasan'],
          'muffin': ['muffin', 'mofin', 'mufin', 'magdalena'],
          'brownie': ['brownie', 'brauni', 'browni'],
          'sandwich': ['sandwich', 'sanwich', 'sándwich', 'emparedado'],
          'bagel': ['bagel', 'baguel', 'beigel'],
          'cookie': ['cookie', 'galleta', 'coki'],
          'donut': ['donut', 'dona', 'dónut', 'donuts'],
          'cake pop': ['cake pop', 'cakepop', 'paleta', 'cake-pop'],
          'panini': ['panini', 'panino'],
          'baguette': ['baguette', 'baget', 'baguete']
        };
        
        // Normalizar input del usuario
        const inputNormalizado = lower
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w\s]/g, "");
        
        // Buscar coincidencia en diccionario
        for (const [alimentoKey, variantes] of Object.entries(alimentosComunes)) {
          for (const variante of variantes) {
            if (inputNormalizado.includes(variante)) {
              alimentoDetectado = alimentoKey;
              console.log(`   🍞 Detectado alimento por keyword: ${alimentoKey}`);
              break;
            }
          }
          if (alimentoDetectado) break;
        }
        
        // Si se detectó por keyword, buscar en el menú
        if (alimentoDetectado) {
          const alimento = menuUtils.findProductByName(MENU, alimentoDetectado, 'alimento');
          if (alimento) {
            order.alimento = alimento.nombre;
            order.alimento_id = alimento.id;
            console.log(`   ✅ Guardado: alimento = ${alimento.nombre} (ID: ${alimento.id})`);
          } else {
            // Si no lo encuentra en el menú, guardar lo que dijo el usuario
            order.alimento = alimentoDetectado.charAt(0).toUpperCase() + alimentoDetectado.slice(1);
            console.log(`   ✅ Guardado: alimento = ${alimentoDetectado} (nombre genérico)`);
          }
        } else {
          // Intentar búsqueda directa en el menú
          const alimento = menuUtils.findProductByName(MENU, userInput, 'alimento');
          if (alimento) {
            order.alimento = alimento.nombre;
            order.alimento_id = alimento.id;
            console.log(`   ✅ Guardado: alimento = ${alimento.nombre} (ID: ${alimento.id})`);
          } else {
            console.log(`   ⚠️ No se detectó alimento para: "${userInput}"`);
            // No guardar nada, dejarlo seguir intentando
          }
        }
      }
      break;

    case "metodoPago":
      if (lower.includes("efectivo")) order.metodoPago = "Efectivo";
      else if (lower.includes("tarjeta")) order.metodoPago = "Tarjeta bancaria";
      else if (lower.includes("starbucks")) order.metodoPago = "Starbucks Card";
      if (order.metodoPago) {
        console.log(`   ✅ Guardado: metodoPago = ${order.metodoPago}`);
      }
      break;

    case "revision":
      // ✅ NUEVO CASO: Paso de revisión
      const normalizado = lower
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      
      // Detectar si quiere agregar algo
      if (normalizado.includes('agrega') || 
          normalizado.includes('añade') || 
          normalizado.includes('agregar') ||
          normalizado.includes('quiero agregar') ||
          normalizado.includes('pon')) {
        console.log(`   ➕ Usuario quiere agregar algo`);
        order.revisado = false; // Mantener en revisión
      } 
      // Detectar si quiere quitar algo
      else if (normalizado.includes('quita') || 
               normalizado.includes('quitar') || 
               normalizado.includes('elimina')) {
        console.log(`   ➖ Usuario quiere quitar algo`);
        order.revisado = false; // Mantener en revisión
      }
      // Detectar si está listo para continuar
      else if (/(no|nada|está bien|esta bien|asi esta|todo bien|perfecto|listo|continua|cerrar|confirmar|ok)/i.test(lower)) {
        console.log(`   ✅ Usuario listo para confirmar`);
        order.revisado = true;
      }
      break;

    case "confirmacion":
      if (/(sí|si|correcto|está bien|así está bien|dale)/i.test(lower)) {
        order.confirmado = true;
        console.log(`   ✅ Guardado: confirmado = true`);
      }
      break;

    default:
      // ✅ Manejo de modificadores con fuzzy matching
      if (proximoPaso.startsWith("modifier_")) {
        console.log(`   🔧 Procesando modificador...`);
        const producto = menuUtils.findProductByName(MENU, order.bebida);
        
        if (producto) {
          const requiredMods = menuUtils.getRequiredModifiers(producto);
          console.log(`   Modificadores requeridos: ${requiredMods.map(m => m.id).join(",")}`);
          
          for (const mod of requiredMods) {
            const yaExiste = order.modificadores?.some(m => m.grupoId === mod.id);
            console.log(`     Revisando ${mod.id}: ${yaExiste ? 'YA EXISTE' : 'FALTA'}`);
            
            if (yaExiste) {
              console.log(`       → Saltando, ya guardado`);
              continue;
            }

            console.log(`       → Buscando en ${mod.opciones.length} opciones...`);
            const matchedOption = findBestMatchingOption(lower, mod.opciones);

            if (matchedOption) {
              console.log(`       → ✓ Opción: ${matchedOption.nombre} (id: ${matchedOption.id})`);
              
              if (!order.modificadores) {
                order.modificadores = [];
              }
              
              order.modificadores.push({
                grupoId: mod.id,
                opcionId: matchedOption.id,
              });
              
              console.log(`   ✅ Guardado: ${mod.id} = ${matchedOption.nombre}`);
              console.log(`   📦 Array: ${JSON.stringify(order.modificadores)}`);
              
              break;
            } else {
              console.log(`       ✗ Sin coincidencia para: "${userInput}"`);
            }
          }
        } else {
          console.log(`   ❌ Producto no encontrado: ${order.bebida}`);
        }
      }
      break;
  }
  
  console.log(`   📦 Estado final:`, JSON.stringify(order));
}

// ✅ FUNCIÓN NUEVA: Validar bebida completa
function isBebidaCompleta(order, menu) {
  if (!order.bebida) return false;
  
  const producto = menuUtils.findProductByName(menu, order.bebida);
  if (!producto) return false;
  
  // Verificar tamaño si es requerido
  if (sizeDetection.requiresSize(producto) && !order.tamano) {
    return false;
  }
  
  // Verificar todos los modificadores requeridos
  const requiredMods = menuUtils.getRequiredModifiers(producto);
  for (const mod of requiredMods) {
    const hasModifier = order.modificadores?.some(m => m.grupoId === mod.id);
    if (!hasModifier) {
      return false;
    }
  }
  
  return true;
}

function finalizeOrder(session) {
  const order = session.currentOrder;
  const validation = orderValidation.validateCompleteOrder(order, MENU, SUCURSALES);

  if (!validation.valido) {
    console.error("❌ Orden inválida:", validation.errores);
    return null;
  }

  const precioInfo = priceCalc.calculateOrderPrice(order, MENU);
  if (!precioInfo || !precioInfo.total) {
    console.error("❌ Error calculando precio:", precioInfo);
    return null;
  }

  const orderNumber = generateOrderNumber();
  const finalOrder = {
    ...order,
    orderNumber,
    total: precioInfo.total,
    estrellas: precioInfo.estrellas,
    detalles: precioInfo.detalles,
    timestamp: Date.now(),
    status: "completed",
  };

  session.orderHistory.push(finalOrder);
  session.currentOrder = {};

  console.log(`🎉 Orden completada: ${orderNumber} - $${precioInfo.total}`);
  return finalOrder;
}

function generateOrderNumber() {
  const day = String(new Date().getDate()).padStart(2, "0");
  const random = String(Math.floor(Math.random() * 9000) + 1000);
  return `SBX${day}${random}`;
}

// ✅ FUNCIÓN MEJORADA: Limpieza de texto para TTS
function cleanTextForTTS(text) {
  return text
    .replace(/\$/g, "")  // Quitar símbolo de pesos
    .replace(/pesos mexicanos/gi, "pesos")  // Simplificar
    .replace(/MXN/gi, "pesos")  // Simplificar MXN
    .replace(/&/g, " y ")
    .replace(/[{}[\]]/g, "")
    .replace(/\*/g, "")
    .replace(/•/g, "")  // Quitar bullets
    .replace(/[""]/g, "")
    .replace(/💰|⭐|📋|📦|☕|🍞|🎉/g, "")  // Quitar emojis
    .replace(/\s+/g, " ")  // Normalizar espacios
    .replace(/(\d+)\s*estrellas?/gi, "$1 estrella")  // Normalizar
    .trim();
}

function getSuggestions(order) {
  const proximoPaso = getCurrentStep(order);

  switch (proximoPaso) {
    case "sucursal":
      return SUCURSALES.map((s) => s.nombre);
    case "bebida":
      const timeContext = promptGen.getTimeContext();
      return recommendationEngine
        .getRecommendations(MENU, timeContext.momento)
        .slice(0, 4)
        .map((p) => p.nombre);
    case "tamano":
      const producto = menuUtils.findProductByName(MENU, order.bebida);
      if (producto) {
        return sizeDetection.getSizeSuggestions(producto);
      }
      return [];
    case "alimento":
      return ["Croissant", "Muffin", "Brownie", "No, gracias"];
    case "metodoPago":
      return ["Efectivo", "Tarjeta bancaria", "Starbucks Card"];
    default:
      return [];
  }
}

app.post("/chat", async (req, res) => {
  const userName = req.body.userName || "Usuario";
  const { userInput, history = [], sessionId = "default" } = req.body;
  const isFirstMessage = history.length === 0;

  try {
    if (!sessionContext.has(sessionId)) {
      sessionContext.set(sessionId, {
        currentOrder: {},
        orderHistory: [],
        startTime: Date.now(),
      });
    }

    const session = sessionContext.get(sessionId);

    const cacheKey = `${userInput.toLowerCase()}-${history.length}-${sessionId}`;
    if (responseCache.has(cacheKey)) {
      const cached = responseCache.get(cacheKey);
      console.log(`⚡ Respuesta desde caché`);
      return res.json({
        reply: cached,
        cached: true,
        context: session.currentOrder,
      });
    }

    if (isFirstMessage && (!userInput || userInput.trim() === "")) {
      const greeting = `Hola ${userName}. ¿En qué sucursal recogerás tu pedido? Estas sucursales estan cerca de tu ubicación: ${SUCURSALES.map(s => s.nombre).join(", ")}`;
      return res.json({
        reply: greeting,
        context: session.currentOrder,
        suggestions: SUCURSALES.map((s) => s.nombre),
      });
    }

    const systemPrompt = promptGen.generateSystemPrompt(
      MENU,
      session.currentOrder,
      SUCURSALES,
      userName
    );

    // ✅ Actualizar orden ANTES del LLM
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`REQUEST #${Date.now()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    updateOrderFromInput(session, userInput);

    let messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userInput },
    ];

    const startTime = Date.now();
    const { data } = await axios.post(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        model: MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 150,
        top_p: 0.7,
        frequency_penalty: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    let reply = data?.choices?.[0]?.message?.content?.trim() ?? "(sin respuesta)";
    reply = cleanTextForTTS(reply);

    const responseTime = Date.now() - startTime;
    console.log(` LLM: ${responseTime}ms`);

    const proximoPaso = getCurrentStep(session.currentOrder);
    const sugerencias = getSuggestions(session.currentOrder);
    
    let replyConDetalles = reply;
    
    // ✅ PASO: TAMAÑO
    if (proximoPaso === "tamano") {
      const producto = menuUtils.findProductByName(MENU, session.currentOrder.bebida);
      if (producto && sizeDetection.requiresSize(producto)) {
        const tamaños = sizeDetection.getSizeSuggestions(producto);
        replyConDetalles = `¿Qué tamaño prefieres? Tenemos: ${tamaños.join(", ")}`;
      }
    }
    
    // ✅ PASO: MODIFICADORES (con nombre específico)
    if (proximoPaso.startsWith("modifier_")) {
      const producto = menuUtils.findProductByName(MENU, session.currentOrder.bebida);
      if (producto) {
        const requiredMods = menuUtils.getRequiredModifiers(producto);
        for (const mod of requiredMods) {
          if (!session.currentOrder.modificadores?.some(m => m.grupoId === mod.id)) {
            // ✅ Generar pregunta específica según el tipo
            let pregunta = "";
            const modId = mod.id.toLowerCase();
            
            if (modId.includes('leche') || modId.includes('milk')) {
              pregunta = "¿Con qué tipo de leche";
            } else if (modId.includes('cafe') || modId.includes('coffee') || modId.includes('grano')) {
              pregunta = "¿Con qué tipo de café";
            } else if (modId.includes('crema') || modId.includes('cream')) {
              pregunta = "¿Deseas crema batida";
            } else if (modId.includes('splash')) {
              pregunta = "¿Quieres un toque de leche";
            } else if (modId.includes('molido')) {
              pregunta = "¿Qué tipo de molido";
            } else {
              pregunta = `¿Qué ${mod.nombre.toLowerCase()}`;
            }
            
            const opciones = mod.opciones.slice(0, 3).map(o => o.nombre).join(", ");
            replyConDetalles = `${pregunta} prefieres? Opciones: ${opciones}`;
            break;
          }
        }
      }
    }
    
    // ✅ PASO: ALIMENTO
    if (proximoPaso === "alimento") {
      replyConDetalles = `¿Te gustaría algo para acompañar? Tenemos Croissant, Muffin, Brownie, Sandwich. O puedes continuar sin alimento.`;
    }
    
    // ✅ PASO: FORMA DE PAGO (con beneficios claros)
    if (proximoPaso === "metodoPago") {
      const precioInfo = priceCalc.calculateOrderPrice(session.currentOrder, MENU);
      const totalText = precioInfo?.total ? `$${precioInfo.total}` : "$0";
      
      replyConDetalles = `¿Cómo deseas pagar? Tu total es de ${totalText} pesos mexicanos.

Formas de pago y sus beneficios:
• Efectivo: Acumulas 1 estrella por cada 20 pesos
• Tarjeta bancaria: Acumulas 1 estrella por cada 20 pesos
• Starbucks Card: Acumulas 1 estrella por cada 10 pesos (¡el doble de estrellas!)

¿Cuál prefieres?`;
    }
    
    // ✅ NUEVO PASO: REVISIÓN
    if (proximoPaso === "revision") {
      const precioInfo = priceCalc.calculateOrderPrice(session.currentOrder, MENU);
      const totalText = precioInfo?.total ? `$${precioInfo.total}` : "$0";
      const estrellasText = precioInfo?.estrellas ? `${precioInfo.estrellas}` : "0";
      
      // Verificar si está respondiendo a pregunta de agregar/quitar
      const intent = detectOrderIntent(userInput);
      
      if (intent.tipo === 'modificar' && intent.accion === 'agregar') {
        // Usuario quiere agregar
        replyConDetalles = `¿Qué te gustaría agregar a tu pedido? Tenemos: Croissant, Muffin, Brownie, Sandwich, o más bebidas`;
        session.currentOrder.revisado = false;
      } else if (intent.tipo === 'modificar' && intent.accion === 'quitar') {
        // Usuario quiere quitar
        const items = [];
        if (session.currentOrder.bebida) items.push(`la bebida (${session.currentOrder.bebida})`);
        if (session.currentOrder.alimento && session.currentOrder.alimento !== 'ninguno') {
          items.push(`el alimento (${session.currentOrder.alimento})`);
        }
        
        replyConDetalles = `¿Qué te gustaría quitar? Tienes: ${items.join(' y ')}`;
        session.currentOrder.revisado = false;
      } else {
        // Pregunta inicial de revisión
        const alimentoText = session.currentOrder.alimento && session.currentOrder.alimento !== 'ninguno' 
          ? ` y ${session.currentOrder.alimento}` 
          : '';
        
        replyConDetalles = `Perfecto. Tu pedido hasta ahora: ${session.currentOrder.bebida}${alimentoText}.

Total: ${totalText} pesos mexicanos (${estrellasText} estrellas)

¿Deseas agregar o modificar algo, o cerramos tu pedido?`;
      }
    }
    
    // ✅ PASO: CONFIRMACIÓN (resumen completo)
    if (proximoPaso === "confirmacion") {
      const precioInfo = priceCalc.calculateOrderPrice(session.currentOrder, MENU);
      const totalText = precioInfo?.total ? `$${precioInfo.total}` : "$0";
      const estrellasText = precioInfo?.estrellas ? `${precioInfo.estrellas}` : "0";
      
      const resumen = promptGen.generarResumenPedido(session.currentOrder, MENU);
      replyConDetalles = `Perfecto. Este es el resumen de tu pedido:

${resumen}

💰 Total a pagar: ${totalText} pesos mexicanos
⭐ Estrellas que acumularás: ${estrellasText}

¿Confirmas tu pedido?`;
    }

    let orderComplete = false;
    let orderData = null;

    // ✅ NUEVO: Verificar si ya completó pedido y quiere hacer algo más
    if (session.currentOrder.orderNumber) {
      // Ya hay un pedido confirmado con número
      const intent = detectOrderIntent(userInput);
      
      if (intent.tipo === 'nuevo' || intent.tipo === 'posible_nuevo') {
        // Usuario quiere hacer un nuevo pedido
        console.log(`🆕 Usuario quiere nuevo pedido después de confirmar`);
        
        // Guardar el pedido anterior en historial (si no está)
        if (!session.orderHistory.some(o => o.orderNumber === session.currentOrder.orderNumber)) {
          session.orderHistory.push({
            ...session.currentOrder,
            timestamp: Date.now()
          });
        }
        
        // Resetear la orden actual
        const previousOrderNumber = session.currentOrder.orderNumber;
        session.currentOrder = {};
        
        replyConDetalles = `Perfecto, iniciemos un nuevo pedido. Tu pedido anterior es ${previousOrderNumber}. ¿En qué sucursal recogerás esta nueva orden?`;
        
        // Si mencionó un producto, intentar detectarlo
        if (intent.producto) {
          const producto = menuUtils.findProductByName(MENU, intent.producto, 'bebida');
          if (producto) {
            session.currentOrder.bebida = producto.nombre;
            session.currentOrder.bebida_id = producto.id;
            const sucursalAnterior = session.orderHistory[session.orderHistory.length - 1]?.sucursal;
            if (sucursalAnterior) {
              replyConDetalles = `Perfecto, un ${producto.nombre}. ¿En la misma sucursal (${sucursalAnterior}) o en otra?`;
            } else {
              replyConDetalles = `Perfecto, un ${producto.nombre}. ¿En qué sucursal recogerás tu pedido?`;
            }
          }
        }
      } else if (intent.tipo === 'modificar') {
        // Usuario quiere modificar un pedido ya confirmado
        replyConDetalles = `Tu pedido ${session.currentOrder.orderNumber} ya fue confirmado y está en preparación. No puedo modificarlo ahora, pero puedo ayudarte con un nuevo pedido. ¿Te gustaría ordenar algo más?`;
      } else {
        // Usuario solo está conversando
        replyConDetalles = `Tu pedido ${session.currentOrder.orderNumber} está confirmado y listo. ¿Te gustaría hacer un nuevo pedido?`;
      }
    } else if (
      session.currentOrder.confirmado &&
      session.currentOrder.bebida &&
      session.currentOrder.sucursal &&
      !session.currentOrder.orderNumber
    ) {
      // Orden lista para finalizar (confirmada pero sin número)
      const finalOrder = finalizeOrder(session);
      if (finalOrder) {
        orderComplete = true;
        orderData = finalOrder;
        session.currentOrder.orderNumber = finalOrder.orderNumber;
        replyConDetalles = promptGen.generateConfirmationMessage(
          finalOrder,
          MENU,
          finalOrder.orderNumber
        );
      }
    } else if (proximoPaso === "confirmacion" && !session.currentOrder.confirmado) {
      // ✅ NUEVO: En paso de confirmación, verificar si quiere modificar
      const intent = detectOrderIntent(userInput);
      
      if (intent.tipo === 'modificar' && intent.accion === 'agregar') {
        // Usuario quiere agregar algo antes de confirmar
        console.log(`➕ Usuario quiere agregar algo antes de confirmar`);
        replyConDetalles = `Entendido. Por el momento solo puedo agregar un alimento por pedido. Si deseas hacer un pedido adicional, confirma este primero y luego iniciamos uno nuevo. ¿Confirmas este pedido?`;
      } else if (intent.tipo === 'modificar' && intent.accion === 'quitar') {
        // Usuario quiere quitar algo
        console.log(`➖ Usuario quiere quitar algo antes de confirmar`);
        replyConDetalles = `Claro, ¿qué te gustaría modificar de tu pedido?`;
        session.currentOrder.confirmado = false;
      }
    }

    if (responseCache.size >= MAX_CACHE_SIZE) {
      const firstKey = responseCache.keys().next().value;
      responseCache.delete(firstKey);
    }
    responseCache.set(cacheKey, replyConDetalles);

    console.log(`\n📤 RESPONSE:`);
    console.log(`   Paso siguiente: ${proximoPaso}`);
    console.log(`   Reply: ${replyConDetalles.substring(0, 60)}...`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    return res.json({
      reply: replyConDetalles,
      responseTime,
      context: session.currentOrder,
      suggestions: sugerencias,
      orderComplete,
      orderData,
    });
  } catch (e) {
    console.error("❌ Error LLM:", e.response?.data || e.message);
    return res.status(500).json({
      error: "LLM error",
      details: e.response?.data || e.message,
    });
  }
});

// =========================
// ENDPOINT: TTS (Text-to-Speech)
// =========================

function generateSilenceAudio() {
  const silence = Buffer.from([
    0xff, 0xfb, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  return silence;
}

app.post("/speak", async (req, res) => {
  let { text } = req.body;
  
  try {
    if (!text) return res.status(400).json({ error: "Falta texto" });
    if (!text.trim()) return res.status(400).json({ error: "Texto vacío" });

    text = cleanTextForTTS(text);

    if (!OPENAI_API_KEY) {
      console.warn("⚠️ OpenAI API key no configurada, usando fallback");
      const silence = generateSilenceAudio();
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": silence.length,
        "X-Fallback": "no-key",
      });
      return res.send(silence);
    }

    const startTime = Date.now();
    let audioData = null;
    let usingFallback = false;
    let retryCount = 0;
    const MAX_RETRIES = 2;

    // ✅ REINTENTOS CON BACKOFF EXPONENCIAL
    while (retryCount <= MAX_RETRIES && !audioData) {
      try {
        if (retryCount > 0) {
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(`⏳ Reintentando TTS en ${delay}ms (intento ${retryCount + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const response = await axios.post(
          "https://api.openai.com/v1/audio/speech",
          {
            model: "tts-1",
            voice: "nova",
            input: text,
            speed: 1.0,
          },
          {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            responseType: "arraybuffer",
            timeout: 8000,
          }
        );

        audioData = Buffer.from(response.data);
        const responseTime = Date.now() - startTime;
        console.log(`✅ OpenAI TTS exitoso: ${responseTime}ms`);
        break;
      } catch (ttsError) {
        retryCount++;
        const statusCode = ttsError.response?.status;
        const errorMsg = ttsError.response?.data?.error?.message || ttsError.message;

        console.warn(`⚠️ TTS Intento ${retryCount} falló (${statusCode}): ${errorMsg}`);

        // ✅ REINTENTAR si es error temporal
        if ((statusCode === 500 || statusCode === 503 || ttsError.code === 'ECONNABORTED') && retryCount <= MAX_RETRIES) {
          console.warn(`   → Error temporal, reintentando...`);
          continue;
        }

        // ✅ FALLBACK para otros errores
        audioData = generateSilenceAudio();
        usingFallback = true;
        break;
      }
    }

    // ✅ Si se agotaron reintentos
    if (!audioData) {
      console.warn(`⚠️ Se agotaron reintentos, usando fallback`);
      audioData = generateSilenceAudio();
      usingFallback = true;
    }

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioData.length,
      "Cache-Control": "public, max-age=3600",
      "X-Fallback": usingFallback ? "true" : "false",
    });

    res.send(audioData);
  } catch (error) {
    console.error("❌ Fatal TTS error:", error.message);

    try {
      const silence = generateSilenceAudio();
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": silence.length,
        "X-Fallback": "fatal-error",
      });
      return res.send(silence);
    } catch (fallbackError) {
      console.error("❌ Fallback también falló");
      return res.status(500).json({
        error: "TTS unavailable",
        message: "No se pudo generar audio.",
      });
    }
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    nvidia: NVIDIA_API_KEY ? "✓" : "✗",
    openai: OPENAI_API_KEY ? "✓" : "✗",
    cache_size: responseCache.size,
    active_sessions: sessionContext.size,
    menu_loaded: Object.keys(MENU).length > 0,
    version: "3.5",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║  STARBUCKS v3.5 - VERSIÓN MEJORADA    ║");
  console.log("║  Con correcciones completas            ║");
  console.log("╚════════════════════════════════════════╝\n");
  console.log(`🌐 Servidor: http://localhost:${PORT}`);
  console.log(`\n✨ Mejoras aplicadas:`);
  console.log(`   ✓ Flujo correcto (pago al final)`);
  console.log(`   ✓ Preguntas específicas (tipo de leche, café, etc.)`);
  console.log(`   ✓ Beneficios de pago claros`);
  console.log(`   ✓ Tono profesional`);
  console.log(`   ✓ TTS mejorado (sin enredos)`);
  console.log(`   ✓ Resumen completo`);
  console.log(`   ✓ Montos en pesos mexicanos\n`);
});

export { app, MENU, SUCURSALES };