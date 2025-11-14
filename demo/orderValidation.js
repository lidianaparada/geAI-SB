/**
 * orderValidation.js
 * Validación completa de órdenes según estructura correcta del menú
 */

 import * as menuUtils from './menuUtils.js';
 import * as priceCalc from './priceCalculator.js';
 
 /**
  * Validar selección de sucursal
  * @param {string} sucursal - Nombre de sucursal
  * @param {Array} sucursalesDisponibles - Array de sucursales disponibles
  * @returns {Object} {valido, sucursal_encontrada, error}
  */
 export function validateSucursal(sucursal, sucursalesDisponibles) {
   if (!sucursal || sucursal.trim() === '') {
     return {
       valido: false,
       error: 'Se requiere seleccionar una sucursal',
     };
   }
 
   const sucursalEncontrada = sucursalesDisponibles.find(
     (s) =>
       s.nombre.toLowerCase() === sucursal.toLowerCase() ||
       s.nombre.toLowerCase().includes(sucursal.toLowerCase())
   );
 
   if (!sucursalEncontrada) {
     return {
       valido: false,
       error: `Sucursal no encontrada: ${sucursal}`,
     };
   }
 
   return {
     valido: true,
     sucursal_encontrada: sucursalEncontrada,
   };
 }
 
 /**
  * Validar selección de bebida
  * @param {string} bebida - Nombre de la bebida
  * @param {Object} menu - Menú completo
  * @returns {Object} {valido, producto, error}
  */
 export function validateBeverage(bebida, menu) {
   if (!bebida || bebida.trim() === '') {
     return {
       valido: false,
       error: 'Se requiere seleccionar una bebida',
     };
   }
 
   const producto = menuUtils.findProductByName(menu, bebida);
 
   if (!producto) {
     return {
       valido: false,
       error: `Bebida no encontrada: ${bebida}`,
     };
   }
 
   if (!menuUtils.isProductAvailable(producto)) {
     return {
       valido: false,
       error: `Bebida no disponible: ${bebida}`,
     };
   }
 
   return {
     valido: true,
     producto,
   };
 }
 
 /**
  * Validar selección de tamaño
  * @param {string} sizeId - ID del tamaño
  * @param {Object} producto - Producto del menú
  * @returns {Object} {valido, tamaño, error}
  */
 export function validateSize(sizeId, producto) {
   if (!producto) {
     return {
       valido: false,
       error: 'Producto no especificado',
     };
   }
 
   if (!menuUtils.requiresSize(producto)) {
     return {
       valido: true,
       tamaño: null,
       mensaje: 'Este producto no requiere seleccionar tamaño',
     };
   }
 
   if (!sizeId || sizeId.trim() === '') {
     return {
       valido: false,
       error: 'Se requiere seleccionar tamaño',
     };
   }
 
   if (!menuUtils.isValidSize(producto, sizeId)) {
     const tamañosDisponibles = menuUtils.getProductSizes(producto);
     return {
       valido: false,
       error: `Tamaño inválido. Disponibles: ${tamañosDisponibles.map((t) => t.nombre).join(', ')}`,
     };
   }
 
   const tamaño = menuUtils.getSizeById(producto, sizeId);
 
   return {
     valido: true,
     tamaño,
   };
 }
 
 /**
  * Validar modificadores seleccionados
  * @param {Array} selectedModifiers - Array de {grupoId, opcionId}
  * @param {Object} producto - Producto del menú
  * @returns {Object} {valido, errores}
  */
 export function validateModifiers(selectedModifiers, producto) {
   if (!producto) {
     return {
       valido: false,
       errores: ['Producto no especificado'],
     };
   }
 
   return menuUtils.validateModifiers(producto, selectedModifiers);
 }
 
 /**
  * Validar toda la orden antes de procesar pago
  * @param {Object} order - Orden completa
  * @param {Object} menu - Menú
  * @param {Array} sucursalesDisponibles - Sucursales
  * @returns {Object} {valido, errores, advertencias}
  */
 export function validateCompleteOrder(
   order,
   menu,
   sucursalesDisponibles = []
 ) {
   const errores = [];
   const advertencias = [];
 
   // 1. Validar sucursal
   if (!order.sucursal) {
     errores.push('Se requiere seleccionar sucursal');
   } else {
     const validSucursal = validateSucursal(order.sucursal, sucursalesDisponibles);
     if (!validSucursal.valido) {
       errores.push(validSucursal.error);
     }
   }
 
   // 2. Validar bebida
   if (!order.bebida) {
     errores.push('Se requiere seleccionar bebida');
   } else {
     const validBeverage = validateBeverage(order.bebida, menu);
     if (!validBeverage.valido) {
       errores.push(validBeverage.error);
     } else {
       const producto = validBeverage.producto;
 
       // 3. Validar tamaño si es requerido
       if (menuUtils.requiresSize(producto)) {
         if (!order.tamano) {
           errores.push('Se requiere seleccionar tamaño');
         } else {
           const validSize = validateSize(order.tamano, producto);
           if (!validSize.valido) {
             errores.push(validSize.error);
           }
         }
       }
 
       // 4. Validar modificadores
       if (order.modificadores && Array.isArray(order.modificadores)) {
         const validMods = validateModifiers(order.modificadores, producto);
         if (!validMods.valido) {
           errores.push(...validMods.errores);
         }
       } else {
         // Verificar si hay modificadores requeridos sin seleccionar
         const requiredMods = menuUtils.getRequiredModifiers(producto);
         if (requiredMods.length > 0) {
           errores.push(
             `Faltan ${requiredMods.length} modificador(es) requerido(s)`
           );
         }
       }
     }
   }
 
   // 5. Validar método de pago
   if (!order.metodoPago) {
     errores.push('Se requiere seleccionar método de pago');
   }
 
   // 6. Validar que el precio sea calculable
   if (errores.length === 0) {
     const priceValidation = priceCalc.validateOrderForPayment(order, menu);
     if (!priceValidation.valido) {
       errores.push(
         `No se puede calcular precio. Faltan: ${priceValidation.campos_faltantes.join(', ')}`
       );
     }
   }
 
   // Advertencias (no impiden procesar)
   if (order.alimento && order.alimento !== 'ninguno') {
     const productoAlimento = menuUtils.findProductByName(menu, order.alimento);
     if (!productoAlimento) {
       advertencias.push(`Alimento no encontrado: ${order.alimento}`);
     }
   }
 
   return {
     valido: errores.length === 0,
     errores,
     advertencias,
   };
 }
 
 /**
  * Sugerir siguiente paso en la orden
  * @param {Object} order - Orden actual
  * @param {Object} menu - Menú
  * @returns {string} Siguiente paso
  */
 export function suggestNextStep(order, menu) {
  if (!order || Object.keys(order).length === 0) {
    return 'bienvenida';
  }
  
  const keysWithoutUserName = Object.keys(order).filter(k => k !== 'userName');
  if (keysWithoutUserName.length === 0) {
    return 'bienvenida';
  }
  // Si ya dio bienvenida pero no confirmó que está listo
  if (order.listoParaOrdenar === false) {
    return 'bienvenida'; // Sigue en bienvenida hasta que confirme
  }
   if (!order.sucursal) return 'sucursal';
   if (!order.bebida) return 'bebida';
 
   const producto = menuUtils.findProductByName(menu, order.bebida);
   if (!producto) return 'bebida';
 
   if (menuUtils.requiresSize(producto) && !order.tamano) return 'tamano';
 
   const requiredMods = menuUtils.getRequiredModifiers(producto);
   if (requiredMods.length > 0) {
     for (const mod of requiredMods) {
       const hasModifier = order.modificadores?.some(
         (m) => m.grupoId === mod.id
       );
       if (!hasModifier) {
         return `modifier_${mod.id}`;
       }
     }
   }
 
   if (order.alimento === undefined) return 'alimento';
   if (!order.metodoPago) return 'metodoPago';
 
   if (!order.confirmado) return 'confirmacion'; // ← ¿Tienes esto?
  
  return 'completado';
 }
 
 /**
  * Obtener campos requeridos faltantes
  * @param {Object} order - Orden
  * @param {Object} menu - Menú
  * @returns {Array} Campos faltantes
  */
 export function getMissingFields(order, menu) {
   const faltantes = [];
 
   if (!order.sucursal) faltantes.push('sucursal');
   if (!order.bebida) faltantes.push('bebida');
 
   if (order.bebida) {
     const producto = menuUtils.findProductByName(menu, order.bebida);
     if (producto) {
       if (menuUtils.requiresSize(producto) && !order.tamano) {
         faltantes.push('tamano');
       }
 
       const requiredMods = menuUtils.getRequiredModifiers(producto);
       for (const mod of requiredMods) {
         const hasModifier = order.modificadores?.some(
           (m) => m.grupoId === mod.id
         );
         if (!hasModifier) {
           faltantes.push(`modificador_${mod.nombre}`);
         }
       }
     }
   }
 
   if (order.alimento === undefined) faltantes.push('alimento');
   if (!order.metodoPago) faltantes.push('metodoPago');
 
   return faltantes;
 }
 
 /**
  * Obtener resumen de validación
  * @param {Object} order - Orden
  * @param {Object} menu - Menú
  * @param {Array} sucursalesDisponibles - Sucursales
  * @returns {Object} Resumen de validación
  */
 export function getValidationSummary(
   order,
   menu,
   sucursalesDisponibles = []
 ) {
   const validation = validateCompleteOrder(order, menu, sucursalesDisponibles);
   const faltantes = getMissingFields(order, menu);
   const nextStep = suggestNextStep(order, menu);
 
   const porcentajeCompleto = Math.round(
     ((Object.keys(order).filter((k) => order[k] !== undefined && order[k] !== null && order[k] !== '').length / 7) * 100)
   );
 
   return {
     valido: validation.valido,
     errores: validation.errores,
     advertencias: validation.advertencias,
     campos_faltantes: faltantes,
     proximo_paso: nextStep,
     porcentaje_completado: porcentajeCompleto,
     orden_actual: order,
   };
 }
 
 export default {
   validateSucursal,
   validateBeverage,
   validateSize,
   validateModifiers,
   validateCompleteOrder,
   suggestNextStep,
   getMissingFields,
   getValidationSummary,
 };