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
   const detalles = [];
   let total = 0;
 
   // 1. VALIDAR QUE HAYA BEBIDA
   if (!order.bebida) {
     return {
       valido: false,
       error: 'No hay bebida seleccionada',
       total: 0,
     };
   }
 
   // 2. BUSCAR PRODUCTO DE BEBIDA
   const producto = menuUtils.findProductByName(menu, order.bebida);
   if (!producto) {
     return {
       valido: false,
       error: `Producto no encontrado: ${order.bebida}`,
       total: 0,
     };
   }
 
   // 3. CALCULAR PRECIO DE BEBIDA CON TAMAÑO
   let precioBebida = 0;
 
   if (menuUtils.requiresSize(producto)) {
     // Si requiere tamaño
     if (!order.tamano) {
       return {
         valido: false,
         error: 'Se requiere seleccionar tamaño',
         total: 0,
       };
     }
 
     if (!menuUtils.isValidSize(producto, order.tamano)) {
       return {
         valido: false,
         error: `Tamaño inválido: ${order.tamano}`,
         total: 0,
       };
     }
 
     precioBebida = menuUtils.getPriceForSize(producto, order.tamano);
     detalles.push(`${producto.nombre} ${order.tamano}: $${precioBebida}`);
   } else {
     // Si no requiere tamaño
     precioBebida = producto.precio_base || 0;
     detalles.push(`${producto.nombre}: $${precioBebida}`);
   }
 
   total += precioBebida;
 
   // 4. CALCULAR PRECIOS DE MODIFICADORES
   let precioModificadores = 0;
 
   if (order.modificadores && Array.isArray(order.modificadores)) {
     for (const selectedMod of order.modificadores) {
       const grupoMod = menuUtils.getModifierById(producto, selectedMod.grupoId);
       if (!grupoMod) {
         return {
           valido: false,
           error: `Grupo de modificador no encontrado: ${selectedMod.grupoId}`,
           total: 0,
         };
       }
 
       const opcion = menuUtils.getModifierOption(grupoMod, selectedMod.opcionId);
       if (!opcion) {
         return {
           valido: false,
           error: `Opción no encontrada: ${selectedMod.opcionId}`,
           total: 0,
         };
       }
 
       // Obtener precio de la opción para el tamaño seleccionado
       const precioOpcion = menuUtils.getOptionPrice(opcion, order.tamano || '3');
       precioModificadores += precioOpcion;
 
       if (precioOpcion > 0) {
         detalles.push(`  + ${grupoMod.nombre}: ${opcion.nombre} (+$${precioOpcion})`);
       } else {
         detalles.push(`  + ${grupoMod.nombre}: ${opcion.nombre}`);
       }
     }
   }
 
   total += precioModificadores;
 
   // 5. CALCULAR PRECIO DE ALIMENTO (OPCIONAL)
   let precioAlimento = 0;
 
   if (order.alimento && order.alimento !== 'ninguno' && order.alimento !== '') {
     const productoAlimento = menuUtils.findProductByName(menu, order.alimento);
     if (productoAlimento) {
       precioAlimento = productoAlimento.precio_base || 0;
       detalles.push(`${productoAlimento.nombre}: $${precioAlimento}`);
       total += precioAlimento;
     }
   }
 
   // 6. CALCULAR ESTRELLAS
   const estrellas = calculateStars(total, order.metodoPago);
 
   return {
     valido: true,
     precio_bebida: precioBebida,
     precio_modificadores: precioModificadores,
     precio_alimento: precioAlimento,
     total,
     estrellas,
     detalles,
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