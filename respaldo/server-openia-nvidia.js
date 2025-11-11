import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "meta/llama-3.3-70b-instruct";

// =========================
// ORDEN DE PASOS ACTUALIZADO
// =========================
const ORDEN_STEPS = {
  SUCURSAL: 'sucursal',
  TIPO_BEBIDA: 'tipo_bebida',
  TAMANO: 'tamano',
  LECHE: 'leche',
  SHOTS_EXTRA: 'shots_extra',
  ENDULZANTE: 'endulzante',
  JARABES: 'jarabes',
  TOPPINGS: 'toppings',
  ALIMENTO: 'alimento',
  METODO_PAGO: 'metodo_pago',
  CONFIRMAR: 'confirmar',
  FINALIZAR: 'finalizar'
};

// =========================
// CACHÉ Y CONTEXTO
// =========================
const responseCache = new Map();
const sessionContext = new Map();
const MAX_CACHE_SIZE = 50;

// =========================
// SUCURSALES DISPONIBLES
// =========================
const SUCURSALES = [
  { id: 1, nombre: "Starbucks Reforma 222", direccion: "Av. Reforma 222, CDMX" },
  { id: 2, nombre: "Starbucks Insurgentes Sur", direccion: "Av. Insurgentes Sur 1431, CDMX" },
  { id: 3, nombre: "Starbucks Condesa", direccion: "Av. Tamaulipas 123, CDMX" }
];

// =========================
// FUNCIÓN: Obtener paso actual
// =========================
function getCurrentStep(order) {
  if (!order.sucursal) return ORDEN_STEPS.SUCURSAL;
  if (!order.bebida) return ORDEN_STEPS.TIPO_BEBIDA;
  if (!order.tamano && requiresTamano(order.bebida)) return ORDEN_STEPS.TAMANO;
  if (!order.leche && requiresLeche(order.bebida)) return ORDEN_STEPS.LECHE;
  if (order.shots_extra === undefined) return ORDEN_STEPS.SHOTS_EXTRA;
  if (!order.endulzante) return ORDEN_STEPS.ENDULZANTE;
  if (order.jarabes === undefined) return ORDEN_STEPS.JARABES;
  if (order.toppings === undefined) return ORDEN_STEPS.TOPPINGS;
  if (order.alimento === undefined) return ORDEN_STEPS.ALIMENTO;
  if (!order.metodoPago) return ORDEN_STEPS.METODO_PAGO;
  if (!order.confirmado) return ORDEN_STEPS.CONFIRMAR;
  return ORDEN_STEPS.FINALIZAR;
}

function requiresLeche(bebida) {
  if (!bebida) return false;
  const lower = bebida.toLowerCase();
  return lower.includes("latte") || lower.includes("cappuccino") || 
         lower.includes("macchiato") || lower.includes("mocha") || lower.includes("chai");
}

function requiresTamano(bebida) {
  if (!bebida) return false;
  // Verificar en el menú si el producto tiene tamaños disponibles
  const producto = findProductInMenu(bebida);
  return producto && producto.tamanos && producto.tamanos.length > 0 && producto.tamanos[0] !== "" && producto.tamanos[0] !== "-";
}

function findProductInMenu(nombreProducto) {
  if (!nombreProducto) return null;
  const lower = nombreProducto.toLowerCase();
  
  const allProducts = [
    ...MENU.bebidas_calientes || [],
    ...MENU.bebidas_frias || [],
    ...MENU.productos_temporada || [],
    ...MENU.productos_en_promocion || [],
    ...MENU.alimentos_salados || [],
    ...MENU.alimentos_dulces || [],
    ...MENU.postres || [],
    ...MENU.panaderia || [],
    ...MENU.te || []
  ];
  
  return allProducts.find(p => lower.includes(p.nombre.toLowerCase()) || p.nombre.toLowerCase().includes(lower));
}

function calculateOrderPrice(order, menu) {
  let total = 0;
  
  if (order.bebida) {
    const producto = findProductInMenu(order.bebida);
    if (producto) {
      total += producto.precio_base;
      
      // Ajuste por tamaño
      if (order.tamano) {
        if (order.tamano.toLowerCase().includes("grande")) total += 10;
        else if (order.tamano.toLowerCase().includes("venti")) total += 15;
      }
      
      // Shots extra
      if (order.shots_extra > 0) total += order.shots_extra * 10;
      
      // Jarabes
      if (order.jarabes?.length > 0) total += order.jarabes.length * 8;
    }
  }
  
  if (order.alimento && order.alimento !== "ninguno") {
    const alimento = [...menu.alimentos_salados || [], ...menu.postres || [], ...menu.panaderia || []]
      .find(a => a.nombre.toLowerCase() === order.alimento.toLowerCase());
    if (alimento) total += alimento.precio_base;
  }
  
  return total;
}

function calculateStars(total, metodoPago) {
  if (!total || total <= 0) return 0;
  if (!metodoPago) return 0;
  const metodo = metodoPago.toLowerCase();
  if (metodo.includes("starbucks")) return Math.floor(total / 10);
  return Math.floor(total / 20);
}

function updateOrderFromInput(session, userInput, currentStep, menu) {
  const order = session.currentOrder;
  const lower = userInput.toLowerCase();
  
  switch(currentStep) {
    case ORDEN_STEPS.SUCURSAL:
      const sucursal = SUCURSALES.find(s => 
        lower.includes(s.nombre.toLowerCase()) || 
        lower.includes("reforma") && s.nombre.includes("Reforma") ||
        lower.includes("insurgentes") && s.nombre.includes("Insurgentes") ||
        lower.includes("condesa") && s.nombre.includes("Condesa")
      );
      if (sucursal) order.sucursal = sucursal.nombre;
      break;
      
    case ORDEN_STEPS.TIPO_BEBIDA:
      const producto = findProductInMenu(userInput);
      if (producto) order.bebida = producto.nombre;
      break;
      
    case ORDEN_STEPS.TAMANO:
      if (lower.includes("corto") || lower.includes("tall") || lower.includes("chico")) order.tamano = "Corto";
      else if (lower.includes("alto") || lower.includes("tall")) order.tamano = "Alto (12oz - 350ml)";
      else if (lower.includes("grande") || lower.includes("mediano")) order.tamano = "Grande (16oz - 437ml)";
      else if (lower.includes("venti")) order.tamano = "Venti (20oz - 606ml)";
      break;
      
    case ORDEN_STEPS.LECHE:
      const leche = menu.extras.leches.find(l => lower.includes(l.toLowerCase()));
      if (leche) order.leche = leche;
      break;
      
    case ORDEN_STEPS.SHOTS_EXTRA:
      if (lower.includes("no") || lower.includes("sin")) order.shots_extra = 0;
      else if (lower.includes("1") || lower.includes("uno")) order.shots_extra = 1;
      else if (lower.includes("2") || lower.includes("dos")) order.shots_extra = 2;
      else order.shots_extra = 0;
      break;
      
    case ORDEN_STEPS.ENDULZANTE:
      const endulzante = menu.extras.endulzantes.find(e => lower.includes(e.toLowerCase()));
      order.endulzante = endulzante || "Normal";
      break;
      
    case ORDEN_STEPS.JARABES:
      if (lower.includes("no") || lower.includes("sin")) order.jarabes = [];
      else order.jarabes = menu.extras.jarabes.filter(j => lower.includes(j.toLowerCase()));
      break;
      
    case ORDEN_STEPS.TOPPINGS:
      if (lower.includes("no") || lower.includes("sin")) order.toppings = null;
      else {
        const topping = menu.extras.toppings.find(t => lower.includes(t.toLowerCase()));
        if (topping) order.toppings = topping;
      }
      break;
      
    case ORDEN_STEPS.ALIMENTO:
      if (lower.includes("no") || lower.includes("sin")) order.alimento = "ninguno";
      else {
        const alimento = [...menu.alimentos_salados || [], ...menu.postres || [], ...menu.panaderia || []]
          .find(a => lower.includes(a.nombre.toLowerCase()));
        order.alimento = alimento ? alimento.nombre : "ninguno";
      }
      break;
      
    case ORDEN_STEPS.METODO_PAGO:
      if (lower.includes("efectivo")) order.metodoPago = "Efectivo";
      else if (lower.includes("tarjeta")) order.metodoPago = "Tarjeta bancaria";
      else if (lower.includes("starbucks")) order.metodoPago = "Starbucks Card";
      break;
      
    case ORDEN_STEPS.CONFIRMAR:
      if (/(sí|si|correcto|está bien|así está bien)/i.test(lower)) {
        order.confirmado = true;
      }
      break;
  }
}

function getTimeContext(userProfile = "general", clima = "templado") {
  const hour = new Date().getHours();
  const ctx = MENU.metadata.contextos;

  let momento = "mañana";
  if (hour >= 12 && hour < 19) momento = "tarde";
  else if (hour >= 19 || hour < 6) momento = "noche";

  let sugerencias = ctx[momento]?.sugerencias || [];

  if (clima === "frio" && ctx.clima.frio) {
    sugerencias = [...sugerencias, ...ctx.clima.frio.slice(0, 2)];
  } else if (clima === "calido" && ctx.clima.calido) {
    sugerencias = [...sugerencias, ...ctx.clima.calido.slice(0, 2)];
  } else if (clima === "lluvioso" && ctx.clima.lluvioso) {
    sugerencias = [...sugerencias, ...ctx.clima.lluvioso.slice(0, 2)];
  }

  if (userProfile && ctx.perfil[userProfile]) {
    sugerencias = [...sugerencias, ...ctx.perfil[userProfile].slice(0, 2)];
  }

  sugerencias = [...new Set(sugerencias)].slice(0, 6);

  return { momento, clima, userProfile, mensaje: ctx[momento]?.mensaje || "", sugerencias };
}

function getSuggestions(currentOrder) {
  const timeContext = getTimeContext();

  if (!currentOrder.sucursal) {
    return SUCURSALES.map(s => s.nombre);
  }

  if (!currentOrder.bebida) {
    return timeContext.sugerencias;
  }

  if (currentOrder.bebida && !currentOrder.alimento) {
    return [
      "Croissant de jamón y queso",
      "Panini caprese",
      "Pan de plátano",
      "Brownie"
    ];
  }

  if (currentOrder.bebida && currentOrder.alimento && !currentOrder.jarabes) {
    return [
      "Agregar jarabe de vainilla",
      "Agregar jarabe de caramelo",
      "Sin jarabe"
    ];
  }

  if (currentOrder.bebida && currentOrder.tamano && currentOrder.leche) {
    return ["Confirmar pedido", "Cambiar tamaño"];
  }

  return timeContext.sugerencias;
}

// =========================
// CARGAR MENÚ
// =========================
let MENU = {};

function loadMenu() {
  try {
    const menuPath = path.join(__dirname, "menu_simplificadov3.json");
    const menuData = fs.readFileSync(menuPath, "utf-8");
    MENU = JSON.parse(menuData);
    console.log(" Menú cargado correctamente");
  } catch (error) {
    console.error("❌ Error cargando menú:", error.message);
    process.exit(1);
  }
}

loadMenu();

// =========================
// PROMPT DE SISTEMA MEJORADO
// =========================
function generateSystemPrompt(menu, sessionId, sessionContext, getTimeContext, userName = "Lidy") {
  const session = sessionId && sessionContext.get ? sessionContext.get(sessionId) : null;
  const order = session?.currentOrder || {};
  const currentStep = getCurrentStep(order);
  const timeContext = getTimeContext(order.userProfile || "general", order.clima || "templado");

  let stepGuide = "";

  switch (currentStep) {
    case ORDEN_STEPS.SUCURSAL:
      stepGuide = `
🏪 PASO: SELECCIONAR SUCURSAL
Pregunta: "¡Hola ${userName}! ¿En qué sucursal deseas recoger tu pedido?"
Opciones:
${SUCURSALES.map(s => `- ${s.nombre}`).join('\n')}
`;
      break;

    case ORDEN_STEPS.TIPO_BEBIDA:
      stepGuide = `
☕ PASO: SELECCIONAR BEBIDA
Sucursal elegida: ${order.sucursal}
Pregunta: "¿Qué te gustaría tomar hoy?"
Sugerencias del momento: ${timeContext.sugerencias.slice(0, 3).join(", ")}
`;
      break;

    case ORDEN_STEPS.TAMANO:
      const producto = findProductInMenu(order.bebida);
      const tamanosDisponibles = producto?.tamanos || [];
      stepGuide = `
📏 PASO: TAMAÑO
Bebida: ${order.bebida}
Pregunta: "¿Qué tamaño prefieres?"
Tamaños disponibles: ${tamanosDisponibles.filter(t => t && t !== "" && t !== "-").join(", ")}
`;
      break;

    case ORDEN_STEPS.LECHE:
      stepGuide = `
🥛 PASO: TIPO DE LECHE
Pregunta: "¿Con qué tipo de leche?"
Opciones: ${menu.extras.leches.slice(0, 5).join(", ")}
`;
      break;

    case ORDEN_STEPS.SHOTS_EXTRA:
      stepGuide = `
➕ PASO: SHOTS EXTRA
Pregunta: "¿Deseas shots de espresso extra? Cada uno cuesta $10"
`;
      break;

    case ORDEN_STEPS.ENDULZANTE:
      stepGuide = `
🍬 PASO: ENDULZANTE
Pregunta: "¿Qué endulzante prefieres?"
Opciones: ${menu.extras.endulzantes.join(", ")}
`;
      break;

    case ORDEN_STEPS.JARABES:
      stepGuide = `
🍯 PASO: JARABES
Pregunta: "¿Deseas agregar algún jarabe?"
Opciones: ${menu.extras.jarabes.slice(0, 4).join(", ")}
`;
      break;

    case ORDEN_STEPS.TOPPINGS:
      stepGuide = `
✨ PASO: TOPPINGS
Pregunta: "¿Algún topping?"
Opciones: ${menu.extras.toppings.join(", ")}
`;
      break;

    case ORDEN_STEPS.ALIMENTO:
      stepGuide = `
🍞 PASO: ALIMENTO
Pregunta: "¿Deseas acompañar con algo de comer?"
Sugerencias: Croissant, Panini, Sandwich
`;
      break;

    case ORDEN_STEPS.METODO_PAGO:
      stepGuide = `
💳 PASO: MÉTODO DE PAGO
Pregunta: "¿Cómo vas a pagar?"
Opciones y beneficios:
- Efectivo o Tarjeta bancaria: Ganas 1 estrella por cada $20
- Starbucks Card: ¡Ganas 1 estrella por cada $10!
`;
      break;

    case ORDEN_STEPS.CONFIRMAR:
      const total = calculateOrderPrice(order, menu);
      const estrellas = calculateStars(total, order.metodoPago);
      stepGuide = `
 PASO: CONFIRMAR PEDIDO
Resumen:
- ${order.bebida} ${order.tamano || ""}
${order.leche ? `- Con leche ${order.leche}` : ''}
${order.alimento && order.alimento !== "ninguno" ? `- ${order.alimento}` : ''}
- Sucursal: ${order.sucursal}
- Método de pago: ${order.metodoPago}

💰 Total: $${total} MXN
⭐ Estrellas a ganar: ${estrellas}

Pregunta: "¿Confirmas tu pedido?"
`;
      break;

    case ORDEN_STEPS.FINALIZAR:
      const finalTotal = calculateOrderPrice(order, menu);
      const finalEstrellas = calculateStars(finalTotal, order.metodoPago);
      stepGuide = `
🎉 PASO: PEDIDO COMPLETADO
Mensaje: "¡Listo! Tu pedido está confirmado.
💰 Total: $${finalTotal} MXN
⭐ Ganaste ${finalEstrellas} estrellas
📍 Recoge en: ${order.sucursal}
¡Gracias por usar Caffi!"
`;
      break;
  }

  return `Eres Caffi, asistente de Starbucks México. Habla en español, conciso y amigable.

${stepGuide}

⚙️ REGLAS:
- Máximo 30 palabras por respuesta
- Una pregunta a la vez
- Usa los nombres exactos del menú
- Cuando menciones métodos de pago, siempre incluye los beneficios de estrellas

📋 Pedido actual:
${order.sucursal ? `✓ Sucursal: ${order.sucursal}` : ''}
${order.bebida ? `✓ Bebida: ${order.bebida}` : ''}
${order.tamano ? `✓ Tamaño: ${order.tamano}` : ''}
${order.leche ? `✓ Leche: ${order.leche}` : ''}
${order.alimento ? `✓ Alimento: ${order.alimento}` : ''}
${order.metodoPago ? `✓ Pago: ${order.metodoPago}` : ''}
`;
}

// =========================
// ENDPOINT: Chat
// =========================
app.post("/chat", async (req, res) => {
  const userName = req.body.userName || "Lidy";
  const { userInput, history = [], sessionId = "default" } = req.body;
  const isFirstMessage = history.length === 0;

  try {
    if (!sessionContext.has(sessionId)) {
      sessionContext.set(sessionId, {
        currentOrder: {},
        orderHistory: [],
        startTime: Date.now()
      });
    }

    const session = sessionContext.get(sessionId);

    const cacheKey = `${userInput.toLowerCase()}-${history.length}-${sessionId}`;
    if (responseCache.has(cacheKey)) {
      const cached = responseCache.get(cacheKey);
      console.log(`⚡ Caché hit`);
      return res.json({
        reply: cached,
        cached: true,
        context: session.currentOrder
      });
    }

    const systemPrompt = generateSystemPrompt(
      MENU,
      sessionId,
      sessionContext,
      getTimeContext,
      userName
    );

    let messages = [{ role: "system", content: systemPrompt }];

    if (isFirstMessage && (!userInput || userInput.trim() === "")) {
      const greeting = `¡Hola ${userName}! Soy Caffi. ¿En qué sucursal deseas recoger tu pedido? Tenemos: ${SUCURSALES.map(s => s.nombre.split(' ')[1]).join(', ')}`;
      return res.json({
        reply: greeting,
        context: session.currentOrder,
        suggestions: SUCURSALES.map(s => s.nombre)
      });
    }

    messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userInput }
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
        frequency_penalty: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    let reply = data?.choices?.[0]?.message?.content?.trim() ?? "(sin respuesta)";
    reply = cleanTextForTTS(reply);

    updateOrderContext(session, userInput, reply);

    const responseTime = Date.now() - startTime;
    console.log(`🤖 LLM: ${responseTime}ms`);

    if (responseCache.size >= MAX_CACHE_SIZE) {
      const firstKey = responseCache.keys().next().value;
      responseCache.delete(firstKey);
    }
    responseCache.set(cacheKey, reply);

    return res.json({
      reply,
      responseTime,
      context: session.currentOrder,
      suggestions: getSuggestions(session.currentOrder),
      orderComplete: session.currentOrder.completed || false,
      orderData: session.currentOrder.completed ? {
        orderNumber: session.currentOrder.orderNumber,
        total: session.currentOrder.total,
        estrellas: session.currentOrder.estrellas,
        items: {
          bebida: session.currentOrder.bebida,
          tamano: session.currentOrder.tamano,
          leche: session.currentOrder.leche,
          alimento: session.currentOrder.alimento,
          sucursal: session.currentOrder.sucursal,
          metodoPago: session.currentOrder.metodoPago
        }
      } : null
    });
  } catch (e) {
    console.error("❌ Error LLM:", e.response?.data || e.message);
    return res.status(500).json({
      error: "LLM error",
      details: e.response?.data || e.message
    });
  }
});

// =========================
// FUNCIÓN: Actualizar contexto
// =========================
function updateOrderContext(session, userInput, botReply) {
  const order = session.currentOrder;
  const lower = userInput.toLowerCase();

  console.log("🧠 Actualizando contexto:", userInput);

  // Detectar sucursal
  const sucursal = SUCURSALES.find(s => 
    lower.includes(s.nombre.toLowerCase()) ||
    (lower.includes("reforma") && s.nombre.includes("Reforma")) ||
    (lower.includes("insurgentes") && s.nombre.includes("Insurgentes")) ||
    (lower.includes("condesa") && s.nombre.includes("Condesa"))
  );
  if (sucursal) order.sucursal = sucursal.nombre;

  // Detectar bebida
  const bebida = findProductInMenu(userInput);
  if (bebida) order.bebida = bebida.nombre;

  // Detectar tamaño
  if (lower.includes("tall") || lower.includes("chico") || lower.includes("corto")) order.tamano = "Corto";
  else if (lower.includes("alto")) order.tamano = "Alto (12oz - 350ml)";
  else if (lower.includes("grande") || lower.includes("mediano")) order.tamano = "Grande (16oz - 437ml)";
  else if (lower.includes("venti")) order.tamano = "Venti (20oz - 606ml)";

  // Detectar leche
  const leche = MENU.extras.leches.find(l => lower.includes(l.toLowerCase()));
  if (leche) order.leche = leche;

  // Detectar endulzante
  const endulzante = MENU.extras.endulzantes.find(e => lower.includes(e.toLowerCase()));
  if (endulzante) order.endulzante = endulzante;

  // Detectar jarabes
  const jarabesSeleccionados = MENU.extras.jarabes.filter(j => lower.includes(j.toLowerCase()));
  if (jarabesSeleccionados.length > 0) order.jarabes = jarabesSeleccionados;

  // Detectar topping
  const topping = MENU.extras.toppings.find(t => lower.includes(t.toLowerCase()));
  if (topping) order.toppings = topping;

  // Detectar alimento
  if (lower.includes("no") || lower.includes("sin")) {
    if (!order.alimento) order.alimento = "ninguno";
  } else {
    const alimento = [...MENU.alimentos_salados || [], ...MENU.postres || [], ...MENU.panaderia || []]
      .find(a => lower.includes(a.nombre.toLowerCase()));
    if (alimento) order.alimento = alimento.nombre;
  }

  // Detectar método de pago
  if (lower.includes("efectivo")) order.metodoPago = "Efectivo";
  else if (lower.includes("tarjeta")) order.metodoPago = "Tarjeta bancaria";
  else if (lower.includes("starbucks")) order.metodoPago = "Starbucks Card";

  // Detectar confirmación
  if (/(sí|si|correcto|está bien)/i.test(lower)) {
    order.confirmado = true;
  }

  // Verificar si está finalizado
  const isFinalizado = order.bebida && order.sucursal && order.metodoPago && order.confirmado;

  if (isFinalizado && !order.completed) {
    const total = calculateOrderPrice(order, MENU);
    const estrellas = calculateStars(total, order.metodoPago);
    const orderNumber = generateOrderNumber();

    order.total = total;
    order.estrellas = estrellas;
    order.orderNumber = orderNumber;
    order.completed = true;

    session.orderHistory.push({
      ...order,
      timestamp: Date.now(),
      status: "completed"
    });

    console.log("🎉 Pedido completado:", { orderNumber, total, estrellas });
  }
}

function generateOrderNumber() {
  const day = String(new Date().getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 9000) + 1000);
  return `SBX${day}${random}`;
}

function cleanTextForTTS(text) {
  return text
    .replace(/\$/g, ' pesos')
    .replace(/&/g, ' y ')
    .replace(/[{}[\]]/g, '')
    .replace(/\*/g, '')
    .replace(/"|"/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// =========================
// ENDPOINT: TTS
// =========================
app.post("/speak", async (req, res) => {
  try {
    let { text } = req.body;
    if (!text) return res.status(400).json({ error: "Falta texto" });
    if (!OPENAI_API_KEY) return res.status(503).json({ error: "OpenAI API key no configurada" });

    text = cleanTextForTTS(text);
    const startTime = Date.now();

    const response = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      { model: "tts-1", voice: "nova", input: text, speed: 1.0 },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        responseType: "arraybuffer",
        timeout: 8000
      }
    );

    const responseTime = Date.now() - startTime;
    console.log(`🔊 TTS: ${responseTime}ms`);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": response.data.length,
      "Cache-Control": "public, max-age=3600"
    });
    res.send(Buffer.from(response.data));
  } catch (error) {
    console.error("❌ TTS:", error.message);
    return res.status(500).json({ error: "Error TTS" });
  }
});

// =========================
// OTROS ENDPOINTS
// =========================
app.get("/menu", (req, res) => {
  res.json({ success: true, menu: MENU });
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "OK",
    nvidia: NVIDIA_API_KEY ? "✓" : "✗",
    openai: OPENAI_API_KEY ? "✓" : "✗",
    cache_size: responseCache.size,
    active_sessions: sessionContext.size
  });
});

app.post("/cache/clear", (req, res) => {
  responseCache.clear();
  sessionContext.clear();
  res.json({ success: true, message: "Caché limpiado" });
});

app.get("/session/:id", (req, res) => {
  const { id } = req.params;
  const session = sessionContext.get(id);
  
  if (!session) {
    return res.status(404).json({ error: "Sesión no encontrada" });
  }
  
  res.json({
    sessionId: id,
    currentOrder: session.currentOrder,
    orderHistory: session.orderHistory,
    duration: Date.now() - session.startTime
  });
});

app.get("/sucursales", (req, res) => {
  res.json({
    success: true,
    sucursales: SUCURSALES
  });
});

app.post("/order/complete", (req, res) => {
  const { sessionId } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId requerido" });
  }
  
  const session = sessionContext.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Sesión no encontrada" });
  }
  
  const order = session.currentOrder;
  const total = calculateOrderPrice(order, MENU);
  const estrellas = calculateStars(total, order.metodoPago);
  const orderNumber = generateOrderNumber();
  
  const finalOrder = {
    ...order,
    total,
    estrellas,
    orderNumber,
    timestamp: Date.now(),
    status: "completed"
  };
  
  session.orderHistory.push(finalOrder);
  session.currentOrder = {};
  
  res.json({
    success: true,
    order: finalOrder,
    message: `Pedido completado. Total: ${total}. Estrellas ganadas: ${estrellas}`
  });
});

// =========================
// INICIAR SERVIDOR
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const timeContext = getTimeContext();
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║   STARBUCKS VOICE ASSISTANT V2.0      ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\n🌐 Servidor: http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`\n🔑 APIs configuradas:`);
  console.log(`   ${NVIDIA_API_KEY ? "ok" : "error"} NVIDIA`);
  console.log(`   ${OPENAI_API_KEY ? "ok" : "error"} OpenAI`);
  console.log(`\n Menú cargado:`);
  console.log(`   ☕ Calientes: ${MENU.bebidas_calientes?.length || 0}`);
  console.log(`     Frías: ${MENU.bebidas_frias?.length || 0}`);
  console.log(`    Alimentos: ${(MENU.alimentos_salados?.length || 0) + (MENU.postres?.length || 0)}`);
  console.log(`    Sucursales: ${SUCURSALES.length}`);
  console.log(`\n Contexto: ${timeContext.momento}`);
  console.log(` Sugerencias: ${timeContext.sugerencias.slice(0, 3).join(", ")}`);
  console.log(`\n Servidor listo para recibir pedidos\n`);
});