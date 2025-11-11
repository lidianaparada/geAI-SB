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


/**
 * ✅ calculateOrderPrice - VERSIÓN CORRECTA
 * Lee precios del array tamaños según el tamaño seleccionado
 */

function normalizarTexto(texto) {
  if (!texto) return '';
  
  let normalizado = texto.toLowerCase();
  
  // Remover caracteres especiales comunes mal codificados
  normalizado = normalizado
    .replace(/Ã©/g, 'e')   // é mal codificado
    .replace(/Ã¡/g, 'a')   // á mal codificado
    .replace(/Ã­/g, 'i')   // í mal codificado
    .replace(/Ã³/g, 'o')   // ó mal codificado
    .replace(/Ãº/g, 'u')   // ú mal codificado
    .replace(/Ã±/g, 'n')   // ñ mal codificado
    .replace(/Â®/g, '')    // ® mal codificado
    .replace(/Â©/g, '')    // © mal codificado
    .replace(/Â´/g, '');   // ´ mal codificado
  
  // Normalización estándar
  normalizado = normalizado
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // Quitar acentos
    .replace(/[®©™]/g, "")             // Quitar símbolos
    .replace(/[^\w\s]/g, "")           // Quitar puntuación
    .replace(/\s+/g, " ")              // Espacios múltiples
    .trim();
  
  return normalizado;
}

/**
 * Buscar producto por nombre (con normalización mejorada)
 */
function findProductByName(menu, nombre, tipo = null) {
  console.log(`\n   🔎 findProductByName()`);
  console.log(`      Buscando: "${nombre}"`);
  console.log(`      Tipo: ${tipo || 'bebida'}`);
  
  const categorias = tipo === 'alimento'
    ? ['alimentos_salados', 'alimentos_dulces', 'alimentos_saludables', 'panaderia']
    : ['bebidas_calientes', 'bebidas_frias', 'frappuccino', 'bebidas_te'];
  
  const nombreNormalizado = normalizarTexto(nombre);
  console.log(`      Normalizado: "${nombreNormalizado}"`);
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1️⃣ BÚSQUEDA EXACTA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  for (const categoria of categorias) {
    if (!menu[categoria] || !Array.isArray(menu[categoria])) continue;
    
    for (const producto of menu[categoria]) {
      const productoNorm = normalizarTexto(producto.nombre);
      
      if (productoNorm === nombreNormalizado) {
        console.log(`      ✅ MATCH EXACTO: "${producto.nombre}" (${producto.id})`);
        return producto;
      }
    }
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2️⃣ BÚSQUEDA SIN ESPACIOS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  const sinEspacios = nombreNormalizado.replace(/\s+/g, "");
  
  for (const categoria of categorias) {
    if (!menu[categoria] || !Array.isArray(menu[categoria])) continue;
    
    for (const producto of menu[categoria]) {
      const productoSinEsp = normalizarTexto(producto.nombre).replace(/\s+/g, "");
      
      if (productoSinEsp === sinEspacios) {
        console.log(`      ✅ MATCH SIN ESPACIOS: "${producto.nombre}" (${producto.id})`);
        return producto;
      }
    }
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3️⃣ BÚSQUEDA POR PALABRAS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  const palabras = nombreNormalizado.split(/\s+/);
  let mejorMatch = null;
  let mejorScore = 0;
  
  for (const categoria of categorias) {
    if (!menu[categoria] || !Array.isArray(menu[categoria])) continue;
    
    for (const producto of menu[categoria]) {
      const productoNorm = normalizarTexto(producto.nombre);
      const palabrasProd = productoNorm.split(/\s+/);
      
      let coinciden = 0;
      for (const palabra of palabras) {
        if (palabrasProd.includes(palabra)) coinciden++;
      }
      
      const score = coinciden / palabras.length;
      
      if (score > mejorScore) {
        mejorScore = score;
        mejorMatch = producto;
      }
    }
  }
  
  if (mejorMatch && mejorScore >= 0.5) {
    console.log(`      ✅ MATCH PALABRAS: "${mejorMatch.nombre}" (${mejorMatch.id}) - ${(mejorScore*100).toFixed(0)}%`);
    return mejorMatch;
  }
  
  console.log(`      ❌ NO ENCONTRADO`);
  return null;
}

/**
 * Obtener precio según tamaño seleccionado
 */
function obtenerPrecioPorTamano(producto, tamanoSeleccionado) {
  console.log(`\n      💰 obtenerPrecioPorTamano()`);
  console.log(`         Producto: ${producto.nombre}`);
  console.log(`         Tamaño: "${tamanoSeleccionado}"`);
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1️⃣ BUSCAR EN ARRAY "tamaños"
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  if (producto.tamaños && Array.isArray(producto.tamaños) && producto.tamaños.length > 0) {
    console.log(`         ✅ Tiene array tamaños (${producto.tamaños.length} opciones)`);
    
    // Si hay tamaño seleccionado
    if (tamanoSeleccionado) {
      // Buscar por ID
      let tamanoObj = producto.tamaños.find(t => t.id === tamanoSeleccionado);
      
      // Buscar por nombre si no se encontró por ID
      if (!tamanoObj) {
        const tamLower = tamanoSeleccionado.toLowerCase();
        tamanoObj = producto.tamaños.find(t => 
          t.nombre && (
            t.nombre.toLowerCase().includes(tamLower) ||
            tamLower.includes(t.nombre.toLowerCase().substring(0, 5))
          )
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
    
    // Usar primer tamaño disponible
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
  // 2️⃣ USAR tamaño_default
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  if (producto.tamaño_default && producto.tamaño_default.precio) {
    console.log(`         ✅ Usando tamaño_default: $${producto.tamaño_default.precio}`);
    return {
      precio: producto.tamaño_default.precio,
      tamanoNombre: producto.tamaño_default.nombre || 'N/A'
    };
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3️⃣ FALLBACK: precio_base
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  if (producto.precio_base) {
    console.log(`         ⚠️ Usando precio_base: $${producto.precio_base}`);
    return {
      precio: producto.precio_base,
      tamanoNombre: 'Único'
    };
  }
  
  console.error(`         ❌ NO SE ENCONTRÓ PRECIO`);
  return { precio: 0, tamanoNombre: 'N/A' };
}

/**
 * Calcular precio total de la orden
 */
export function calculateOrderPrice(order, menu) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`💰 calculateOrderPrice()`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  let total = 0;
  let estrellas = 0;
  const detalles = [];
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1️⃣ BEBIDA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  if (order.bebida) {
    console.log(`\n   🍹 PROCESANDO BEBIDA: "${order.bebida}"`);
    
    const bebida = findProductByName(menu, order.bebida);
    
    if (bebida) {
      const precioInfo = obtenerPrecioPorTamano(bebida, order.tamano);
      
      if (precioInfo.precio > 0) {
        total += precioInfo.precio;
        
        detalles.push({
          tipo: 'bebida',
          nombre: bebida.nombre,
          tamano: precioInfo.tamanoNombre,
          precio: precioInfo.precio
        });
        
        console.log(`   ✅ Bebida: $${precioInfo.precio}`);
      }
    } else {
      console.error(`   ❌ Bebida no encontrada: "${order.bebida}"`);
    }
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2️⃣ ALIMENTO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  if (order.alimento && order.alimento !== 'ninguno') {
    console.log(`\n   🍔 PROCESANDO ALIMENTO: "${order.alimento}"`);
    
    const alimento = findProductByName(menu, order.alimento, 'alimento');
    
    if (alimento) {
      const precioInfo = obtenerPrecioPorTamano(alimento, null);
      
      if (precioInfo.precio > 0) {
        total += precioInfo.precio;
        
        detalles.push({
          tipo: 'alimento',
          nombre: alimento.nombre,
          precio: precioInfo.precio
        });
        
        console.log(`   ✅ Alimento: $${precioInfo.precio}`);
      }
    } else {
      console.error(`   ❌ Alimento no encontrado: "${order.alimento}"`);
    }
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3️⃣ ESTRELLAS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  if (order.metodoPago) {
    if (order.metodoPago.toLowerCase().includes('starbucks card')) {
      estrellas = Math.floor(total / 10);
    } else {
      estrellas = Math.floor(total / 20);
    }
  }
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 TOTAL: $${total} | ⭐ ${estrellas} estrellas`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  return { total, estrellas, detalles };
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