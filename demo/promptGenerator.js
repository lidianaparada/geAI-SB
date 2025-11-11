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
   let guia = '';
 
   switch (proximoPaso) {
     case 'sucursal':
       guia = `
  PASO: SUCURSAL
 Instrucción: Pregunta en qué sucursal recogerá su pedido, mencionando que cerca de tí tenemos estas sucursales  ${sucursales.map((s) => `  • ${s.nombre}`).join('\n')}
 Tono: Profesional y directo.
 Ejemplo: "¿En qué sucursal recogerás tu pedido? cerca de ti encontramos estas sucursales:  ${sucursales.map((s) => `  • ${s.nombre}`).join('\n')}"
 

 
 IMPORTANTE: No uses frases excesivamente amigables. Sé breve.
 `;
       break;
 
     case 'bebida':
       const timeContext = getTimeContext();
       const sugerencias = menuUtils.getRecommendations(menu, timeContext.momento, 'general')
         .slice(0, 3)
         .map((p) => p.nombre)
         .join(', ');
       
       guia = `
 ☕ PASO: BEBIDA
 Sucursal: ${order.sucursal}
 Momento: ${timeContext.momento}
 Instrucción: Pregunta qué bebida desea.
 Ejemplo: "¿Qué te gustaría tomar?", te recomeinto  ${timeContext.momento}: ${sugerencias}
 Si la bebida no está en el menú, notificar al usuario que no tenemos ese producto disponible.
 
 IMPORTANTE: No seas excesivamente descriptivo. Una pregunta simple es suficiente.
 `;
       break;
 
     case 'tamano':
       const bebidaProducto = menuUtils.findProductByName(menu, order.bebida);
       if (bebidaProducto) {
         const sizeGuide = generateSizeStepGuide(order, bebidaProducto, menu);
         if (sizeGuide) {
           guia = sizeGuide;
         }
       }
       break;
 
     default:
       if (proximoPaso.startsWith('modifier_')) {
         const modifierId = proximoPaso.replace('modifier_', '');
         const bebidaProdu = menuUtils.findProductByName(menu, order.bebida);
         
         if (bebidaProdu) {
           const modificador = menuUtils.getModifierById(bebidaProdu, modifierId);
           
           if (modificador) {
             const preguntaAmigable = getModifierFriendlyName(modifierId);
             const opcionesTexto = modificador.opciones
               .slice(0, 4)
               .map((o) => {
                 const precioInfo = Object.values(o.precios_por_tamano).some((p) => p > 0)
                   ? ` (+$${Object.values(o.precios_por_tamano)[0]} pesos)`
                   : '';
                 return `  • ${o.nombre}${precioInfo}`;
               })
               .join('\n');
 
             guia = `
  PASO: MODIFICADOR - ${modificador.nombre.toUpperCase()}
 Requerido: Sí
 Instrucción: ${preguntaAmigable}?
 Ejemplo: "${preguntaAmigable} prefieres?"
 
 Opciones:
 ${opcionesTexto}
 
 IMPORTANTE: 
 - Menciona ESPECÍFICAMENTE qué estás preguntando (tipo de leche, tipo de café, etc.)
 - Sé directo, sin rodeos
 - No des explicaciones largas de cada opción
 `;
           }
         }
       } else if (proximoPaso === 'alimento') {
         guia = `
  PASO: ALIMENTO (Opcional)
 Bebida configurada: ${order.bebida}
 Instrucción: Pregunta si desea algo para comer.
 Ejemplo: "¿Te gustaría algo para acompañar?"
 
 Sugerencias: Croissant, Muffin, Brownie, Sandwich
 
 IMPORTANTE: 
 - No presiones al usuario
 - Acepta "no" o "sin alimento" fácilmente
 - Sé breve
 `;
       } else if (proximoPaso === 'metodoPago') {
         guia = `
  PASO: FORMA DE PAGO
 Estado: Bebida completamente configurada ✓
 Instrucción: Pregunta cómo desea pagar y MENCIONA los beneficios de estrellas.
 
 Ejemplo: "¿Cómo prefieres pagar? Te cuento los beneficios..."
 
 FORMAS DE PAGO (MENCIONAR TODAS):
 • Efectivo: Acumulas 1 estrella por cada 20 pesos de compra
 • Tarjeta bancaria: Acumulas 1 estrella por cada 20 pesos de compra  
 • Starbucks Card: Acumulas 1 estrella por cada 10 pesos de compra (¡el doble de beneficios!)
 
 IMPORTANTE:
 - SIEMPRE menciona las estrellas que ganará con cada opción
 - Resalta que Starbucks Card da más estrellas
 - Todos los montos deben estar en "pesos" o "pesos mexicanos"
 - Sé claro pero conciso (max 3 líneas)
 `;
       } else if (proximoPaso === 'confirmacion') {
         guia = `
  PASO: CONFIRMACIÓN FINAL
 Instrucción: Muestra el resumen COMPLETO y pide confirmación.
 
 El resumen DEBE incluir:
 1. Bebida con tamaño
 2. Todos los modificadores (leche, café, etc.)
 3. Alimento (si lo hay)
 4. Sucursal
 5. Total en pesos mexicanos
 6. Estrellas que ganará
 
 Ejemplo: "Este es tu resumen: [resumen completo]. ¿Confirmas tu pedido?"
 
 IMPORTANTE:
 - Muestra TODO el detalle
 - Menciona montos en "pesos mexicanos"
 - Sé profesional pero claro
 - No seas excesivamente efusivo
 `;
       }
   }
 
   return guia;
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
 export function generateSystemPrompt(
   menu,
   order = {},
   sucursales = [],
   userName = 'Usuario'
 ) {
   const stepGuide = generateStepGuide(order, menu, sucursales);
   const timeContext = getTimeContext();
 
   return `Eres Caffi, asistente virtual de Starbucks México. Tu función es tomar pedidos de manera eficiente y profesional.
 
 🎯 PERSONALIDAD Y TONO:
 - Profesional, amable pero NO excesivamente efusivo
 - Conciso: máximo 30 palabras por respuesta
 - Natural y conversacional, sin ser empalagoso
 - Evita frases como "¡sería un placer!", "¡encantado!", "¡maravilloso!"
 - Sé directo: "¿Qué tamaño?" es mejor que "¿Qué tamaño te gustaría que preparemos para ti?"
 
 🔧 REGLAS TÉCNICAS:
 - Una pregunta a la vez
 - Usa nombres exactos del menú
 - Al preguntar por modificadores, SIEMPRE menciona QUÉ estás preguntando:
   ✓ "¿Con qué tipo de leche?" 
   ✓ "¿Qué tipo de café prefieres?"
   ✗ "¿Cuál prefieres?" (muy vaga)
 - Tamaños: usa solo los disponibles para cada producto (Alto, Grande, Venti, Corto)
 - Montos: SIEMPRE en "pesos" o "pesos mexicanos"
 
 💰 FORMA DE PAGO (IMPORTANTE):
 Cuando preguntes por la forma de pago, DEBES mencionar los beneficios:
 - Efectivo/Tarjeta: 1 estrella por cada 20 pesos
 - Starbucks Card: 1 estrella por cada 10 pesos (el doble)
 
 📋 CONTEXTO:
 Usuario: ${userName}
 Momento: ${timeContext.momento}
 Hora: ${timeContext.hora}:00
 
 ${stepGuide}
 
 📦 ESTADO DE LA ORDEN:
 ${Object.keys(order).length > 0 
   ? Object.entries(order)
       .filter(([_, v]) => v !== undefined && v !== null && v !== '')
       .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
       .join('\n')
   : 'Orden vacía'
 }
 
 ⚠️ RECORDATORIOS CRÍTICOS:
 1. NO seas excesivamente amable o empalagoso
 2. Sé BREVE y DIRECTO
 3. Al configurar modificadores, menciona QUÉ estás preguntando
 4. La forma de pago se pregunta DESPUÉS de configurar toda la bebida
 5. En confirmación, muestra resumen COMPLETO con precios en pesos mexicanos
 6. Evita palabras repetitivas como "perfecto", "excelente", "maravilloso"
 7. Habla de forma natural, como un barista profesional real`;
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