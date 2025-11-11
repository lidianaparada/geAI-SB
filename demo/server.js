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
/**
 * Detecta si el userInput está pidiendo una CATEGORÍA de producto
 * Devuelve { categoria: string|null, confidence: 'high'|'medium'|'low' }
 * Categorias ejemplo: 'alimento', 'alimento_salado', 'alimento_dulce',
 * 'bebida_caliente', 'bebida_fria', 'frappuccino', 'cafes_especiales', 'sin_leche'
 */
 function detectCategoryRequest(text) {
  if (!text) return { categoria: null, confidence: 'none' };
  const norm = normalizeText(text);

  // patrones directos
  const directMap = [
    { pats: ['quiero un alimento','quiero algo para comer','algo para acompañar','algo para picar','algo para llevar'], cat: 'alimento', conf: 'high' },
    { pats: ['algo caliente','algo calientito','algo caliente por favor'], cat: 'bebida_caliente', conf: 'high' },
    { pats: ['algo frio','algo frío','algo refrescante','algo frío por favor'], cat: 'bebida_fria', conf: 'high' },
    { pats: ['algo dulce','algo dulce por favor','algo de postre','algo dulce y'], cat: 'alimento_dulce', conf: 'high' },
    { pats: ['algo salado','algo salado por favor','algo salado'], cat: 'alimento_salado', conf: 'high' },
    { pats: ['algo ligero','algo pequeño','solo un snack','solo algo pequeno'], cat: 'alimento_pequeño', conf: 'medium' },
    { pats: ['algo para la tarde','recomendame para la tarde','para la mañana'], cat: `por_momento_${promptGen.getTimeContext().momento}`, conf: 'medium' },
    { pats: ['frappuccino','frapuccino','frap'], cat: 'frappuccino', conf: 'high' },
    { pats: ['sin leche','sin lactosa','sin leche por favor'], cat: 'sin_leche', conf: 'high' },
    { pats: ['algo cafe','cafe','café','un café'], cat: 'cafes', conf: 'medium' },
  ];

  for (const item of directMap) {
    for (const p of item.pats) {
      if (norm.includes(p)) return { categoria: item.cat, confidence: item.conf };
    }
  }

  // patrones más generales
  if (/\b(alimento|comer|acompañar|snack|postre|muffin|croissant|brownie|sandwich)\b/.test(norm)) {
    return { categoria: 'alimento', confidence: 'medium' };
  }
  if (/\b(caliente|calient|tibio|calor)\b/.test(norm)) return { categoria: 'bebida_caliente', confidence: 'medium' };
  if (/\b(frio|fria|refrescante|iced|cold)\b/.test(norm)) return { categoria: 'bebida_fria', confidence: 'medium' };
  if (/\b(dulce|desayuno|postre)\b/.test(norm)) return { categoria: 'alimento_dulce', confidence: 'medium' };
  if (/\b(salado|salado)\b/.test(norm)) return { categoria: 'alimento_salado', confidence: 'medium' };

  return { categoria: null, confidence: 'none' };
}
function matchAgainstSuggestionObjects(userInput, suggestionObjs) {
  if (!userInput || !Array.isArray(suggestionObjs) || suggestionObjs.length === 0) return null;
  const inputNorm = normalizeText(userInput);

  // 0) Selección por número: "la 1", "1", "el 2", "numero 2"
  const numMatch = inputNorm.match(/\b(?:la|el|numero|num|n)\s*([1-9][0-9]?)\b/) || inputNorm.match(/^([1-9][0-9]?)$/);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < suggestionObjs.length) {
      const p = suggestionObjs[idx];
      console.log(`         ✓ MATCH SUGGESTION POR ÍNDICE: "${p.nombre}" (#${idx+1})`);
      return p;
    }
  }

  // 1) Exact / normalized match first
  for (const p of suggestionObjs) {
    if (!p || !p.nombre) continue;
    const nombreNorm = normalizeText(p.nombre);
    if (inputNorm === nombreNorm || inputNorm.includes(nombreNorm) || nombreNorm.includes(inputNorm)) {
      console.log(`         ✓ MATCH SUGGESTION DIRECTO: "${p.nombre}" via "${userInput}"`);
      return p;
    }
  }

  // 2) Partial token match
  const inputWords = inputNorm.split(/\s+/).filter(Boolean);
  for (const p of suggestionObjs) {
    const nombreNorm = normalizeText(p.nombre);
    const nombreWords = nombreNorm.split(/\s+/);
    for (const w of inputWords) {
      if (w.length >= 3) {
        for (const nw of nombreWords) {
          if (nw.includes(w) || w.includes(nw)) {
            console.log(`         ✓ MATCH SUGGESTION PARCIAL: "${p.nombre}" via "${w}"`);
            return p;
          }
        }
      }
    }
  }

  // 3) Fuzzy: Levenshtein pequeño (por si ASR comete errores)
  // criterio: distancia <= 2 o <= 20% del tamaño
  for (const p of suggestionObjs) {
    const nombreNorm = normalizeText(p.nombre);
    const dist = levenshtein(inputNorm, nombreNorm);
    const threshold = Math.max(2, Math.floor(nombreNorm.length * 0.2));
    if (dist <= threshold) {
      console.log(`         ✓ MATCH SUGGESTION FUZZY: "${p.nombre}" (dist=${dist})`);
      return p;
    }
  }

  return null;
}

/**
 * Construye sugerencias a partir de una categoría detectada.
 * Retorna array de objetos de producto { nombre, id?, ... }
 */
function suggestionsForCategory(menu, categoria, count = 3) {
  if (!categoria) return [];

  // mapeo simple: categoría -> keys en MENU
  const catMap = {
    'alimento': ['alimentos_salados','alimentos_dulces','panaderia'],
    'alimento_salado': ['alimentos_salados'],
    'alimento_dulce': ['alimentos_dulces','panaderia'],
    'alimento_pequeño': ['panaderia','alimentos_dulces'],
    'bebida_caliente': ['bebidas_calientes','especialidades','cafes'],
    'bebida_fria': ['bebidas_frias','frappuccino'],
    'frappuccino': ['frappuccino'],
    'cafes': ['cafes','especialidades','bebidas_calientes'],
    'sin_leche': ['bebidas_calientes','bebidas_frias','especialidades']
  };

  const buckets = catMap[categoria] || [categoria];

  const items = [];
  for (const b of buckets) {
    if (menu[b] && Array.isArray(menu[b])) {
      for (const p of menu[b]) {
        if (p && p.nombre && !items.some(x => x.nombre === p.nombre)) {
          items.push(p);
          if (items.length >= count) break;
        }
      }
    }
    if (items.length >= count) break;
  }

  // fallback a getFallbackRecommendations si vacío
  if (items.length === 0) return getFallbackRecommendations(menu, count);

  return items.slice(0, count);
}

/**
 * Helpers añadidos:
 * - normalizeText: baja a minúsculas, remueve acentos y puntuación.
 * - isRecommendationRequest: detecta solicitudes de recomendación de forma más robusta.
 */
function normalizeText(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isRecommendationRequest(text) {
  if (!text) return false;
  const norm = normalizeText(text);

  // Si contiene explícitamente raíces comunes para "recomendar" o "sugerir"
  if (/(recomend|suger)/.test(norm)) return true;

  // Captura patrones como "que me podrías recomendar", "qué podrías recomendar", "puedes recomendarme"
  if (/^(que|que\s+me|que\s+podrias|que\s+podrias\s+me|que\s+puedes|que\s+podrias)/.test(norm) &&
      /recomend/.test(norm)) {
    return true;
  }

  // patrones como "podrias recomendar", "puedes recomendar", "me recomiendas"
  if (/(podrias recomendar|puedes recomendar|me recomiendas|me recomendarias|me recomendarias)/.test(norm)) {
    return true;
  }

  // fallback mínimo: si comienza con "que me" + contiene interrogativo y es corto, preferir recomendar
  if (/^que me /.test(norm) && (norm.length < 40) && /\b(recomend|suger)/.test(norm)) {
    return true;
  }

  return false;
}

// ✅ FUNCIÓN MEJORADA: getCurrentStep con bienvenida y confirmación
function getCurrentStep(order) {
  console.log(`\n📋 getCurrentStep() - Estado actual:`);
  console.log(`   bienvenidaDada: ${order.bienvenidaDada || 'falta'}`);
  console.log(`   listoParaOrdenar: ${order.listoParaOrdenar || 'falta'}`);
  console.log(`   sucursal: ${order.sucursal || 'falta'}`);
  console.log(`   bebida: ${order.bebida || 'falta'}`);
  console.log(`   tamano: ${order.tamano || 'falta'}`);
  console.log(`   tamano: ${order.alimento || 'falta'}`);
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
  
  if (!order.revisado) {
    console.log(`   → Retorna: revision`);
    return "revision";
  }
  
  if (!order.confirmado) {
    console.log(`   → Retorna: confirmacion`);
    return "confirmacion";
  }
  
  if (!order.metodoPago) {
    console.log(`   → Retorna: metodoPago`);
    return "metodoPago";
  }
  
  console.log(`   → Retorna: finalizar`);
  return "finalizar";
}

// ✅ FUNCIÓN NUEVA: Detectar si producto NO existe en menú
// Reemplaza/actualiza tu buscarProductoEnMenu existente con esta versión

function buscarProductoEnMenu(userInput, tipo = null) {
  const producto = menuUtils.findProductByName(MENU, userInput, tipo);
  
  if (producto) {
    return { encontrado: true, producto };
  }
  
  // detectar intención de categoría
  const catDetected = detectCategoryRequest(userInput);
  if (catDetected.categoria) {
    const sugerenciasObj = suggestionsForCategory(MENU, catDetected.categoria, 3);
    return {
      encontrado: false,
      producto: null,
      sugerencias: sugerenciasObj.map(p => p.nombre),
      reason: 'categoria',
      categoria: catDetected.categoria,
      confidence: catDetected.confidence
    };
  }

  // fallback: recomendaciones generales según momento
  const timeContext = promptGen.getTimeContext();
  let sugerencias = [];
  
  if (tipo === 'bebida' || !tipo) {
    sugerencias = recommendationEngine
      .getRecommendations(MENU, timeContext.momento)
      .slice(0, 3);
  } else if (tipo === 'alimento') {
    const categorias = ['alimentos_salados', 'alimentos_dulces', 'panaderia'];
    for (const cat of categorias) {
      if (MENU[cat] && Array.isArray(MENU[cat])) {
        sugerencias.push(...MENU[cat].slice(0, 2));
      }
    }
    sugerencias = sugerencias.slice(0, 3);
  }

  if (!sugerencias || sugerencias.length === 0) {
    console.warn('⚠️ recommendationEngine devolvió vacío, usando fallback del menú');
    sugerencias = getFallbackRecommendations(MENU, 3);
  }

  return {
    encontrado: false,
    producto: null,
    sugerencias: sugerencias.map(p => p.nombre)
  };
}

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
    'light': ['light', 'ligera', 'baja grasa', 'descremada', 'semidescremada','lait','like'],
    'coco': ['coco', 'coconut'],
    'sin leche': ['sin leche', 'sin', 'no leche', 'ninguna', 'black', 'negro'],
    'soya': ['soya', 'soy', 'soja'],
    'almendra': ['almendra', 'almond'],
    'deslactosada': ['deslactosada', 'lactose free', 'sin lactosa']
  };
  
  for (const opcion of opciones) {
    const opcionLower = opcion.nombre.toLowerCase();
    if (inputLower.includes(opcionLower) || opcionLower.includes(inputLower)) {
      console.log(`         ✓ MATCH DIRECTO: "${opcion.nombre}"`);
      return opcion;
    }
  }
  
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

function detectOrderIntent(userInput) {
  const lower = userInput.toLowerCase();
  const normalizado = lower
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  
  const nuevoPedidoKeywords = [
    'nuevo pedido', 'otra orden', 'otro pedido', 'quiero pedir',
    'quiero ordenar', 'hacer otro pedido', 'nuevo', 'otra vez'
  ];
  
  const modificarKeywords = [
    'agrega', 'agregar', 'añade', 'añadir', 'pon', 'incluye',
    'quiero agregar', 'también quiero', 'y también'
  ];
  
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

// ✅ FUNCIÓN MEJORADA: updateOrderFromInput con detección de recomendaciones
function updateOrderFromInput(session, userInput) {
  const order = session.currentOrder;
  const lower = userInput.toLowerCase();
  const proximoPaso = getCurrentStep(order);

  console.log(`\n✏️  updateOrderFromInput()`);
  console.log(`   Paso actual: ${proximoPaso}`);
  console.log(`   Input del usuario: "${userInput}"`);

  switch (proximoPaso) {
    case "bienvenida":
      order.bienvenidaDada = true;
      console.log(`   ✅ Bienvenida registrada`);
      break;
      
    case "esperando_confirmacion":
      if (/(sí|si|claro|dale|vamos|ok|okay|confirmo|listo|empecemos|empezar|ordenar|pedir)/i.test(lower)) {
        order.listoParaOrdenar = true;
        console.log(`   ✅ Usuario listo para ordenar`);
      } else if (/(no|todavía no|todavia no|espera|aún no|aun no)/i.test(lower)) {
        order.listoParaOrdenar = false;
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
      // Dentro de switch (proximoPaso) case "bebida": usa esto (sustituye el bloque actual)

      case "bebida":
        {
          const inputNorm = normalizeText(userInput);
      
          // Prioridad 0: intentar match contra sugerencias guardadas en sesión
          const sugerenciasAlimentoObjs = session.currentOrder.sugerenciasAlimentoObjs || [];
          const sugerenciasBebidaObjs = session.currentOrder.sugerenciasBebidaObjs || [];
      
          const matchAlimento = matchAgainstSuggestionObjects(userInput, sugerenciasAlimentoObjs);
          if (matchAlimento) {
            order.alimento = matchAlimento.nombre;
            if (matchAlimento.id) order.alimento_id = matchAlimento.id;
            // limpiar sugerencias
            delete session.currentOrder.sugerenciasAlimentoObjs;
            delete session.currentOrder.sugerenciasAlimento;
            delete order.productoNoEncontrado;
            console.log(`   ✅ Usuario eligió sugerencia ALIMENTO: ${order.alimento}`);
            break; // quedamos en paso 'bebida' para luego pedir la bebida
          }
      
          const matchBebida = matchAgainstSuggestionObjects(userInput, sugerenciasBebidaObjs);
          if (matchBebida) {
            order.bebida = matchBebida.nombre;
            if (matchBebida.id) order.bebida_id = matchBebida.id;
            // limpiar sugerencias
            delete session.currentOrder.sugerenciasBebidaObjs;
            delete session.currentOrder.sugerencias;
            delete order.productoNoEncontrado;
            console.log(`   ✅ Usuario eligió sugerencia BEBIDA: ${order.bebida}`);
            break; // guardada la bebida, seguirá al siguiente paso (tamaño/mods)
          }
      
          // PRIORIDAD 1: si el usuario indicó un número aislado "1", ya lo manejamos arriba con matchAgainstSuggestionObjects
          // PRIORIDAD 2: continuar con detección de recomendación/categoría/búsqueda habitual
          const pidieRecomendacion = isRecommendationRequest(userInput);
          if (pidieRecomendacion) {
            order.solicitoRecomendacion = true;
            console.log(`   💡 Usuario pidió recomendación (detected)`);
            break;
          }
      
          // Detección de categoría (ej. "quiero un alimento", "algo caliente")
          const catDet = detectCategoryRequest(userInput);
          if (catDet.categoria) {
            const recomendacionesCat = suggestionsForCategory(MENU, catDet.categoria, 3);
            if (catDet.categoria.startsWith('alimento')) {
              order.sugerenciasAlimento = recomendacionesCat.map(p => p.nombre);
              session.currentOrder.sugerenciasAlimentoObjs = recomendacionesCat.map(p => ({ id: p.id, nombre: p.nombre }));
              order.ultimaCategoriaSolicitada = catDet.categoria;
              console.log(`   💡 Usuario pidió categoría '${catDet.categoria}', sugerenciasAlimento: ${order.sugerenciasAlimento.join(', ')}`);
            } else {
              order.sugerencias = recomendacionesCat.map(p => p.nombre);
              session.currentOrder.sugerenciasBebidaObjs = recomendacionesCat.map(p => ({ id: p.id, nombre: p.nombre }));
              order.ultimaCategoriaSolicitada = catDet.categoria;
              console.log(`   💡 Usuario pidió categoría '${catDet.categoria}', sugerencias (bebida): ${order.sugerencias.join(', ')}`);
            }
            break;
          }
      
          // Intentar encontrar bebida por nombre en el menú
          const resultadoBusqueda = buscarProductoEnMenu(userInput, 'bebida');
          if (resultadoBusqueda.encontrado) {
            order.bebida = resultadoBusqueda.producto.nombre;
            order.bebida_id = resultadoBusqueda.producto.id;
            console.log(`   ✅ Guardado: bebida = ${resultadoBusqueda.producto.nombre}`);
          } else if (resultadoBusqueda.reason === 'categoria') {
            // buscarProductoEnMenu devolvió sugerencias de categoría
            if (resultadoBusqueda.categoria && resultadoBusqueda.categoria.startsWith('alimento')) {
              order.sugerenciasAlimento = resultadoBusqueda.sugerencias;
              session.currentOrder.sugerenciasAlimentoObjs = suggestionsForCategory(MENU, resultadoBusqueda.categoria, 3);
              order.ultimaCategoriaSolicitada = resultadoBusqueda.categoria;
              console.log(`   💡 buscarProductoEnMenu detectó categoría ALIMENTO: ${order.sugerenciasAlimento.join(', ')}`);
            } else {
              order.sugerencias = resultadoBusqueda.sugerencias;
              session.currentOrder.sugerenciasBebidaObjs = suggestionsForCategory(MENU, resultadoBusqueda.categoria, 3);
              order.ultimaCategoriaSolicitada = resultadoBusqueda.categoria || null;
              console.log(`   💡 buscarProductoEnMenu detectó categoría: ${order.sugerencias.join(', ')}`);
            }
          } else {
            order.productoNoEncontrado = userInput;
            order.sugerencias = resultadoBusqueda.sugerencias;
            console.log(`   ⚠️ Producto NO encontrado: "${userInput}"`);
            console.log(`   💡 Sugerencias: ${resultadoBusqueda.sugerencias.join(", ")}`);
          }
        }
        break;
        case "alimento":
      if (lower.includes("no") || lower.includes("sin") || lower.includes("ninguno") || lower.includes("nada")) {
        order.alimento = "ninguno";
        console.log(`   ✅ Guardado: alimento = ninguno`);
      } else {
        const resultadoAlimento = buscarProductoEnMenu(userInput, 'alimento');
        
        if (resultadoAlimento.encontrado) {
          order.alimento = resultadoAlimento.producto.nombre;
          order.alimento_id = resultadoAlimento.producto.id;
          console.log(`   ✅ Guardado: alimento = ${resultadoAlimento.producto.nombre}`);
        } else {
          const alimentosComunes = {
            'croissant': ['croissant', 'cruasan', 'croissan', 'croasan'],
            'muffin': ['muffin', 'mofin', 'mufin', 'magdalena'],
            'brownie': ['brownie', 'brauni', 'browni'],
            'sandwich': ['sandwich', 'sanwich', 'sándwich', 'emparedado'],
            'bagel': ['bagel', 'baguel', 'beigel'],
            'cookie': ['cookie', 'galleta', 'coki'],
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

    case "revision":
      const normalizado = lower
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      
      if (normalizado.includes('agrega') || normalizado.includes('añade') || normalizado.includes('agregar')) {
        console.log(`   ➕ Usuario quiere agregar algo`);
        order.revisado = false;
      } else if (normalizado.includes('quita') || normalizado.includes('quitar') || normalizado.includes('elimina')) {
        console.log(`   ➖ Usuario quiere quitar algo`);
        order.revisado = false;
      } else if (/(no|nada|está bien|esta bien|asi esta|todo bien|perfecto|listo|continua|cerrar|confirmar|ok)/i.test(lower)) {
        console.log(`   ✅ Usuario listo para confirmar`);
        order.revisado = true;
      }
      break;

    case "confirmacion":
      if (/(sí|si|correcto|está bien|así está bien|dale|confirmo)/i.test(lower)) {
        order.confirmado = true;
        console.log(`   ✅ Guardado: confirmado = true`);
      } else if (/(no|cambiar|modificar|espera|quiero cambiar)/i.test(lower)) {
        order.confirmado = false;
        order.revisado = false;
        console.log(`   ⏮️ Usuario quiere modificar, volviendo a revisión`);
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

    default:
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

function cleanTextForTTS(text) {
  return text
    .replace(/\$/g, "")
    .replace(/pesos mexicanos/gi, "pesos")
    .replace(/MXN/gi, "pesos")
    .replace(/&/g, " y ")
    .replace(/[{}[\]]/g, "")
    .replace(/\*/g, "")
    .replace(/•/g, "")
    .replace(/[""]/g, "")
    .replace(/💰|⭐|📋|📦|☕|🍞|🎉/g, "")
    .replace(/\s+/g, " ")
    .replace(/(\d+)\s*estrellas?/gi, "$1 estrella")
    .trim();
}

function getSuggestions(order) {
  const proximoPaso = getCurrentStep(order);

  switch (proximoPaso) {
    case "bienvenida":
      return ["Sí, quiero ordenar", "Empecemos", "Iniciar orden"];
    case "esperando_confirmacion":
      return ["Sí, estoy listo", "Empecemos", "Claro"];
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
      const greeting = `¡Hola ${userName}! Soy Caffi, tu asistente virtual de Starbucks.

Estoy aquí para ayudarte a hacer tu pedido de forma rápida y sencilla.

¿Estás listo para iniciar tu orden?`;
      
      session.currentOrder.bienvenidaDada = true;
      
      return res.json({
        reply: greeting,
        context: session.currentOrder,
        suggestions: ["Sí, quiero ordenar", "Empecemos", "Claro"],
      });
    }

    const systemPrompt = promptGen.generateSystemPrompt(
      MENU,
      session.currentOrder,
      SUCURSALES,
      userName
    );

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`REQUEST #${Date.now()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    const pasoAntes = getCurrentStep(session.currentOrder);
    updateOrderFromInput(session, userInput);
    const pasoDespues = getCurrentStep(session.currentOrder);

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
    console.log(`⏱️ LLM: ${responseTime}ms`);

    const proximoPaso = pasoDespues;
    const sugerencias = getSuggestions(session.currentOrder);
    
    let replyConDetalles = reply;
    
    if (proximoPaso === "bienvenida") {
      replyConDetalles = `¡Hola ${userName}! Soy Caffi, tu asistente virtual de Starbucks.

Estoy aquí para ayudarte a hacer tu pedido de forma rápida y sencilla.

¿Estás listo para iniciar tu orden?`;
    }
    
    if (proximoPaso === "esperando_confirmacion") {
      if (session.currentOrder.listoParaOrdenar === false) {
        replyConDetalles = `Entendido, tómate tu tiempo. Cuando estés listo, avísame y comenzamos con tu pedido.`;
      } else {
        replyConDetalles = `Perfecto. Toma un momento para decidir y cuando estés listo, me dices.`;
      }
    }
    
    // ✅ MEJORADO: Detectar si pidió recomendación
    // Dentro del bloque if (proximoPaso === "bebida") reemplaza por esto o integra las ramas

if (proximoPaso === "bebida") {
  if (session.currentOrder.solicitoRecomendacion) {
    const timeContext = promptGen.getTimeContext();
    let recomendaciones = recommendationEngine
      .getRecommendations(MENU, timeContext.momento)
      .slice(0, 3);

    if (!recomendaciones || recomendaciones.length === 0) {
      console.warn('⚠️ recommendationEngine vacío en flujo de recomendación. Usando fallback.');
      recomendaciones = getFallbackRecommendations(MENU, 3);
    }

    // Guardar objetos COMPLETOS en sesión para matching posterior
    session.currentOrder.sugerenciasBebidaObjs = recomendaciones.map(p => ({ id: p.id, nombre: p.nombre }));

    const nombres = recomendaciones.map(p => p.nombre || String(p)).filter(Boolean);
    console.log('ℹ️ Recomendaciones enviadas:', nombres);

    replyConDetalles = `Con gusto te recomiendo algunas bebidas populares:\n\n${nombres.map((n, i) => `${i+1}. ${n}`).join("\n")}\n\n¿Cuál te gustaría probar? (puedes decir el número o el nombre)`;

    delete session.currentOrder.solicitoRecomendacion;
  } else if (session.currentOrder.ultimaCategoriaSolicitada) {
    const cat = session.currentOrder.ultimaCategoriaSolicitada;
    if (cat.startsWith('alimento')) {
      const suger = session.currentOrder.sugerenciasAlimento || suggestionsForCategory(MENU, cat, 4).map(p=>p.nombre);
      const sugerenciasCat = suggestionsForCategory(MENU, cat, 4);
      session.currentOrder.sugerenciasAlimentoObjs = sugerenciasCat.map(p => ({ id: p.id, nombre: p.nombre }));
      replyConDetalles = `Perfecto, buscas ${cat.replace(/_/g,' ')}. Te sugiero:\n${sugerenciasCat.map((p,i)=> `${i+1}. ${p.nombre}`).join("\n")}\n¿Cuál quieres? (di el número o el nombre)`;
      // no borrar sugerencias hasta que el usuario elija
    } else {
      const suger = session.currentOrder.sugerencias || suggestionsForCategory(MENU, cat, 4).map(p=>p.nombre);
      replyConDetalles = `Buscas ${cat.replace(/_/g,' ')}. Tengo estas opciones: ${suger.join(", ")}. ¿Cuál te interesa?`;
      // mantener para que el usuario elija
    }
    // no borrar ultimaCategoriaSolicitada aún; se borrará cuando elija o confirme
  } else if (session.currentOrder.alimento && !session.currentOrder.bebida && session.currentOrder.alimentoDesdeBebida) {
    replyConDetalles = `Perfecto, agregué ${session.currentOrder.alimento} como acompañamiento. ¿Y qué bebida te gustaría?`;
    delete session.currentOrder.alimentoDesdeBebida;
  } else if (session.currentOrder.productoNoEncontrado) {
    const productoSolicitado = session.currentOrder.productoNoEncontrado;
    const sugerencias = session.currentOrder.sugerencias || [];
    replyConDetalles = `Lo siento, no contamos con ese producto en este momento.\n\n¿Te gustaría probar alguna de nuestras bebidas disponibles? Te recomiendo: ${sugerencias.join(", ")}`;
    delete session.currentOrder.productoNoEncontrado;
    delete session.currentOrder.sugerencias;
  }
}
    
    if (proximoPaso === "tamano") {
      const producto = menuUtils.findProductByName(MENU, session.currentOrder.bebida);
      if (producto && sizeDetection.requiresSize(producto)) {
        const tamaños = sizeDetection.getSizeSuggestions(producto);
        replyConDetalles = `¿Qué tamaño prefieres? Tenemos: ${tamaños.join(", ")}`;
      }
    }
    
    if (proximoPaso.startsWith("modifier_")) {
      const producto = menuUtils.findProductByName(MENU, session.currentOrder.bebida);
      if (producto) {
        const requiredMods = menuUtils.getRequiredModifiers(producto);
        for (const mod of requiredMods) {
          if (!session.currentOrder.modificadores?.some(m => m.grupoId === mod.id)) {
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
    
    if (proximoPaso === "alimento") {
      if (session.currentOrder.alimentoNoEncontrado) {
        const alimentoSolicitado = session.currentOrder.alimentoNoEncontrado;
        const sugerencias = session.currentOrder.sugerenciasAlimento || [];
        
        replyConDetalles = `Lo siento, no contamos con "${alimentoSolicitado}" disponible.

¿Te gustaría alguno de estos alimentos? ${sugerencias.join(", ")}. O puedes continuar sin alimento.`;
        
        delete session.currentOrder.alimentoNoEncontrado;
        delete session.currentOrder.sugerenciasAlimento;
      } else {
        replyConDetalles = `¿Te gustaría algo para acompañar? Tenemos Croissant, Muffin, Brownie, Sandwich. O puedes continuar sin alimento.`;
      }
    }
    
    if (proximoPaso === "revision") {
      const precioInfo = priceCalc.calculateOrderPrice(session.currentOrder, MENU);
      const totalText = precioInfo?.total ? `$${precioInfo.total}` : "$0";
      
      const alimentoText = session.currentOrder.alimento && session.currentOrder.alimento !== 'ninguno' 
        ? ` y ${session.currentOrder.alimento}` 
        : '';
      
      replyConDetalles = `Perfecto. Tu pedido hasta ahora: ${session.currentOrder.bebida}${alimentoText}.

Subtotal: ${totalText} pesos mexicanos

¿Deseas agregar o modificar algo, o cerramos tu pedido?`;
    }
    
    if (proximoPaso === "confirmacion") {
      const precioInfo = priceCalc.calculateOrderPrice(session.currentOrder, MENU);
      const totalText = precioInfo?.total ? `$${precioInfo.total}` : "$0";
      
      const resumen = promptGen.generarResumenPedido(session.currentOrder, MENU);
      replyConDetalles = `Perfecto. Este es el resumen de tu pedido:

${resumen}

💰 Total: ${totalText} pesos mexicanos

¿Confirmas tu pedido?`;
    }
    
    if (proximoPaso === "metodoPago") {
      const precioInfo = priceCalc.calculateOrderPrice(session.currentOrder, MENU);
      const totalText = precioInfo?.total ? `$${precioInfo.total}` : "$0";
      const estrellasEfectivo = Math.floor(precioInfo.total / 20);
      const estrellasCard = Math.floor(precioInfo.total / 10);
      
      replyConDetalles = `Excelente. Tu total es de ${totalText} pesos mexicanos.

¿Cómo deseas pagar?

• Efectivo: Acumulas ${estrellasEfectivo} estrellas
• Tarjeta bancaria: Acumulas ${estrellasEfectivo} estrellas
• Starbucks Card: Acumulas ${estrellasCard} estrellas (¡el doble!)

¿Cuál prefieres?`;
    }

    let orderComplete = false;
    let orderData = null;

    if (session.currentOrder.orderNumber) {
      const intent = detectOrderIntent(userInput);
      
      if (intent.tipo === 'nuevo' || intent.tipo === 'posible_nuevo') {
        console.log(`🆕 Usuario quiere nuevo pedido`);
        
        if (!session.orderHistory.some(o => o.orderNumber === session.currentOrder.orderNumber)) {
          session.orderHistory.push({
            ...session.currentOrder,
            timestamp: Date.now()
          });
        }
        
        const previousOrderNumber = session.currentOrder.orderNumber;
        session.currentOrder = {};
        
        replyConDetalles = `Perfecto, iniciemos un nuevo pedido. Tu pedido anterior es ${previousOrderNumber}. ¿En qué sucursal recogerás esta nueva orden?`;
      }
    } else if (
      session.currentOrder.confirmado &&
      session.currentOrder.metodoPago &&
      session.currentOrder.bebida &&
      session.currentOrder.sucursal &&
      !session.currentOrder.orderNumber
    ) {
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

    while (retryCount <= MAX_RETRIES && !audioData) {
      try {
        if (retryCount > 0) {
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(`⏳ Reintentando TTS en ${delay}ms`);
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
        console.log(`✅ OpenAI TTS: ${responseTime}ms`);
        break;
      } catch (ttsError) {
        retryCount++;
        const statusCode = ttsError.response?.status;

        if ((statusCode === 500 || statusCode === 503) && retryCount <= MAX_RETRIES) {
          continue;
        }

        audioData = generateSilenceAudio();
        usingFallback = true;
        break;
      }
    }

    if (!audioData) {
      audioData = generateSilenceAudio();
      usingFallback = true;
    }

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioData.length,
      "X-Fallback": usingFallback ? "true" : "false",
    });

    res.send(audioData);
  } catch (error) {
    console.error("❌ TTS error:", error.message);
    const silence = generateSilenceAudio();
    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": silence.length,
      "X-Fallback": "fatal-error",
    });
    return res.send(silence);
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
    version: "3.6.1",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║  STARBUCKS v3.6.1 - FIX RECOMENDACIÓN ║");
  console.log("╚════════════════════════════════════════╝\n");
  console.log(`🌐 Servidor: http://localhost:${PORT}`);
  console.log(`\n✨ Fix aplicado:`);
  console.log(`   ✅ Detección de solicitud de recomendación mejorada`);
  console.log(`   ✅ Evitamos tratar preguntas como productos\n`);
});

export { app, MENU, SUCURSALES };