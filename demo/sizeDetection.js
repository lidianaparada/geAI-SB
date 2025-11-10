/**
 * sizeDetection.js
 * Sistema inteligente para detectar tamaños disponibles de un producto
 * y generar prompts correctos según el producto
 */

 import * as menuUtils from './menuUtils.js';

 /**
  * Mapeo de variaciones de tamaños a IDs reales
  * Permite que el usuario diga "pequeño", "chico", "regular", etc.
  */
 const TAMAÑO_ALIASES = {
   // Pequeño
   'pequeño': ['1', '2'],
   'chico': ['1', '2'],
   'corto': ['1', '2'],
   'tall': ['2'],
   'short': ['1'],
   
   // Mediano/Regular
   'mediano': ['3'],
   'medio': ['3'],
   'regular': ['3'],
   'grande': ['3', '4'],
   'grande normal': ['3'],
   
   // Grande/Venti
   'venti': ['4'],
   'grande extra': ['4'],
   'muy grande': ['4'],
   'extra grande': ['4'],
   'el más grande': ['4'],
 };
 
 /**
  * Obtener los nombres correctos de tamaños para un producto
  * @param {Object} producto - Producto del menú
  * @returns {Array} Array de {id, nombre, precio}
  */
 export function getAvailableSizes(producto) {
   if (!producto?.tamaños) return [];
   
   return producto.tamaños
     .filter(t => t && t.nombre && t.nombre.trim())
     .map(t => ({
       id: t.id,
       nombre: t.nombre.trim(),
       precio: t.precio
     }));
 }
 
 /**
  * Verificar si un producto requiere seleccionar tamaño
  * @param {Object} producto - Producto del menú
  * @returns {boolean} Requiere tamaño
  */
 export function requiresSize(producto) {
   const sizes = getAvailableSizes(producto);
   
   // Si no tiene tamaños o solo tiene uno, no requiere selección
   if (sizes.length <= 1) {
     return false;
   }
   
   return true;
 }
 
 /**
  * Detectar tamaño desde input del usuario
  * Maneja múltiples variaciones de palabras
  * @param {string} input - Input del usuario
  * @param {Object} producto - Producto del menú
  * @returns {string|null} ID del tamaño detectado o null
  */
 export function detectSizeFromInput(input, producto) {
   if (!input || !producto) return null;
   
   const inputLower = input.toLowerCase();
   const availableSizes = getAvailableSizes(producto);
   
   if (availableSizes.length === 0) return null;
   
   // 1. Búsqueda directa en nombres de tamaños
   for (const size of availableSizes) {
     const sizeName = size.nombre.toLowerCase();
     
     // Búsqueda exacta
     if (inputLower.includes(sizeName)) {
       return size.id;
     }
     
     // Búsqueda parcial (para "Grande (16oz...)" encontrar "grande")
     const sizeWords = sizeName.split(/[\s()]/);
     for (const word of sizeWords) {
       if (word.length > 2 && inputLower.includes(word)) {
         return size.id;
       }
     }
   }
   
   // 2. Búsqueda por alias/variaciones
   for (const [alias, sizeIds] of Object.entries(TAMAÑO_ALIASES)) {
     if (inputLower.includes(alias)) {
       // Buscar en los tamaños disponibles
       const availableId = sizeIds.find(id => 
         availableSizes.some(s => s.id === id)
       );
       if (availableId) {
         return availableId;
       }
     }
   }
   
   // 3. Búsqueda por números (oz, ml)
   const ozbMatches = inputLower.match(/(\d+)\s*oz/i);
   if (ozbMatches) {
     const oz = parseInt(ozbMatches[1]);
     
     // Mapeo aproximado oz -> tamaño
     if (oz <= 350) return availableSizes[0]?.id; // Pequeño
     if (oz <= 437) return availableSizes[1]?.id || availableSizes[0]?.id; // Mediano
     return availableSizes[availableSizes.length - 1]?.id; // Grande
   }
   
   return null;
 }
 
 /**
  * Generar prompt para preguntar tamaño de forma inteligente
  * @param {Object} producto - Producto del menú
  * @returns {string} Prompt personalizado
  */
 export function generateSizePrompt(producto) {
   const sizes = getAvailableSizes(producto);
   
   if (sizes.length === 0) {
     return "Lo siento, no hay tamaños disponibles para este producto.";
   }
   
   if (sizes.length === 1) {
     // Si solo hay un tamaño, no preguntar
     return null;
   }
   
   // Crear descripción de tamaños disponibles
   const sizeDescriptions = sizes
     .map(s => `${s.nombre}${s.precio > 0 ? ` (+$${s.precio})` : ''}`)
     .join(", ");
   
   // Generar prompt según cantidad de tamaños
   if (sizes.length === 2) {
     return `¿Prefieres ${sizes[0].nombre} o ${sizes[1].nombre}?`;
   }
   
   if (sizes.length === 3) {
     return `Tenemos: ${sizeDescriptions}. ¿Cuál prefieres?`;
   }
   
   return `¿Qué tamaño prefieres? Disponibles: ${sizeDescriptions}`;
 }
 
 /**
  * Validar si un tamaño es válido para un producto
  * @param {Object} producto - Producto del menú
  * @param {string} sizeId - ID del tamaño
  * @returns {boolean} Es válido
  */
 export function isValidSize(producto, sizeId) {
   const sizes = getAvailableSizes(producto);
   return sizes.some(s => s.id === sizeId);
 }
 
 /**
  * Obtener tamaño por ID
  * @param {Object} producto - Producto del menú
  * @param {string} sizeId - ID del tamaño
  * @returns {Object|null} Tamaño encontrado
  */
 export function getSizeById(producto, sizeId) {
   const sizes = getAvailableSizes(producto);
   return sizes.find(s => s.id === sizeId) || null;
 }
 
 /**
  * Obtener nombre de tamaño para mostrar al usuario
  * @param {Object} producto - Producto del menú
  * @param {string} sizeId - ID del tamaño
  * @returns {string} Nombre del tamaño
  */
 export function getSizeName(producto, sizeId) {
   const size = getSizeById(producto, sizeId);
   return size ? size.nombre : "Tamaño desconocido";
 }
 
 /**
  * Detectar si el usuario ya mencionó un tamaño en el input
  * @param {string} input - Input del usuario
  * @param {Object} producto - Producto del menú
  * @returns {Object} {tieneSize: boolean, sizeId: string|null, sizeName: string|null}
  */
 export function detectSizeInInput(input, producto) {
   const sizeId = detectSizeFromInput(input, producto);
   
   if (sizeId) {
     const size = getSizeById(producto, sizeId);
     return {
       tieneSize: true,
       sizeId,
       sizeName: size?.nombre || ""
     };
   }
   
   return {
     tieneSize: false,
     sizeId: null,
     sizeName: null
   };
 }
 
 /**
  * Extraer solo la parte del tamaño del nombre del tamaño
  * Para mostrar de forma más amigable
  * @param {string} sizeName - Nombre del tamaño (ej: "Grande (16oz - 437ml)")
  * @returns {string} Parte principal (ej: "Grande")
  */
 export function extractSizeLabel(sizeName) {
   if (!sizeName) return "";
   
   // Extraer la parte antes del paréntesis
   const match = sizeName.match(/^([^\(]+)/);
   return match ? match[1].trim() : sizeName;
 }
 
 /**
  * Generar lista de sugerencias de tamaños para mostrar al usuario
  * @param {Object} producto - Producto del menú
  * @returns {Array} Array de sugerencias
  */
 export function getSizeSuggestions(producto) {
   const sizes = getAvailableSizes(producto);
   
   if (sizes.length === 0) {
     return [];
   }
   
   // Retornar solo los nombres sin el tamaño completo
   return sizes.map(s => extractSizeLabel(s.nombre));
 }
 
 export default {
   getAvailableSizes,
   requiresSize,
   detectSizeFromInput,
   generateSizePrompt,
   isValidSize,
   getSizeById,
   getSizeName,
   detectSizeInInput,
   extractSizeLabel,
   getSizeSuggestions,
   TAMAÑO_ALIASES,
 };