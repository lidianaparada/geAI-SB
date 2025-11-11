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
  export function calculateOrderPrice(order, menu) {
    console.log(`\n💰 calculateOrderPrice()`);
    console.log(`   Orden:`, JSON.stringify(order, null, 2));
    
    let total = 0;
    let estrellas = 0;
    const detalles = [];
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1️⃣ PRECIO DE LA BEBIDA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if (order.bebida) {
      console.log(`   🔍 Buscando bebida: "${order.bebida}"`);
      
      // Buscar la bebida en el menú
      const bebida = menuUtils.findProductByName(menu, order.bebida);
      
      if (bebida) {
        console.log(`   ✅ Bebida encontrada: ${bebida.nombre} (ID: ${bebida.id})`);
        
        let precioBebida = bebida.precio_base || 0;
        console.log(`   💵 Precio base bebida: $${precioBebida}`);
        
        // Si tiene tamaño, buscar el precio específico del tamaño
        if (order.tamano && bebida.tamanos && Array.isArray(bebida.tamanos)) {
          console.log(`   📏 Tamaño seleccionado: ${order.tamano}`);
          
          // El tamaño puede ser el nombre completo o solo el ID
          const tamanoEncontrado = bebida.tamanos.find(t => 
            t === order.tamano || 
            t.toLowerCase().includes(order.tamano.toLowerCase())
          );
          
          if (tamanoEncontrado) {
            console.log(`   ✅ Tamaño válido: ${tamanoEncontrado}`);
            // El precio base ya incluye el tamaño, no se suma extra
          }
        }
        
        // Agregar modificadores (si tienen costo adicional)
        if (order.modificadores && Array.isArray(order.modificadores)) {
          console.log(`   🔧 Procesando ${order.modificadores.length} modificadores...`);
          
          for (const mod of order.modificadores) {
            // Por ahora, la mayoría de modificadores son gratuitos
            // pero algunos como "crema batida" o "shot extra" pueden tener costo
            console.log(`      - ${mod.grupoId}: ${mod.opcionId} (costo: $0)`);
          }
        }
        
        total += precioBebida;
        detalles.push({
          tipo: 'bebida',
          nombre: bebida.nombre,
          tamano: order.tamano || 'N/A',
          precio: precioBebida
        });
        
        console.log(`   ✅ Subtotal bebida: $${precioBebida}`);
      } else {
        console.warn(`   ⚠️ Bebida no encontrada en menú: "${order.bebida}"`);
      }
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2️⃣ PRECIO DEL ALIMENTO
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if (order.alimento && order.alimento !== 'ninguno') {
      console.log(`   🔍 Buscando alimento: "${order.alimento}"`);
      
      // Buscar el alimento en el menú
      const alimento = menuUtils.findProductByName(menu, order.alimento, 'alimento');
      
      if (alimento) {
        console.log(`   ✅ Alimento encontrado: ${alimento.nombre} (ID: ${alimento.id})`);
        
        const precioAlimento = alimento.precio_base || 0;
        console.log(`   💵 Precio alimento: $${precioAlimento}`);
        
        total += precioAlimento;
        detalles.push({
          tipo: 'alimento',
          nombre: alimento.nombre,
          precio: precioAlimento
        });
        
        console.log(`   ✅ Subtotal con alimento: $${total}`);
      } else {
        console.warn(`   ⚠️ Alimento no encontrado en menú: "${order.alimento}"`);
      }
    } else {
      console.log(`   ℹ️ Sin alimento en la orden`);
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3️⃣ CALCULAR ESTRELLAS SEGÚN MÉTODO DE PAGO
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if (order.metodoPago) {
      if (order.metodoPago.toLowerCase().includes('starbucks card')) {
        // Starbucks Card: 1 estrella por cada $10
        estrellas = Math.floor(total / 10);
        console.log(`   ⭐ Estrellas (Starbucks Card): ${estrellas} (1 por cada $10)`);
      } else {
        // Efectivo o Tarjeta: 1 estrella por cada $20
        estrellas = Math.floor(total / 20);
        console.log(`   ⭐ Estrellas (Efectivo/Tarjeta): ${estrellas} (1 por cada $20)`);
      }
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4️⃣ RESULTADO FINAL
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    console.log(`\n   💰 TOTAL: $${total}`);
    console.log(`   ⭐ ESTRELLAS: ${estrellas}`);
    console.log(`   📋 DETALLES:`, detalles);
    
    return {
      total,
      estrellas,
      detalles
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