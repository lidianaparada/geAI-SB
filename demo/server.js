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
import { Console } from "console";

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
/**
 * ✅ VERSIÓN MEJORADA: Buscar producto con fuzzy matching
 * Encuentra productos incluso con variaciones de escritura
 */
 function buscarProductoEnMenu(userInput, tipo = null) {
  console.log(`\n🔍 buscarProductoEnMenu()`);
  console.log(`   Input original: "${userInput}"`);
  console.log(`   Tipo: ${tipo || 'cualquiera'}`);
  
  // 1️⃣ Normalizar input del usuario
  const inputNormalizado = userInput
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
    .replace(/[®©™]/g, "") // Quitar símbolos registrados
    .replace(/[^\w\s]/g, " ") // Reemplazar símbolos por espacios
    .replace(/\s+/g, " ") // Normalizar espacios múltiples
    .trim();
  
  console.log(`   Input normalizado: "${inputNormalizado}"`);
  
  // 2️⃣ Intentar búsqueda exacta primero (usando menuUtils)
  let producto = menuUtils.findProductByName(MENU, userInput, tipo);
  
  if (producto) {
    console.log(`   ✅ Encontrado (búsqueda exacta): ${producto.nombre}`);
    return { encontrado: true, producto };
  }
  
  // 3️⃣ Búsqueda FUZZY mejorada
  console.log(`   🔄 Búsqueda exacta falló, intentando fuzzy matching...`);
  
  const categorias = tipo === 'bebida' || !tipo
    ? ['bebidas_calientes', 'bebidas_frias', 'frappuccino', 'bebidas_te']
    : ['alimentos_salados', 'alimentos_dulces', 'panaderia','productos_temporada'];
  
  let mejorCoincidencia = null;
  let mejorPuntaje = 0;
  
  // Input sin espacios para comparación flexible
  const inputSinEspacios = inputNormalizado.replace(/\s+/g, "");
  const palabrasInput = inputNormalizado.split(/\s+/).filter(p => p.length >= 3);
  
  console.log(`   Palabras clave: [${palabrasInput.join(", ")}]`);
  
  for (const cat of categorias) {
    if (!MENU[cat] || !Array.isArray(MENU[cat])) continue;
    
    for (const item of MENU[cat]) {
      if (item.disponible === false) continue;
      
      // Normalizar nombre del producto igual que el input
      const nombreNormalizado = item.nombre
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[®©™]/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      
      const nombreSinEspacios = nombreNormalizado.replace(/\s+/g, "");
      
      // ⭐ ESTRATEGIA 1: Coincidencia sin espacios (para "dragon fruit" vs "dragonfruit")
      if (nombreSinEspacios.includes(inputSinEspacios)) {
        console.log(`   ✅ MATCH (sin espacios): "${item.nombre}"`);
        return { encontrado: true, producto: item };
      }
      
      // Si el input es corto, revisar si está contenido
      if (inputSinEspacios.length >= 5 && nombreSinEspacios.includes(inputSinEspacios)) {
        console.log(`   ✅ MATCH (contenido): "${item.nombre}"`);
        return { encontrado: true, producto: item };
      }
      
      // ⭐ ESTRATEGIA 2: Coincidencia por palabras clave
      if (palabrasInput.length > 0) {
        let palabrasCoinciden = 0;
        const palabrasProducto = nombreNormalizado.split(/\s+/);
        
        for (const palabraInput of palabrasInput) {
          for (const palabraProd of palabrasProducto) {
            // Coincidencia parcial (una palabra contiene a la otra)
            if (palabraProd.includes(palabraInput) || palabraInput.includes(palabraProd)) {
              palabrasCoinciden++;
              break;
            }
          }
        }
        
        const puntaje = palabrasCoinciden / palabrasInput.length;
        
        // Guardar la mejor coincidencia
        if (puntaje > mejorPuntaje) {
          mejorPuntaje = puntaje;
          mejorCoincidencia = item;
        }
      }
    }
  }
  
  // Si encontramos una buena coincidencia (>= 60%)
  if (mejorCoincidencia && mejorPuntaje >= 0.6) {
    console.log(`   ✅ Encontrado (fuzzy): ${mejorCoincidencia.nombre} (score: ${(mejorPuntaje * 100).toFixed(0)}%)`);
    return { encontrado: true, producto: mejorCoincidencia };
  }
  
  // 4️⃣ No encontró nada, generar sugerencias
  console.log(`   ❌ No encontrado en menú, generando sugerencias...`);
  
  const timeContext = promptGen.getTimeContext();
  let sugerencias = [];
  
  if (tipo === 'bebida' || !tipo) {
    const recomendaciones = recommendationEngine
      .getRecommendations(MENU, timeContext.momento)
      .slice(0, 3);
    
    sugerencias = recomendaciones.map(r => r.nombre);
    console.log(`   💡 Sugerencias de bebidas: ${sugerencias.join(", ")}`);
  } 
  else if (tipo === 'alimento') {
    for (const cat of categorias) {
      if (MENU[cat] && Array.isArray(MENU[cat])) {
        const items = MENU[cat]
          .filter(item => item.disponible !== false)
          .slice(0, 2)
          .map(item => item.nombre);
        
        sugerencias.push(...items);
      }
    }
    sugerencias = sugerencias.slice(0, 3);
    console.log(`   💡 Sugerencias de alimentos: ${sugerencias.join(", ")}`);
  }
  
  return {
    encontrado: false,
    producto: null,
    sugerencias: sugerencias
  };
}
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
  console.log(`   bienvenidaDada: ${order.bienvenidaDada || 'falta'}`);
  console.log(`   listoParaOrdenar: ${order.listoParaOrdenar || 'falta'}`);
  console.log(`   sucursal: ${order.sucursal || 'falta'}`);
  console.log(`   bebida: ${order.bebida || 'falta'}`);
  console.log(`   tamano: ${order.tamano || 'falta'}`);
  console.log(`   alimento: ${order.alimento || 'falta'}`);
  console.log(`   modificadores: ${JSON.stringify(order.modificadores || [])}`);
  console.log(`   revisado: ${order.revisado || 'falta'}`);
  console.log(`   confirmado: ${order.confirmado || 'falta'}`);
  console.log(`   metodoPago: ${order.metodoPago || 'falta'}`);

  if (!order.bienvenidaDada) {
    console.log(`   → Retorna: bienvenida`);
    return "bienvenida";
  }
  
  if (!order.listoParaOrdenar) {
    console.log(`   → Retorna: esperando_confirmacion`);
    return "esperando_confirmacion";
  }
  
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
  

  
  // ✅ NUEVO: Paso de revisión después de pago
  if (!order.revisado) {
    console.log(`   → Retorna: revision`);
    return "revision";
  }
  
  if (!order.confirmado) {
    console.log(`   → Retorna: confirmacion`);
    return "confirmacion";
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
  const proximoPaso = orderValidation.suggestNextStep(session.currentOrder, MENU);

  console.log(`\n✏️  updateOrderFromInput()`);
  console.log(`   Paso actual: ${proximoPaso}`);
  console.log(`   Input del usuario: "${userInput}"`);

  switch (proximoPaso) {
    
    case "bienvenida":
      if (/(sí|si|claro|dale|vamos|ok|okay|listo|empecemos|empezar|ordenar|pedir)/i.test(lower)) {
        order.listoParaOrdenar = true;
        order.bienvenidaDada=true;
        console.log(`   ✅ Usuario listo para ordenar`);
      } else if (/(no|todavía no|todavia no|espera|aún no|aun no)/i.test(lower)) {
        order.listoParaOrdenar = false;
        order.bienvenidaDada=true;
        console.log(`   ⏸️ Usuario NO listo aún`);
      }
      break;
    
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

    // ✅ DETECCIÓN MEJORADA en updateOrderFromInput() - caso "bebida"

case "bebida":
  // ✅ Detectar si está pidiendo recomendación
  const pidieRecomendacion = /(recomienda|recomiéndame|recomendame|sugiere|sugiéreme|sugiereme|que me|qué me|sorpréndeme|sorprendeme|lo mejor|lo más|lo mas|popular|no sé|no se|cual|cuál|cualquier|quiero|quiero algo|dame recomendaciones|temporada)/i.test(lower);
  
  if (pidieRecomendacion) {
    order.solicitoRecomendacion = true;
    
    // 🔥 Detectar preferencia en el mismo input
    const inputNormalizado = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Temperatura
    if (/(frio|fria|helado|helada|iced|cold|fresco|fresca|frescos|refrescante)/i.test(inputNormalizado)) {
      order.preferenciaRecomendacion = "frio";
      console.log(`   💡 Usuario pidió recomendación + preferencia: FRÍA`);
    } 
    else if (/(caliente|calientito|hot|tibio|tibia|calientitos)/i.test(inputNormalizado)) {
      order.preferenciaRecomendacion = "caliente";
      console.log(`   💡 Usuario pidió recomendación + preferencia: CALIENTE`);
    }
    // Tipo - Dulce
    else if (/(dulce|chocolate|caramelo|sweet|postres?)/i.test(inputNormalizado)) {
      order.preferenciaRecomendacion = "dulce";
      console.log(`   💡 Usuario pidió recomendación + preferencia: DULCE`);
    }
    // Tipo - Con café
    else if (/(cafe|café|coffee|espresso|cafeinado)/i.test(inputNormalizado)) {
      order.preferenciaRecomendacion = "cafe";
      console.log(`   💡 Usuario pidió recomendación + preferencia: CON CAFÉ`);
    }
    // Tipo - Sin café
    else if (/(sin cafe|sin cafeina|sin cafeína|decaf|descafeinado)/i.test(inputNormalizado)) {
      order.preferenciaRecomendacion = "sin cafe";
      console.log(`   💡 Usuario pidió recomendación + preferencia: SIN CAFÉ`);
    }
    // Tipo - Té
    else if (/(te|té|tea|infusion|infusión)/i.test(inputNormalizado)) {
      order.preferenciaRecomendacion = "te";
      console.log(`   💡 Usuario pidió recomendación + preferencia: TÉ`);
    }
    else if (/(temporada)/i.test(inputNormalizado)) {
      order.preferenciaRecomendacion = "temporada";
      console.log(`   💡 Usuario pidió recomendación + preferencia: Temporada`);
    }
    else {
      console.log(`   💡 Usuario pidió recomendación (sin preferencia específica)`);
    }
  } else {
    const resultadoBusqueda = buscarProductoEnMenu(userInput, 'bebida');
    
    if (resultadoBusqueda.encontrado) {
      order.bebida = resultadoBusqueda.producto.nombre;
      order.bebida_id = resultadoBusqueda.producto.id;
      console.log(`   ✅ Guardado: bebida = ${resultadoBusqueda.producto.nombre}`);
    } else {
      order.productoNoEncontrado = userInput;
      order.sugerencias = resultadoBusqueda.sugerencias;
      console.log(`   ⚠️ Producto NO encontrado: "${userInput}"`);
    }
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

      // ✅ DETECCIÓN MEJORADA en updateOrderFromInput() - caso "alimento"

case "alimento":
  // ✅ Detectar si dijo "no" o "ninguno"
  if (/(no|sin|ninguno|nada|no quiero|no gracias|paso|skip|continua|continuar|siguiente)/i.test(lower)) {
    order.alimento = "ninguno";
    console.log(`   ✅ Guardado: alimento = ninguno`);
    break;
  }
  
  // ✅ Detectar si está pidiendo recomendación de alimento
  const pidieRecomendacionAlimento = /(recomienda|recomiéndame|recomendame|sugiere|sugiéreme|sugiereme|que me|qué me|opciones|que hay|qué hay|que tienen|qué tienen|no sé|no se|cual|cuál|cualquier)/i.test(lower);
  
  if (pidieRecomendacionAlimento) {
    order.solicitoRecomendacionAlimento = true;
    
    // 🔥 Detectar preferencia de tipo de alimento
    const inputNormalizado = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Tipo - Salado
    if (/(salado|salada|sandwich|panini|bagel|baguette|pavo|jamon|queso|sal)/i.test(inputNormalizado)) {
      order.preferenciaAlimento = "salado";
      console.log(`   💡 Usuario pidió recomendación + preferencia: SALADO`);
    }
    // Tipo - Dulce
    else if (/(dulce|postre|chocolate|brownie|cookie|galleta|dona|pastel|muffin|sweet|azucar)/i.test(inputNormalizado)) {
      order.preferenciaAlimento = "dulce";
      console.log(`   💡 Usuario pidió recomendación + preferencia: DULCE`);
    }
    // Tipo - Saludable
    else if (/(saludable|sano|ligero|light|ensalada|fruta|yogurt|avena|chia|fit|natural)/i.test(inputNormalizado)) {
      order.preferenciaAlimento = "saludable";
      console.log(`   💡 Usuario pidió recomendación + preferencia: SALUDABLE`);
    }
    // Tipo - Desayuno
    else if (/(desayuno|breakfast|mañana|morning)/i.test(inputNormalizado)) {
      order.preferenciaAlimento = "desayuno";
      console.log(`   💡 Usuario pidió recomendación + preferencia: DESAYUNO`);
    }
    else {
      console.log(`   💡 Usuario pidió recomendación de alimento (sin preferencia específica)`);
    }
  } else {
    // Buscar el alimento en el menú
    const resultadoAlimento = buscarProductoEnMenu(userInput, 'alimento');
    
    if (resultadoAlimento.encontrado) {
      order.alimento = resultadoAlimento.producto.nombre;
      order.alimento_id = resultadoAlimento.producto.id;
      console.log(`   ✅ Guardado: alimento = ${resultadoAlimento.producto.nombre}`);
    } else {
      // Intentar detectar alimentos comunes con variaciones
      const alimentosComunes = {
        'croissant': ['croissant', 'cruasan', 'croissan', 'croasan'],
        'muffin': ['muffin', 'mofin', 'mufin', 'magdalena'],
        'brownie': ['brownie', 'brauni', 'browni'],
        'sandwich': ['sandwich', 'sanwich', 'sándwich', 'emparedado'],
        'bagel': ['bagel', 'baguel', 'beigel'],
        'cookie': ['cookie', 'galleta', 'coki', 'galeta'],
        'dona': ['dona', 'donut', 'dona', 'donuts'],
        'panini': ['panini', 'panini', 'pannini'],
      };
      
      const inputNormalizado = lower
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, "");
      
      let alimentoDetectado = null;
      for (const [alimentoKey, variantes] of Object.entries(alimentosComunes)) {
        for (const variante of variantes) {
          if (inputNormalizado.includes(variante)) {
            alimentoDetectado = alimentoKey;
            break;
          }
        }
        if (alimentoDetectado) break;
      }
      
      if (alimentoDetectado) {
        const alimento = menuUtils.findProductByName(MENU, alimentoDetectado, 'alimento');
        if (alimento) {
          order.alimento = alimento.nombre;
          order.alimento_id = alimento.id;
          console.log(`   ✅ Guardado: alimento = ${alimento.nombre}`);
        } else {
          // Guardar como genérico
          order.alimento = alimentoDetectado.charAt(0).toUpperCase() + alimentoDetectado.slice(1);
          console.log(`   ✅ Guardado: alimento = ${alimentoDetectado} (genérico)`);
        }
      } else {
        order.alimentoNoEncontrado = userInput;
        order.sugerenciasAlimento = resultadoAlimento.sugerencias;
        console.log(`   ⚠️ Alimento NO encontrado: "${userInput}"`);
        console.log(`   💡 Sugerencias: ${resultadoAlimento.sugerencias.join(", ")}`);
      }
    }
  }
  break;
   
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CASO: REVISION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

case "revision":
  const normalizado = lower
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  
  // Usuario quiere agregar algo
  if (normalizado.includes('agrega') || 
      normalizado.includes('añade') || 
      normalizado.includes('agregar') ||
      normalizado.includes('anadir')) {
    console.log(`   ➕ Usuario quiere agregar algo`);
    order.revisado = false;
  } 
  // Usuario quiere quitar algo
  else if (normalizado.includes('quita') || 
           normalizado.includes('quitar') || 
           normalizado.includes('elimina') ||
           normalizado.includes('eliminar')) {
    console.log(`   ➖ Usuario quiere quitar algo`);
    order.revisado = false;
  } 
  // Usuario está listo para continuar
  else if (/(no|nada|está bien|esta bien|asi esta|así está|todo bien|perfecto|listo|continua|continúa|continuar|cerrar|confirmar|ok|si|sí|correcto|dale|vamos|continuar)/i.test(lower)) {
    console.log(`   ✅ Usuario listo para continuar al pago`);
    order.revisado = true;  // ⭐ MARCAR COMO REVISADO
  }
  break;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CASO: CONFIRMACION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

case "confirmacion":
  // Usuario confirma que todo está bien
  if (/(sí|si|correcto|está bien|así está bien|todo bien|perfecto|dale|confirmo|ok|okay|yes|confirmar)/i.test(lower)) {
    order.confirmado = true;  // ⭐ MARCAR COMO CONFIRMADO
    console.log(`   ✅ Guardado: confirmado = true`);
  } 
  // Usuario quiere cambiar algo
  else if (/(no|cambiar|modificar|espera|quiero cambiar|mal|incorrecto)/i.test(lower)) {
    order.confirmado = false;
    order.revisado = false;  // Volver a revisión
    console.log(`   ⏮️ Usuario quiere modificar, volviendo a revisión`);
  }
  break;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CASO: METODO DE PAGO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

case "metodoPago":
  if (lower.includes("efectivo")) {
    order.metodoPago = "Efectivo";
    console.log(`   ✅ Guardado: metodoPago = Efectivo`);
  } 
  else if (lower.includes("tarjeta")) {
    order.metodoPago = "Tarjeta bancaria";
    console.log(`   ✅ Guardado: metodoPago = Tarjeta bancaria`);
  } 
  else if (lower.includes("starbucks") || lower.includes("card")) {
    order.metodoPago = "Starbucks Card";
    console.log(`   ✅ Guardado: metodoPago = Starbucks Card`);
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
    .replace(/(\d+)\s*estrellas?/gi, "$1 estrella") 
    .replace(/[•●◦▪]/g, '') // Eliminar bullets
    .replace(/━+/g, '') // Eliminar separadores visuales
    .replace(/\n{2,}/g, '. ') // Convertir saltos dobles en pausas // Normalizar
    .trim();
}

// ✅ Actualizar getSuggestions() - Agregar caso de alimentos

function getSuggestions(order) {
  const proximoPaso = getCurrentStep(order);

  switch (proximoPaso) {
    case "bienvenida":
      return ["Sí, quiero ordenar", "Empecemos", "Iniciar orden"];
      
    case "esperando_confirmacion":
      return ["Sí, estoy listo", "Empecemos", "Claro","dale","vamos","ok","okay","estoy listo"];
      
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
      
    // ✅ NUEVO: Sugerencias para alimentos
    case "alimento":
      const sugerenciasAlimentos = [];
      
      // Tomar 2 salados
      if (MENU.alimentos_salados && MENU.alimentos_salados.length > 0) {
        sugerenciasAlimentos.push(
          ...MENU.alimentos_salados.slice(0, 2).map(a => a.nombre)
        );
      }
      
      // Tomar 2 dulces
      if (MENU.alimentos_dulces && MENU.alimentos_dulces.length > 0) {
        sugerenciasAlimentos.push(
          ...MENU.alimentos_dulces.slice(0, 2).map(a => a.nombre)
        );
      }
      
      // Agregar opción de "No, gracias"
      sugerenciasAlimentos.push("No, gracias");
      
      return sugerenciasAlimentos.slice(0, 5);
      
    case "metodoPago":
      return ["Efectivo", "Tarjeta bancaria", "Starbucks Card"];
      
    default:
      return [];
  }
}

app.post("/chat", async (req, res) => {
  const userName = req.body.userName || "Usuario";
  const { userInput, history = [], sessionId = "default" } = req.body;

  try {
    // 1️⃣ GESTIÓN DE SESIÓN
    if (!sessionContext.has(sessionId)) {
      sessionContext.set(sessionId, {
        currentOrder: {},
        orderHistory: [],
        startTime: Date.now(),
      });
    }

    const session = sessionContext.get(sessionId);

    // 2️⃣ ACTUALIZAR ORDEN CON INPUT DEL USUARIO
    if (userInput && userInput.trim() !== "") {
      updateOrderFromInput(session, userInput, MENU);
    }

    // 3️⃣ DETERMINAR PRÓXIMO PASO
    const proximoPaso = orderValidation.suggestNextStep(session.currentOrder, MENU);

    // 4️⃣ GENERAR PROMPT DINÁMICO
    const systemPrompt = promptGen.generateSystemPrompt(
      MENU,
      session.currentOrder,
      SUCURSALES,
      userName
    );
    console.log(`\n📝 System Prompt:\n${systemPrompt}\n ${proximoPaso}`);

    // 5️⃣ LLAMAR AL LLM
    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userInput },
    ];

    const { data } = await axios.post(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        model: MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 150, // Reducido para voz
        top_p: 0.85,
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
    reply = cleanTextForTTS(reply); // CONSERVA esto para voz

    // 6️⃣ VERIFICAR SI LA ORDEN ESTÁ COMPLETA
    let orderComplete = false;
    let orderData = null;

    if (proximoPaso === 'confirmacion' && 
        session.currentOrder.confirmado &&
        session.currentOrder.metodoPago &&
        !session.currentOrder.orderNumber) {
      
      const finalOrder = finalizeOrder(session);
      if (finalOrder) {
        orderComplete = true;
        orderData = finalOrder;
        session.currentOrder.orderNumber = finalOrder.orderNumber;
      }
    }

    // 7️⃣ GENERAR SUGERENCIAS VISUALES (para botones en UI)
    const sugerencias = generarSugerenciasUI(proximoPaso, session.currentOrder, MENU);

    // 8️⃣ RESPONDER
    return res.json({
      reply,
      context: session.currentOrder,
      suggestions: sugerencias,
      orderComplete,
      orderData,
      currentStep: proximoPaso, // Útil para el frontend
    });

  } catch (e) {
    console.error("❌ Error LLM:", e.response?.data || e.message);
    return res.status(500).json({
      error: "LLM error",
      details: e.response?.data || e.message,
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCIÓN AUXILIAR: Generar sugerencias para UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function generarSugerenciasUI(paso, order, menu) {
  switch (paso) {
    case 'bienvenida':
      return ["Sí, ordenar", "Empecemos"];
    
    case 'sucursal':
      return SUCURSALES.map(s => s.nombre);
    
    case 'bebida':
      return menuUtils.getRecommendations(menu, promptGen.getTimeContext().momento, 'general')
        .slice(0, 3)
        .map(p => p.nombre);
    
    case 'tamano':
      const producto = menuUtils.findProductByName(menu, order.bebida);
      if (producto) {
        return sizeDetection.getSizeSuggestions(producto);
      }
      return [];
    
    case 'alimento':
      return ["Croissant", "Muffin", "No, gracias"];
    
    case 'metodoPago':
      return ["Efectivo", "Tarjeta", "Starbucks Card"];
    
    case 'confirmacion':
      return ["Sí, confirmar", "Modificar pedido"];
    
    default:
      if (paso.startsWith('modifier_')) {
        const modId = paso.replace('modifier_', '');
        const prod = menuUtils.findProductByName(menu, order.bebida);
        const modificador = menuUtils.getModifierById(prod, modId);
        if (modificador) {
          return modificador.opciones.slice(0, 4).map(o => o.nombre);
        }
      }
      return [];
  }
}

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