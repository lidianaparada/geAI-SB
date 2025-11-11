/**
 * priceCalculator.js
 * Cálculo preciso de precios usando la estructura correcta del menú
 */

 import * as menuUtils from './menuUtils.js';

 /**
  * Calcular precio total de una orden
  * @param {Object} order - Orden con estructura {bebida, tamano, modificadores, alimento, metodoPago}
  * @param {Object} menu - Menú completo
  * @returns {Object} {valido, precio_base, precio_modificadores, precio_alimento, total, detalles}
  */
Pricecalculator con tamanos · JS
Copiar

/**
 * ✅ calculateOrderPrice - VERSIÓN CORRECTA
 * Lee precios del array tamaños según el tamaño seleccionado
 */

export function calculateOrderPrice(order, menu) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`💰 calculateOrderPrice() INICIANDO`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   📦 Orden:`, JSON.stringify(order, null, 2));
  
  let total = 0;
  let estrellas = 0;
  const detalles = [];
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1️⃣ PRECIO DE LA BEBIDA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  if (order.bebida) {
    console.log(`\n   🍹 PROCESANDO BEBIDA`);
    console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   🔍 Buscando: "${order.bebida}"`);
    
    const bebida = findProductByName(menu, order.bebida);
    
    if (bebida) {
      console.log(`   ✅ BEBIDA ENCONTRADA: ${bebida.nombre} (ID: ${bebida.id})`);
      console.log(`   📐 Tamaño en orden: "${order.tamano}"`);
      
      // ⭐ OBTENER PRECIO SEGÚN TAMAÑO
      const precioInfo = obtenerPrecioPorTamano(bebida, order.tamano);
      
      if (precioInfo.precio > 0) {
        console.log(`   💵 Precio encontrado: $${precioInfo.precio}`);
        console.log(`   📏 Tamaño: ${precioInfo.tamanoNombre}`);
        
        total += precioInfo.precio;
        
        detalles.push({
          tipo: 'bebida',
          nombre: bebida.nombre,
          tamano: precioInfo.tamanoNombre,
          precio: precioInfo.precio
        });
        
        console.log(`   ✅ Precio sumado al total: $${total}`);
      } else {
        console.error(`   ❌ No se encontró precio para tamaño "${order.tamano}"`);
        console.error(`   📦 Tamaños disponibles:`, bebida.tamaños || bebida.tamanos);
      }
      
    } else {
      console.error(`   ❌ BEBIDA NO ENCONTRADA: "${order.bebida}"`);
    }
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2️⃣ PRECIO DEL ALIMENTO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  if (order.alimento && order.alimento !== 'ninguno') {
    console.log(`\n   🍔 PROCESANDO ALIMENTO`);
    console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   🔍 Buscando: "${order.alimento}"`);
    
    const alimento = findProductByName(menu, order.alimento, 'alimento');
    
    if (alimento) {
      console.log(`   ✅ ALIMENTO ENCONTRADO: ${alimento.nombre} (ID: ${alimento.id})`);
      
      // ⭐ ALIMENTO: Obtener precio (puede tener tamaño o no)
      const precioInfo = obtenerPrecioPorTamano(alimento, null);
      
      if (precioInfo.precio > 0) {
        console.log(`   💵 Precio: $${precioInfo.precio}`);
        
        total += precioInfo.precio;
        
        detalles.push({
          tipo: 'alimento',
          nombre: alimento.nombre,
          precio: precioInfo.precio
        });
        
        console.log(`   ✅ Precio sumado al total: $${total}`);
      } else {
        console.error(`   ❌ No se encontró precio para el alimento`);
      }
      
    } else {
      console.error(`   ❌ ALIMENTO NO ENCONTRADO: "${order.alimento}"`);
    }
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3️⃣ CALCULAR ESTRELLAS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  console.log(`\n   ⭐ CALCULANDO ESTRELLAS`);
  console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  if (order.metodoPago) {
    console.log(`   💳 Método: ${order.metodoPago}`);
    console.log(`   💰 Total: $${total}`);
    
    if (order.metodoPago.toLowerCase().includes('starbucks card')) {
      estrellas = Math.floor(total / 10);
      console.log(`   ⭐ Starbucks Card: ${estrellas} estrellas`);
    } else {
      estrellas = Math.floor(total / 20);
      console.log(`   ⭐ Efectivo/Tarjeta: ${estrellas} estrellas`);
    }
  } else {
    console.log(`   ℹ️ Sin método de pago → 0 estrellas`);
    estrellas = 0;
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4️⃣ RESULTADO FINAL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 RESULTADO FINAL:`);
  console.log(`   💰 TOTAL: $${total}`);
  console.log(`   ⭐ ESTRELLAS: ${estrellas}`);
  console.log(`   📋 DETALLES:`, detalles);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  return {
    total,
    estrellas,
    detalles
  };
}

/**
 * ⭐ FUNCIÓN CLAVE: Obtener precio según tamaño
 */
function obtenerPrecioPorTamano(producto, tamanoSeleccionado) {
  console.log(`\n      💰 obtenerPrecioPorTamano()`);
  console.log(`         Producto: ${producto.nombre}`);
  console.log(`         Tamaño seleccionado: "${tamanoSeleccionado}"`);
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ESTRATEGIA 1: Buscar en array "tamaños" (con tilde)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  if (producto.tamaños && Array.isArray(producto.tamaños) && producto.tamaños.length > 0) {
    console.log(`         ✅ Tiene array "tamaños" (${producto.tamaños.length} opciones)`);
    
    // Si hay tamaño seleccionado, buscarlo
    if (tamanoSeleccionado) {
      // Buscar por ID (puede ser "2", "3", "4")
      let tamanoObj = producto.tamaños.find(t => t.id === tamanoSeleccionado);
      
      // Si no encuentra por ID, buscar por nombre parcial
      if (!tamanoObj) {
        const tamanoLower = tamanoSeleccionado.toLowerCase();
        tamanoObj = producto.tamaños.find(t => 
          t.nombre.toLowerCase().includes(tamanoLower) ||
          tamanoLower.includes(t.nombre.toLowerCase().substring(0, 5))
        );
      }
      
      if (tamanoObj && tamanoObj.precio) {
        console.log(`         ✅ Tamaño encontrado: ${tamanoObj.nombre} → $${tamanoObj.precio}`);
        return {
          precio: tamanoObj.precio,
          tamanoNombre: tamanoObj.nombre
        };
      }
    }
    
    // Si no se especificó tamaño o no se encontró, usar el primero disponible
    const primerTamano = producto.tamaños[0];
    if (primerTamano && primerTamano.precio) {
      console.log(`         ℹ️ Usando primer tamaño: ${primerTamano.nombre} → $${primerTamano.precio}`);
      return {
        precio: primerTamano.precio,
        tamanoNombre: primerTamano.nombre
      };
    }
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ESTRATEGIA 2: Usar "tamaño_default"
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  if (producto.tamaño_default && producto.tamaño_default.precio) {
    console.log(`         ✅ Usando tamaño_default: $${producto.tamaño_default.precio}`);
    return {
      precio: producto.tamaño_default.precio,
      tamanoNombre: producto.tamaño_default.nombre || 'N/A'
    };
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ESTRATEGIA 3: Usar "precio_base" (fallback)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  if (producto.precio_base) {
    console.log(`         ⚠️ Usando precio_base (fallback): $${producto.precio_base}`);
    return {
      precio: producto.precio_base,
      tamanoNombre: 'Único'
    };
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // NO SE ENCONTRÓ PRECIO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  console.error(`         ❌ NO SE ENCONTRÓ PRECIO`);
  console.error(`         📦 Estructura del producto:`, {
    tiene_tamanos: !!producto.tamaños,
    tiene_tamano_default: !!producto.tamaño_default,
    tiene_precio_base: !!producto.precio_base
  });
  
  return {
    precio: 0,
    tamanoNombre: 'N/A'
  };
}

 
 /**
  * Calcular estrellas ganadas según método de pago
  * @param {number} total - Monto total
  * @param {string} metodoPago - Método de pago
  * @returns {number} Estrellas ganadas
  */
 export function calculateStars(total, metodoPago) {
   if (!total || total <= 0) return 0;
   if (!metodoPago) return 0;
 
   const metodo = (metodoPago || '').toLowerCase();
 
   // Starbucks Card: 1 estrella por cada $10
   if (metodo.includes('starbucks')) {
     return Math.floor(total / 10);
   }
 
   // Otros métodos: 1 estrella por cada $20
   return Math.floor(total / 20);
 }
 
 /**
  * Obtener desglose de precios
  * @param {Object} order - Orden
  * @param {Object} menu - Menú
  * @returns {Object} Desglose detallado
  */
 export function getPriceBreakdown(order, menu) {
   const resultado = calculateOrderPrice(order, menu);
 
   if (!resultado.valido) {
     return resultado;
   }
 
   return {
     valido: true,
     items: [
       {
         tipo: 'Bebida',
         nombre: order.bebida,
         tamaño: order.tamano,
         precio: resultado.precio_bebida,
       },
       ...(resultado.precio_modificadores > 0
         ? [
             {
               tipo: 'Modificadores',
               detalles: order.modificadores?.map(
                 (m) =>
                   `${menuUtils.getModifierById(menuUtils.findProductByName(menu, order.bebida), m.grupoId).nombre}: ${menuUtils.getModifierOption(menuUtils.getModifierById(menuUtils.findProductByName(menu, order.bebida), m.grupoId), m.opcionId).nombre}`
               ),
               precio: resultado.precio_modificadores,
             },
           ]
         : []),
       ...(resultado.precio_alimento > 0
         ? [
             {
               tipo: 'Alimento',
               nombre: order.alimento,
               precio: resultado.precio_alimento,
             },
           ]
         : []),
     ],
     subtotal: resultado.total,
     metodoPago: order.metodoPago,
     estrellas: resultado.estrellas,
     total: resultado.total,
   };
 }
 
 /**
  * Validar que una orden tenga todos los datos requeridos para calcular precio
  * @param {Object} order - Orden
  * @param {Object} menu - Menú
  * @returns {Object} {valido, campos_faltantes}
  */
 export function validateOrderForPayment(order, menu) {
   const camposFaltantes = [];
 
   if (!order.bebida) {
     camposFaltantes.push('bebida');
   }
 
   if (!order.sucursal) {
     camposFaltantes.push('sucursal');
   }
 
   if (!order.metodoPago) {
     camposFaltantes.push('metodoPago');
   }
 
   // Validar tamaño si es requerido
   if (order.bebida) {
     const producto = menuUtils.findProductByName(menu, order.bebida);
     if (producto && menuUtils.requiresSize(producto) && !order.tamano) {
       camposFaltantes.push('tamano');
     }
 
     // Validar modificadores requeridos
     if (producto) {
       const requiredMods = menuUtils.getRequiredModifiers(producto);
       for (const requiredMod of requiredMods) {
         const hasModifier = order.modificadores?.some(
           (m) => m.grupoId === requiredMod.id
         );
         if (!hasModifier) {
           camposFaltantes.push(`modificador_${requiredMod.nombre}`);
         }
       }
     }
   }
 
   return {
     valido: camposFaltantes.length === 0,
     campos_faltantes: camposFaltantes,
   };
 }
 
 /**
  * Aplicar descuento (si lo hay)
  * @param {number} total - Total actual
  * @param {number} descuento - Descuento en porcentaje (0-100)
  * @returns {Object} {total_descuento, total_final}
  */
 export function applyDiscount(total, descuento = 0) {
   if (descuento < 0 || descuento > 100) {
     return { total_descuento: 0, total_final: total };
   }
 
   const monto_descuento = total * (descuento / 100);
   return {
     total_descuento: Math.round(monto_descuento * 100) / 100,
     total_final: Math.round((total - monto_descuento) * 100) / 100,
   };
 }
 
 /**
  * Comparar precios entre dos órdenes
  * @param {Object} order1 - Primera orden
  * @param {Object} order2 - Segunda orden
  * @param {Object} menu - Menú
  * @returns {Object} Comparación
  */
 export function compareOrders(order1, order2, menu) {
   const precio1 = calculateOrderPrice(order1, menu);
   const precio2 = calculateOrderPrice(order2, menu);
 
   if (!precio1.valido || !precio2.valido) {
     return {
       valido: false,
       error: 'No se pueden comparar órdenes inválidas',
     };
   }
 
   const diferencia = precio2.total - precio1.total;
 
   return {
     valido: true,
     orden1_total: precio1.total,
     orden2_total: precio2.total,
     diferencia: Math.abs(diferencia),
     mas_caro: diferencia > 0 ? 'orden2' : diferencia < 0 ? 'orden1' : 'igual',
     diferencia_porcentaje:
       ((diferencia / precio1.total) * 100).toFixed(2) + '%',
   };
 }
 
 export default {
   calculateOrderPrice,
   calculateStars,
   getPriceBreakdown,
   validateOrderForPayment,
   applyDiscount,
   compareOrders,
 };