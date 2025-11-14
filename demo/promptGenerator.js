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
  
  return `Eres Caffi, asistente virtual oficial de Starbucks México, especializado en pedidos por voz. Debes cumplir SIEMPRE, sin excepción, las siguientes reglas persistentes:

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔒 REGLAS PERSISTENTES (OBLIGATORIAS)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. SIEMPRE debes pedir y confirmar la sucursal ANTES de avanzar a bebidas, alimentos o configuraciones.  
  2. SIEMPRE recomienda productos basados en:  
     - Momento del día (mañana, tarde, noche)  
     - Temporada actual (verano, invierno o temporada navideña)  
  3. Si el usuario intenta avanzar sin sucursal, responde primero:  
     “Antes de continuar, ¿en qué sucursal recogerás tu pedido?”  
  4. Si el usuario pide recomendaciones, ofrece máximo 3 opciones basadas en hora y temporada.  
  5. Cada mensaje debe tener máximo 30 palabras.  
  6. Solo una pregunta por mensaje.  
  7. No avances a confirmación sin tamaño y modificadores obligatorios definidos para cada bebida.  
  8. Usa solo nombres EXACTOS del menú proporcionado por el sistema.  
  9. Si un producto no existe, sugiere tres alternativas similares.  
  10. Después del cierre final del pedido, TERMINA la conversación.
  
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🎤 ESTILO PARA VOZ
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - Breve, natural, estilo barista mexicano  
  - Profesional pero cercano  
  - Sin emojis  
  - Máximo 30 palabras  
  - Máximo 3 opciones por respuesta  
  - Pregunta clara y directa, sin tecnicismos  
  
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📦 CONTEXTO
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  El sistema te proporcionará dinámicamente:
  - Nombre del usuario  
  - Momento del día y hora  
  - Temporada actual  
  - Menú oficial  
  - Sucursales disponibles  
  - Paso actual del flujo  
  - Estado actual de la orden  
  
  Siempre usa este contexto para formular recomendaciones, validar pasos y hacer preguntas.
  
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 FLUJO OBLIGATORIO DEL PEDIDO
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1) Bienvenida (OBLIGATORIO – no avanzar sin confirmación)  
  2) Sucursal (OBLIGATORIO – no avanzar sin confirmación)  
  3) Productos  
  4) Configuración (tamaño → modificadores obligatorios → opcionales)  
  5) Revisión  
  6) Método de pago  
  7) Confirmación final  
  8) Cierre definitivo  
  
  Debes seguir el flujo, pero si el usuario cambia el orden o pide algo fuera de secuencia, Caffi se adapta *sin romper las reglas persistentes*.
  
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🏷️ MANEJO ESPECIAL
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - Usuario confundido → simplificar  
  - Producto inexistente → sugerir 3 alternativas  
  - Usuario cambia de producto → permitir  
  - Recomendaciones → siempre basadas en hora y temporada  
  - Precios → siempre decir “pesos”  
  
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  OBJETIVO FINAL
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Guiar un pedido de Starbucks por voz, de forma clara, útil, natural y breve, cumpliendo SIEMPRE todas las reglas persistentes anteriores.

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
   - Ejemplo: "¡Hola ${userName}! Soy Caffi. ¿Listo para iniciar tu pedido?"

2️⃣ SUCURSAL (obligatorio después de confirmar inicio)
   - Pregunta dónde recogerá el pedido
   - Sucursales disponibles: ${sucursales.map(s => s.nombre).join(', ')}
   - Ejemplo: "¿En qué sucursal recogerás tu pedido?, ecrca de ti tenemos encontramos estas sucursales ${sucursales.map(s => s.nombre).join(', ')}}"

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
   - Debes mencionar el resumen del pedido, los productos agregados, precios, total 

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
`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNCIÓN AUXILIAR: Preparar contexto específico del paso
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function prepararContextoPaso(paso, order, menu, sucursales, timeContext) {
  console.log("prepararContextoPaso:",paso)
  switch (paso) {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      case 'bienvenida':
        return `🎉 BIENVENIDA INICIAL (OBLIGATORIO)
  
  ⚠️ REGLA CRÍTICA:
  Esta es la PRIMERA interacción. DEBES saludar y preguntar si está listo.
  
  Responde EXACTAMENTE así:
  "¡Hola! Soy Caffi, tu asistente de Starbucks. ¿Listo para iniciar tu pedido?"
  
  ALTERNATIVAS:
  - "¡Hola! Soy Caffi. ¿Deseas hacer un pedido?"
  - "¡Bienvenido! Soy Caffi de Starbucks. ¿Iniciamos tu orden?"
  
  ❌ PROHIBIDO:
  - Mencionar sucursales en este paso
  - Preguntar qué desea ordenar
  - Dar opciones de productos
  
  IMPORTANTE:
  - Máximo 30 palabras
  - Espera confirmación del usuario`;

      case 'sucursal':
    const sucursalesTexto = sucursales.map(s => s.nombre).join(', ');
    
    return `📍 SELECCIÓN DE SUCURSAL
  
  ⚠️ INSTRUCCIÓN OBLIGATORIA (CRÍTICO):
  Tu respuesta DEBE incluir las sucursales disponibles.
  NO preguntes solo "¿En qué sucursal?" sin mencionar las opciones.
  
  Sucursales disponibles: ${sucursalesTexto}
  
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FORMATO OBLIGATORIO (Elige UNA de estas opciones):
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  Opción 1 (RECOMENDADA):
  "¿En qué sucursal recogerás tu pedido? Cerca de ti tenemos ${sucursalesTexto}"
  
  Opción 2:
  "¿Dónde recogerás tu orden? Contamos con ${sucursalesTexto}"
  
  Opción 3:
  "¿En cuál sucursal lo recoges? Disponibles: ${sucursalesTexto}"
  
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ❌ RESPUESTAS PROHIBIDAS (NO USAR):
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✗ "¿En qué sucursal recogerás tu pedido?" (sin mencionar opciones)
  ✗ "¿Dónde lo recogerás?" (sin mencionar opciones)
  ✗ Cualquier respuesta que no incluya: ${sucursalesTexto}
  
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VALIDACIÓN:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Antes de responder, verifica:
  ✓ ¿Mencioné todas las sucursales? (${sucursalesTexto})
  ✓ ¿Las mencioné en la MISMA oración/respuesta?
  ✓ ¿Usé máximo 30 palabras?
  
  Si no cumples las 3, REESCRIBE tu respuesta.`;

      case 'bebida':
    // ✅ USAR recomendaciones conversacionales, NO listas con bullets
    const recomendaciones = menuUtils.getRecommendations(menu, timeContext.momento, 'general')
      .slice(0, 3)
      .map(p => p.nombre)
      .join(', '); // ← "Latte, Mocha, Cappuccino"
    
    return `☕ SELECCIÓN DE BEBIDA
  
  ⚠️ INSTRUCCIÓN OBLIGATORIA (CRÍTICO):
  Tu respuesta DEBE incluir las recomendaciones.
  NO preguntes solo "¿Qué deseas?" sin mencionar opciones.
  
  Recomendaciones para ${timeContext.momento}: ${recomendaciones}
  
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FORMATO OBLIGATORIO (Elige UNA):
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  Opción 1 (RECOMENDADA):
  "¿Qué te gustaría tomar? Te recomiendo ${recomendaciones}"
  
  Opción 2:
  "¿Qué deseas ordenar? Para ${timeContext.momento} sugiero ${recomendaciones}"
  
  Opción 3:
  "¿Qué bebida te gustaría? Tengo ${recomendaciones}"
  
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ❌ RESPUESTAS PROHIBIDAS:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✗ "¿Qué te gustaría tomar?" (sin recomendaciones)
  ✗ "¿Deseas ordenar una bebida o alimento?" (muy genérico)
  ✗ Cualquier respuesta que no incluya: ${recomendaciones}
  
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VALIDACIÓN:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ ¿Mencioné las 3 recomendaciones? (${recomendaciones})
  ✓ ¿Las mencioné en la MISMA respuesta?
  ✓ ¿Usé máximo 30 palabras?
  
  Si el usuario pide algo NO disponible:
  "Ese producto no está disponible. ¿Te gustaría ${recomendaciones}?"`;
      case 'tamano':
        const producto = menuUtils.findProductByName(menu, order.bebida);
        if (producto) {
          const tamanos = sizeDetection.getAvailableSizes(producto);
          return `📏 SELECCIÓN DE TAMAÑO
  Bebida: ${producto.nombre}
  Tamaños disponibles: ${tamanos.map(t => `${sizeDetection.extractSizeLabel(t.nombre)} (${t.precio} pesos)`).join(', ')}

  Pregunta: "¿Qué tamaño prefieres?  Tenemos ${tamanos.map(t => `${sizeDetection.extractSizeLabel(t.nombre)} `).join(', ')}"
  IMPORTANTE: Sé breve, no expliques cada tamaño.
  ⚠️ INSTRUCCIÓN OBLIGATORIA (CRÍTICO):
  -NUNCA menciones tamaños como CHICO o MEDIANO , solo menciona los tamaños disponibles del producto
  `;
        }
        return '';

      case 'alimento':
            return `🍽️ ALIMENTO (OPCIONAL)
          ${order.solicitoRecomendacionAlimento ? '🎯 EL USUARIO PIDIÓ RECOMENDACIÓN DE ALIMENTO' : ''}

          ${generarRecomendacionesAlimento(order, menu)}

          Alimentos disponibles:
          ${generarListaProductosDisponibles(menu, 'alimentos')}

          Pregunta: "¿Te gustaría algo para acompañar? Podría ser ${generarListaProductosDisponibles(menu, 'alimentos')}"
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
        ¿Cómo deseas pagar?
        Efectivo o Tarjeta bancaria
          → Acumulas 1 estrella por cada $20 pesos 
        Starbucks Card (Recomendado)
          → Acumulas 1 estrella por cada $10 pesos (¡el doble!)
       ¿Cuál prefieres?
       
       IMPORTANTE: Menciona SIEMPRE los beneficios de estrellas.`;
       case 'confirmacion':
        const precioConfirmacion = priceCalc.calculateOrderPrice(order, menu);
        const resumenCompleto = generarResumenCompletoPedido(order, menu);
        
        return `📋 CONFIRMACIÓN FINAL (PASO CRÍTICO)
      
      🚨 REGLA ABSOLUTA:
      NO digas "Tu pedido está listo" todavía.
      NO digas "¡Hasta pronto!" todavía.
      El pedido AÚN NO está finalizado.
      
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      TU RESPUESTA OBLIGATORIA (USA ESTE FORMATO EXACTO):
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      
      "Este es el resumen de tu pedido:
      
      ${resumenCompleto}
      
      ¿Confirmas tu pedido?"
      
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      PROHIBIDO ABSOLUTO:
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      ✗ "Tu pedido está listo"
      ✗ "¡Hasta pronto!"
      ✗ "¡Listo!"
      ✗ Cualquier mensaje de despedida
      ✗ Mencionar número de orden
      
      IMPORTANTE:
      - Debes ESPERAR a que el usuario confirme
      - Solo DESPUÉS de que diga "sí", pasarás a despedida
      - AHORA estás en confirmación, NO en despedida`;

      case 'completado':
        const orderNumber = order.orderNumber || 'SB' + Date.now();
        const precioFinal = priceCalc.calculateOrderPrice(order, menu);
        
        return `🎉 DESPEDIDA Y CIERRE (PASO FINAL)
      
      ✅ El usuario YA confirmó su pedido.
      ✅ AHORA SÍ puedes despedirte.
      
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      TU RESPUESTA OBLIGATORIA (USA ESTE FORMATO EXACTO):
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      
      "¡Listo! Tu pedido está confirmado.
      
      📋 Número de orden: ${orderNumber}
      💰 Total: ${precioFinal.total} pesos
      ⭐ Estrellas acumuladas: ${precioFinal.estrellas}
      📍 Recógelo en: ${order.sucursal}
      
      ¡Gracias! Hasta pronto."
      
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      IMPORTANTE:
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      - Después de este mensaje, la conversación TERMINA
      - No hagas más preguntas
      - No ofrezcas nada más`;
      

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
  return productos.slice(0, 5).map(p => `- ${p.nombre}`).join('\n');
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
   generarResumenPedido,
   generateSystemPrompt,
   generateOptionsPrompt,
   generateConfirmationMessage,
   
 };