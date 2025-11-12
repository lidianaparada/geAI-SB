/**
 * promptGenerator v3.5 - VERSIÓN MEJORADA
 * 
 * CORRECCIONES APLICADAS:
 * ✅ Tono profesional y conciso (menos empalagoso)
 * ✅ Mencionar QUÉ modificador se está configurando
 * ✅ Explicación clara de beneficios por forma de pago
 * ✅ Todos los montos en "pesos mexicanos"
 * ✅ Resumen completo con todos los detalles
 */

 import * as menuUtils from './menuUtils.js';
 import * as sizeDetection from './sizeDetection.js';
 import * as orderValidation from './orderValidation.js';
 import * as priceCalc from './priceCalculator.js';
 
 /**
  * Obtener contexto de tiempo
  */
 export function getTimeContext() {
   const hora = new Date().getHours();
   const momento = 
     hora >= 6 && hora < 12 ? 'mañana' :
     hora >= 12 && hora < 19 ? 'tarde' : 'noche';
 
   return {
     hora,
     momento,
     timestamp: new Date().toISOString(),
   };
 }
 
 /**
  * ✅ MEJORADO: Obtener nombre amigable del modificador
  */
 function getModifierFriendlyName(modifierId) {
   const nombres = {
     'tipo_leche': '¿Con qué tipo de leche',
     'tipo_cafe': '¿Con qué tipo de café',
     'tipo_grano': '¿Qué tipo de grano',
     'splash_leche': '¿Quieres un toque de leche',
     'crema_batida': '¿Deseas crema batida',
     'tipo_molido': '¿Qué tipo de molido',
     'intensidad': '¿Qué intensidad',
     'adicionales': '¿Algún adicional'
   };
   
   // Buscar coincidencia parcial
   for (const [key, nombre] of Object.entries(nombres)) {
     if (modifierId.toLowerCase().includes(key)) {
       return nombre;
     }
   }
   
   // Por defecto, usar el ID limpio
   return `¿Qué ${modifierId.replace(/_/g, ' ')}`;
 }
 
 /**
  * Generar paso para tamaño
  */
 export function generateSizeStepGuide(order, producto, menu) {
   const availableSizes = sizeDetection.getAvailableSizes(producto);
   
   if (!sizeDetection.requiresSize(producto)) {
     return null;
   }
 
   if (availableSizes.length === 0) {
     return `Este producto no tiene opciones de tamaño.`;
   }
 
   const sizeOptions = availableSizes
     .map(size => {
       const label = sizeDetection.extractSizeLabel(size.nombre);
       const price = size.precio > 0 ? ` (+$${size.precio} pesos)` : '';
       return `  • ${label}${price}`;
     })
     .join('\n');
 
   return `
 📏 PASO: TAMAÑO
 Bebida: ${producto.nombre}
 Instrucción: Pregunta directamente qué tamaño prefiere.
 Ejemplo: "¿Qué tamaño prefieres?"
 
 Tamaños disponibles:
 ${sizeOptions}
 
 IMPORTANTE: Sé breve y directo. No expliques cada tamaño.
 `;
 }
 
 /**
  * ✅ MEJORADO: Generar guía de paso con tono profesional
  */
export function generateStepGuide(order, menu, sucursales) {
  const proximoPaso = orderValidation.suggestNextStep(order, menu);

  switch (proximoPaso) {
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    case 'sucursal':
      const listaSucursales = sucursales.map(s => s.nombre).join(', ');
      const cantidadSucursales = sucursales.length;
      
      const sucursalesParaVoz = cantidadSucursales > 1
        ? sucursales.slice(0, 2).map(s => s.nombre).join(', ') + ', entre otras'
        : listaSucursales;
      
      return `📍 SELECCIÓN DE SUCURSAL

⚠️ REGLA ABSOLUTA:
Debes mencionar las sucursales disponibles EN LA MISMA respuesta inicial.
NO esperes a que el usuario pregunte.

Sucursales disponibles: ${listaSucursales}

🎤 PARA VOZ, responde EXACTAMENTE así:
"¿En qué sucursal recogerás tu pedido? Cerca de ti tenemos: ${sucursalesParaVoz}"

ALTERNATIVAS ACEPTABLES (elige una):
- "¿Dónde recogerás tu pedido? Contamos con: ${sucursalesParaVoz}"
- "¿En cuál sucursal lo recoges? Disponibles: ${sucursalesParaVoz}"

❌ PROHIBIDO responder solo:
- "¿En qué sucursal recogerás tu pedido?" (SIN mencionar opciones)
- "¿Dónde lo recogerás?" (SIN mencionar opciones)

FORMATO:
- Una sola oración
- Máximo 25 palabras
- Sin bullets (•), sin saltos de línea
- Menciona sucursales separadas por comas`;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    case 'bebida':
      const timeContext = getTimeContext();
      const sugerencias = menuUtils.getRecommendations(menu, timeContext.momento, 'general')
        .slice(0, 3)
        .map((p) => p.nombre)
        .join(', ');
      
      return `☕ PASO: BEBIDA
Sucursal: ${order.sucursal}
Momento: ${timeContext.momento}

Instrucción CRÍTICA: 
1. Pregunta qué bebida desea
2. DEBES mencionar las sugerencias disponibles
3. Usa EXACTAMENTE este formato:

"¿Qué te gustaría tomar? Te recomiendo: ${sugerencias}. También puedes decirme tu bebida favorita."

SUGERENCIAS DISPONIBLES PARA ${timeContext.momento}:
${sugerencias}

⚠️ IMPORTANTE: 
- SIEMPRE menciona las 3 sugerencias
- NO inventes bebidas, usa SOLO las de la lista
- Sé breve pero INCLUYE las sugerencias`;

 case 'tamano':
      const bebidaProducto = menuUtils.findProductByName(menu, order.bebida);
      
      if (!bebidaProducto) {
        return `⚠️ ERROR: No se encontró la bebida "${order.bebida}" en el menú.
Pregunta nuevamente qué bebida desea.`;
      }
      
      const sizeGuide = generateSizeStepGuide(order, bebidaProducto, menu);
      
      if (sizeGuide) {
        return sizeGuide;
      }
      
      // Si no requiere tamaño
      return `ℹ️ La bebida "${order.bebida}" no requiere selección de tamaño.
Continúa al siguiente paso sin preguntar por tamaño.`;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    case 'alimento':
      return `🍽️ PASO: ALIMENTO (Opcional)
Bebida configurada: ${order.bebida}

Instrucción: Pregunta si desea algo para comer.

Responde: "¿Te gustaría algo para acompañar? Tenemos croissants, muffins, brownies y sandwiches"

IMPORTANTE: 
- No presiones al usuario
- Acepta "no" o "sin alimento" fácilmente
- Sé breve (máximo 20 palabras)`;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    case 'metodoPago':
      return `💳 PASO: FORMA DE PAGO
Estado: Bebida completamente configurada ✓

Instrucción: Pregunta cómo desea pagar y MENCIONA los beneficios de estrellas.

Responde: "¿Cómo prefieres pagar? Con efectivo o tarjeta acumulas 1 estrella cada 20 pesos. Con Starbucks Card acumulas 1 estrella cada 10 pesos, ¡el doble!"

FORMAS DE PAGO (MENCIONAR TODAS):
- Efectivo: 1 estrella por cada 20 pesos
- Tarjeta bancaria: 1 estrella por cada 20 pesos  
- Starbucks Card: 1 estrella por cada 10 pesos (¡el doble!)

IMPORTANTE:
- SIEMPRE menciona las estrellas
- Resalta que Starbucks Card da más estrellas
- Todos los montos en "pesos" o "pesos mexicanos"
- Máximo 30 palabras`;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    case 'confirmacion':
      return `📋 PASO: CONFIRMACIÓN FINAL

Instrucción: Muestra el resumen COMPLETO y pide confirmación.

El resumen DEBE incluir:
1. Bebida con tamaño
2. Todos los modificadores (leche, café, etc.)
3. Alimento (si lo hay)
4. Sucursal
5. Total en pesos mexicanos
6. Estrellas que ganará

Responde: "Este es tu resumen: [resumen completo]. ¿Confirmas tu pedido?"

IMPORTANTE:
- Muestra TODO el detalle
- Menciona montos en "pesos mexicanos"
- Sé profesional pero claro
- No seas excesivamente efusivo`;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    default:
      // Manejo de modificadores
      if (proximoPaso.startsWith('modifier_')) {
        const modifierId = proximoPaso.replace('modifier_', '');
        const bebidaProdu = menuUtils.findProductByName(menu, order.bebida);
        
        if (!bebidaProdu) {
          return `⚠️ ERROR: No se encontró la bebida para configurar modificadores.
Pregunta nuevamente qué bebida desea.`;
        }
        
        const modificador = menuUtils.getModifierById(bebidaProdu, modifierId);
        
        if (!modificador) {
          return `⚠️ ERROR: Modificador "${modifierId}" no encontrado.
Continúa al siguiente paso.`;
        }
        
        const preguntaAmigable = getModifierFriendlyName(modifierId);
        const opcionesLista = modificador.opciones
          .slice(0, 4)
          .map(o => o.nombre)
          .join(', ');
        
        return `🔧 PASO: MODIFICADOR - ${modificador.nombre.toUpperCase()}
Requerido: Sí
Bebida: ${order.bebida}

Opciones disponibles: ${opcionesLista}

Responde: "${preguntaAmigable} prefieres? Tenemos ${opcionesLista}"

IMPORTANTE: 
- Menciona ESPECÍFICAMENTE qué estás preguntando (tipo de leche, tipo de café, etc.)
- Sé directo, sin rodeos
- No des explicaciones largas de cada opción
- Máximo 25 palabras`;
      }
      
      // ⚠️ Fallback para pasos no reconocidos
      return `⚠️ Paso no reconocido: "${proximoPaso}"

Analiza el estado de la orden y pregunta lo siguiente que falte:
- Si no hay sucursal → pregunta sucursal
- Si no hay bebida → pregunta bebida
- Si no hay tamaño → pregunta tamaño
- Si no hay modificadores → pregunta modificadores
- Si no hay alimento → pregunta alimento
- Si no hay método de pago → pregunta método de pago

Mantén el tono profesional y conciso.`;
  }
}
 
 /**
  * ✅ MEJORADO: Resumen con formato claro y todos los detalles
  */
 export function generarResumenPedido(order, menu) {
   const lineas = [];
 
   // Bebida con todos sus modificadores
   if (order.bebida) {
     const producto = menuUtils.findProductByName(menu, order.bebida);
     if (producto) {
       let bebidaTexto = `• ${order.bebida}`;
       
       // Tamaño
       if (order.tamano) {
         const sizeName = sizeDetection.getSizeName(producto, order.tamano);
         if (sizeName) {
           bebidaTexto += ` - ${sizeDetection.extractSizeLabel(sizeName)}`;
         }
       }
       lineas.push(bebidaTexto);
 
       // Modificadores
       if (order.modificadores && Array.isArray(order.modificadores)) {
         for (const mod of order.modificadores) {
           const grupo = menuUtils.getModifierById(producto, mod.grupoId);
           const opcion = menuUtils.getModifierOption(grupo, mod.opcionId);
           if (grupo && opcion) {
             lineas.push(`  - ${grupo.nombre}: ${opcion.nombre}`);
           }
         }
       }
     } else {
       lineas.push(`• ${order.bebida}`);
     }
   }
 
   // Alimento
   if (order.alimento && order.alimento !== 'ninguno') {
     lineas.push(`• ${order.alimento}`);
   }
 
   // Sucursal
   if (order.sucursal) {
     lineas.push(`• Sucursal: ${order.sucursal}`);
   }
 
   // Forma de pago
   if (order.metodoPago) {
     lineas.push(`• Forma de pago: ${order.metodoPago}`);
   }
 
   return lineas.length > 0 ? lineas.join('\n') : '';
 }
 
 /**
  * ✅ MEJORADO: System prompt con tono profesional y menos empalagoso
  */

 
 export function generateSystemPrompt(menu, order = {}, sucursales = [], userName = 'Usuario') {
  const timeContext = getTimeContext();
  const proximoPaso = orderValidation.suggestNextStep(order, menu);
  
  // Preparar contexto dinámico según el paso
  const contextoDelPaso = prepararContextoPaso(proximoPaso, order, menu, sucursales, timeContext);
  
  return `Eres Caffi, asistente virtual de Starbucks México especializado en pedidos por voz.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 TU MISIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tomar pedidos de forma eficiente, natural y profesional mediante conversación por voz.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 PERSONALIDAD PARA VOZ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Conciso: máximo 25-30 palabras por respuesta (importante para voz)
✓ Natural: habla como un barista real, no como un robot
✓ Profesional pero cercano: evita ser empalagoso
✓ Directo: una pregunta a la vez
✓ Tolerante: entiende variaciones ("capuchino" = "capuccino")

EVITA:
✗ Frases largas o complejas
✗ Listas extensas (máximo 3 opciones en voz)
✗ Palabras repetitivas: "perfecto", "excelente", "maravilloso"
✗ Jerga técnica o términos confusos

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 CONTEXTO ACTUAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Usuario: ${userName}
Momento: ${timeContext.momento} (${timeContext.hora}:00)
Paso actual: ${proximoPaso}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 ESTADO DE LA ORDEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${generarEstadoOrden(order)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 FLUJO DE PASOS (Importante: el orden puede variar según el usuario)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ BIENVENIDA (obligatorio al inicio)
   - Saluda y confirma si está listo para ordenar
   - Ejemplo: "¡Hola ${userName}! Soy Caffi. ¿Listo para tu pedido?"

2️⃣ SUCURSAL (obligatorio después de confirmar inicio)
   - Pregunta dónde recogerá el pedido
   - Sucursales disponibles: ${sucursales.map(s => s.nombre).join(', ')}
   - Ejemplo: "¿En qué sucursal recogerás tu pedido?"

3️⃣ PRODUCTOS (orden flexible - bebidas, alimentos, o ambos)
   - El usuario decide el orden (primero bebida o primero alimento)
   - Si pide algo que NO existe, sugiere alternativas del menú
   - Si pide recomendación, usa el momento del día

4️⃣ CONFIGURACIÓN DE BEBIDA (si pidió bebida)
   a) Siempre pregunta primero el tamaño si aplica para el producto
   b) Modificadores obligatorios (tipo de leche, café, etc.)
   c) Modificadores opcionales (temperatura, crema, etc.)

5️⃣ REVISIÓN
   - Pregunta si desea agregar algo más o terminar
   - Resume lo que lleva hasta ahora

6️⃣ MÉTODO DE PAGO
   - Explica beneficios de estrellas:
     * Efectivo/Tarjeta: 1 estrella cada 20 pesos
     * Starbucks Card: 1 estrella cada 10 pesos (¡el doble!)
   - Ejemplo: "¿Cómo pagarás? Con Starbucks Card acumulas el doble de estrellas"

7️⃣ CONFIRMACIÓN FINAL
   - Muestra resumen completo: productos, precios, estrellas
   - Pide confirmación: "¿Todo correcto?"

8️⃣ DESPEDIDA Y CIERRE
   - Muestra número de orden
   - Indica sucursal de retiro
   - Di: "Tu pedido está listo. ¡Hasta pronto!" (esto TERMINA la conversación)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 INSTRUCCIONES PARA EL PASO ACTUAL: ${proximoPaso.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${contextoDelPaso}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ REGLAS CRÍTICAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Usa SOLO nombres exactos del menú proporcionado arriba
2. Si el usuario menciona algo no disponible, di: "Ese producto no está disponible. ¿Te gustaría [sugerencia1], [sugerencia2] o [sugerencia3]?"
3. Precios SIEMPRE en "pesos" o "pesos mexicanos"
4. Al preguntar modificadores, especifica QUÉ preguntas: "¿Con qué tipo de leche?" (NO solo "¿Cuál prefieres?")
5. Una pregunta a la vez (importante para voz)
6. Respuestas de máximo 30 palabras
7. Cuando termines el pedido (paso 8), la conversación DEBE TERMINAR. No hagas más preguntas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 ADAPTACIÓN PARA VOZ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Menciona máximo 3 opciones a la vez
- Usa números solo si es necesario: "Tengo Grande o Venti"
- Evita símbolos o emojis (el TTS no los lee bien)
- Sé claro con los precios: "Grande, 75 pesos" (no "$75")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 MANEJO DE CASOS ESPECIALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Usuario confundido: reformula la pregunta de forma más simple
- Producto no encontrado: sugiere 3 alternativas similares
- Usuario cambia de opinión: permite modificar sin problemas
- Usuario pide recomendación: usa momento del día y preferencias detectadas`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCIÓN AUXILIAR: Preparar contexto específico del paso
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function prepararContextoPaso(paso, order, menu, sucursales, timeContext) {
  switch (paso) {
    case 'bienvenida':
      return `🎉 PRIMERA INTERACCIÓN
Tu respuesta debe ser:
"¡Hola ${order.userName || 'Usuario'}! Soy Caffi, tu asistente de Starbucks.
Estoy aquí para ayudarte. ¿Listo para ordenar?"

NO menciones sucursales aún. Espera confirmación.`;

    case 'sucursal':
      const sucursalesTexto = sucursales.map(s => s.nombre).join(', ');
      return `📍 SELECCIÓN DE SUCURSAL
Pregunta: "¿En qué sucursal recogerás tu pedido?, cerca de ti tenemos : ${sucursalesTexto} "`;


    case 'bebida':
      const recomendaciones = menuUtils.getRecommendations(menu, timeContext.momento, 'general')
        .slice(0, 3)
        .map(p => p.nombre);
      const listaBebidas= generarListaProductosDisponibles(menu, 'bebidas');
      

      return `☕ SELECCIÓN DE BEBIDA
Pregunta: "¿Qué te gustaría tomar? Te recomiendo: ${listaBebidas}. También puedes decirme tu bebida favorita."
IMPORTANTE:
Si el usuario pide algo NO disponible, responde:
"[Producto] no está en el menú. ¿Te gustaría algo como ${recomendaciones.join(', ')}?"`;

    case 'tamano':
      const producto = menuUtils.findProductByName(menu, order.bebida);
      if (producto) {
        const tamanos = sizeDetection.getAvailableSizes(producto);
        return `📏 SELECCIÓN DE TAMAÑO
Bebida: ${producto.nombre}
Tamaños disponibles: ${tamanos.map(t => `${sizeDetection.extractSizeLabel(t.nombre)} (${t.precio} pesos)`).join(', ')}

Pregunta: "¿Qué tamaño prefieres?"
IMPORTANTE: Sé breve, no expliques cada tamaño.`;
      }
      return '';

    case 'alimento':
      return `🍽️ ALIMENTO (OPCIONAL)
${order.solicitoRecomendacionAlimento ? '🎯 EL USUARIO PIDIÓ RECOMENDACIÓN DE ALIMENTO' : ''}

${generarRecomendacionesAlimento(order, menu)}

Alimentos disponibles:
${generarListaProductosDisponibles(menu, 'alimentos')}

Pregunta: "¿Te gustaría algo para acompañar?"
Acepta fácilmente si dice "no" o "sin alimento".`;

    case 'revision':
      const precioInfo = priceCalc.calculateOrderPrice(order, menu);
      return `✅ REVISIÓN DE PEDIDO
Muestra resumen breve:
${generarResumenBrevePedido(order, menu)}
Total hasta ahora: ${precioInfo.total} pesos

Pregunta: "¿Deseas agregar algo más o continuamos?"`;

    case 'metodoPago':
      const precio = priceCalc.calculateOrderPrice(order, menu);
      const estrellasEfectivo = Math.floor(precio.total / 20);
      const estrellasCard = Math.floor(precio.total / 10);
      
      return `💳 MÉTODO DE PAGO
Total del pedido: ${precio.total} pesos

Pregunta así:
"¿Cómo pagarás? Con efectivo o tarjeta acumulas ${estrellasEfectivo} estrellas. Con Starbucks Card, ${estrellasCard} estrellas, ¡el doble!"

IMPORTANTE: Menciona SIEMPRE los beneficios de estrellas.`;

    case 'confirmacion':
      return `📋 CONFIRMACIÓN FINAL
Muestra resumen COMPLETO:
${generarResumenCompletoPedido(order, menu)}

Pregunta: "¿Confirmas tu pedido?"

Si dice SÍ, pasa al paso de despedida.`;

    default:
      if (paso.startsWith('modifier_')) {
        const modId = paso.replace('modifier_', '');
        const prod = menuUtils.findProductByName(menu, order.bebida);
        const modificador = menuUtils.getModifierById(prod, modId);
        
        if (modificador) {
          const opciones = modificador.opciones.slice(0, 4).map(o => o.nombre).join(', ');
          const nombreAmigable = obtenerNombreModificadorAmigable(modId);
          
          return `🔧 MODIFICADOR: ${modificador.nombre.toUpperCase()}
Este modificador es OBLIGATORIO.

Pregunta: "${nombreAmigable} prefieres?"
Opciones: ${opciones}

CRÍTICO: Menciona específicamente QUÉ estás preguntando (tipo de leche, café, etc.)`;
        }
      }
      return '';
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCIONES AUXILIARES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generarEstadoOrden(order) {
  if (Object.keys(order).length === 0) return 'Orden vacía - iniciando';
  
  const campos = [];
  if (order.sucursal) campos.push(`Sucursal: ${order.sucursal}`);
  if (order.bebida) campos.push(`Bebida: ${order.bebida}`);
  if (order.tamano) campos.push(`Tamaño: ${order.tamano}`);
  if (order.alimento && order.alimento !== 'ninguno') campos.push(`Alimento: ${order.alimento}`);
  if (order.modificadores?.length) campos.push(`Modificadores: ${order.modificadores.length} configurados`);
  if (order.metodoPago) campos.push(`Pago: ${order.metodoPago}`);
  
  return campos.join('\n') || 'Orden en proceso';
}

function generarListaProductosDisponibles(menu, tipo) {
  let productos = [];
  
  if (tipo === 'bebidas') {
    ['bebidas_calientes', 'bebidas_frias', 'te', 'frappuccino', 'productos_temporada'].forEach(cat => {
      if (menu[cat]) productos.push(...menu[cat].filter(p => p.disponible !== false));
    });
  } else if (tipo === 'alimentos') {
    ['alimentos_salados', 'alimentos_dulces', 'alimentos_saludables', 'panaderia'].forEach(cat => {
      if (menu[cat]) productos.push(...menu[cat].filter(p => p.disponible !== false));
    });
  }
  
  // Tomar los primeros 15 para no saturar el prompt
  return productos.slice(0, 15).map(p => `- ${p.nombre}`).join('\n');
}

function generarRecomendacionesPorPreferencia(order, menu, timeContext) {
  if (!order.solicitoRecomendacion) return '';
  
  const preferencia = order.preferenciaRecomendacion || '';
  let texto = '';
  
  if (preferencia === 'frio') {
    texto = 'Usuario prefiere: BEBIDAS FRÍAS\nSugiere de: bebidas_frias, frappuccino';
  } else if (preferencia === 'caliente') {
    texto = 'Usuario prefiere: BEBIDAS CALIENTES\nSugiere de: bebidas_calientes';
  } else if (preferencia === 'dulce') {
    texto = 'Usuario prefiere: BEBIDAS DULCES\nSugiere: mochas, frappuccinos, caramelos';
  } else if (preferencia === 'cafe') {
    texto = 'Usuario prefiere: CON CAFEÍNA\nSugiere: espressos, americanos, lattes';
  } else if (preferencia === 'sin cafe') {
    texto = 'Usuario prefiere: SIN CAFEÍNA\nSugiere: tés, chocolates, refreshers';
  } else {
    // Sugerencias por momento del día
    const recomendaciones = menuUtils.getRecommendations(menu, timeContext.momento, 'general')
      .slice(0, 3)
      .map(p => p.nombre)
      .join(', ');
    texto = `Recomendaciones para ${timeContext.momento}: ${recomendaciones}`;
  }
  
  return texto;
}

function generarRecomendacionesAlimento(order, menu) {
  if (!order.solicitoRecomendacionAlimento) return '';
  
  const preferencia = order.preferenciaAlimento || '';
  let texto = '';
  
  if (preferencia === 'salado') {
    texto = 'Usuario prefiere: ALIMENTOS SALADOS\nSugiere de: alimentos_salados';
  } else if (preferencia === 'dulce') {
    texto = 'Usuario prefiere: ALIMENTOS DULCES\nSugiere de: alimentos_dulces, postres';
  } else if (preferencia === 'saludable') {
    texto = 'Usuario prefiere: OPCIONES SALUDABLES\nSugiere de: alimentos_saludables';
  } else if (preferencia === 'desayuno') {
    texto = 'Usuario prefiere: PARA DESAYUNO\nSugiere: muffins, croissants, bagels, sandwiches';
  } else {
    // Mix general
    texto = 'Sugiere un mix: 2 salados, 2 dulces, 1 saludable';
  }
  
  return texto;
}

function generarResumenBrevePedido(order, menu) {
  const lineas = [];
  if (order.bebida) lineas.push(`• ${order.bebida}`);
  if (order.alimento && order.alimento !== 'ninguno') lineas.push(`• ${order.alimento}`);
  return lineas.join('\n') || '(vacío)';
}

function generarResumenCompletoPedido(order, menu) {
  const precioInfo = priceCalc.calculateOrderPrice(order, menu);
  let resumen = '';
  
  if (precioInfo.detalles) {
    for (const detalle of precioInfo.detalles) {
      resumen += `• ${detalle.nombre}`;
      if (detalle.tamano && detalle.tamano !== 'N/A') resumen += ` - ${detalle.tamano}`;
      resumen += `: ${detalle.precio} pesos\n`;
    }
  }
  
  resumen += `• Sucursal: ${order.sucursal}\n`;
  resumen += `━━━━━━━━━━━━━━━━\n`;
  resumen += `💰 Total: ${precioInfo.total} pesos mexicanos\n`;
  resumen += `⭐ Estrellas: ${precioInfo.estrellas}`;
  
  return resumen;
}

function obtenerNombreModificadorAmigable(modId) {
  const nombres = {
    'tipo_leche': '¿Con qué tipo de leche',
    'tipo_cafe': '¿Con qué tipo de café',
    'tipo_grano': '¿Qué tipo de grano',
    'splash_leche': '¿Quieres un toque de leche',
    'crema_batida': '¿Deseas crema batida',
    'tipo_molido': '¿Qué tipo de molido',
    'intensidad': '¿Qué intensidad',
    'adicionales': '¿Algún adicional'
  };
  
  for (const [key, nombre] of Object.entries(nombres)) {
    if (modId.toLowerCase().includes(key)) return nombre;
  }
  
  return `¿Qué ${modId.replace(/_/g, ' ')}`;
}
 /**
  * Generar prompt para opciones
  */
 export function generateOptionsPrompt(paso, menu, opciones = [], producto = null) {
   const opcionesTexto = opciones
     .slice(0, 5)
     .map((o, i) => `${i + 1}. ${o}`)
     .join('\n');
 
   let prompt = '';
 
   switch (paso) {
     case 'sucursal':
       prompt = `Opciones:\n${opcionesTexto}`;
       break;
     case 'bebida':
       prompt = `Sugerencias:\n${opcionesTexto}`;
       break;
     case 'tamaño':
       if (producto) {
         const tamaños = sizeDetection.getSizeSuggestions(producto);
         prompt = `Tamaños:\n${tamaños.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
       } else {
         prompt = `Tamaños:\n${opcionesTexto}`;
       }
       break;
     default:
       prompt = `Opciones:\n${opcionesTexto}`;
   }
 
   return prompt;
 }
 
 /**
  * ✅ MEJORADO: Mensaje de confirmación final con todos los detalles
  */
 export function generateConfirmationMessage(order, menu, numeroOrden) {
   // Calcular precio dinámicamente
   //const priceCalc = require('./priceCalculator.js');
   const precioInfo = priceCalc.calculateOrderPrice(order, menu);
   
   const total = precioInfo?.total || 0;
   const estrellas = precioInfo?.estrellas || 0;
   
   const resumen = generarResumenPedido(order, menu);
   
   return `¡Listo! Tu pedido ha sido confirmado.
 
 ${resumen}
 
  Total: $${total} pesos mexicanos
  Estrellas acumuladas: ${estrellas}
  Número de orden: ${numeroOrden}
 
 Recoge tu pedido en ${order.sucursal}. ¡Gracias!`;
 }
 
 export default {
   getTimeContext,
   generateSizeStepGuide,
   generateStepGuide,
   generarResumenPedido,
   generateSystemPrompt,
   generateOptionsPrompt,
   generateConfirmationMessage,
 };