/**
 * menuUtils.js
 * Utilidades para trabajar con la estructura correcta del menú
 * Usa índices para búsqueda rápida O(1)
 */

/**
 * Buscar producto por ID (MÁS RÁPIDO)
 * @param {Object} menu - Menú cargado
 * @param {string} productId - ID del producto
 * @returns {Object|null} Producto encontrado o null
 */
 export function findProductById(menu, productId) {
  if (!menu?.indice_por_id) {
    console.error('❌ Menú no tiene índice_por_id');
    return null;
  }
  return menu.indice_por_id[productId] || null;
}

/**
 * Buscar producto por nombre (con búsqueda flexible)
 * @param {Object} menu - Menú cargado
 * @param {string} nombre - Nombre del producto
 * @returns {Object|null} Producto encontrado o null
 */
export function findProductByName(menu, nombre) {
  if (!menu?.indice_por_nombre) {
    console.error('❌ Menú no tiene índice_por_nombre');
    return null;
  }

  if (!nombre || nombre.trim() === '') {
    return null;
  }

  const nameLower = nombre.toLowerCase().trim();

  // Búsqueda exacta
  const exactId = menu.indice_por_nombre[nameLower];
  if (exactId) {
    return findProductById(menu, exactId);
  }

  // Búsqueda parcial
  for (const [indexName, productId] of Object.entries(menu.indice_por_nombre)) {
    if (indexName.includes(nameLower) || nameLower.includes(indexName)) {
      return findProductById(menu, productId);
    }
  }

  return null;
}

/**
 * Obtener todos los tamaños disponibles de un producto
 * @param {Object} producto - Producto del menú
 * @returns {Array} Array de tamaños con estructura {id, nombre, precio}
 */
export function getProductSizes(producto) {
  if (!producto || !Array.isArray(producto.tamaños)) {
    return [];
  }
  return producto.tamaños.filter(t => t && t.nombre && t.nombre !== '');
}

/**
 * Obtener tamaño por ID
 * @param {Object} producto - Producto del menú
 * @param {string} sizeId - ID del tamaño
 * @returns {Object|null} Tamaño encontrado
 */
export function getSizeById(producto, sizeId) {
  if (!producto?.tamaños) return null;
  return producto.tamaños.find(t => t.id === sizeId) || null;
}

/**
 * Obtener tamaño default
 * @param {Object} producto - Producto del menú
 * @returns {Object|null} Tamaño default
 */
export function getDefaultSize(producto) {
  if (!producto?.tamaño_default) return null;
  return producto.tamaño_default;
}

/**
 * Obtener precio de un tamaño
 * @param {Object} producto - Producto del menú
 * @param {string} sizeId - ID del tamaño
 * @returns {number} Precio del tamaño
 */
export function getPriceForSize(producto, sizeId) {
  const size = getSizeById(producto, sizeId);
  return size?.precio || 0;
}

/**
 * Obtener modificadores del producto
 * @param {Object} producto - Producto del menú
 * @returns {Array} Array de grupos de modificadores
 */
export function getProductModifiers(producto) {
  if (!producto || !Array.isArray(producto.modificadores)) {
    return [];
  }
  return producto.modificadores;
}

/**
 * Obtener modificador por ID
 * @param {Object} producto - Producto del menú
 * @param {string} modifierId - ID del grupo de modificador
 * @returns {Object|null} Grupo de modificador
 */
export function getModifierById(producto, modifierId) {
  const mods = getProductModifiers(producto);
  return mods.find(m => m.id === modifierId) || null;
}

/**
 * Obtener opción del modificador
 * @param {Object} modifier - Grupo de modificador
 * @param {string} optionId - ID de la opción
 * @returns {Object|null} Opción encontrada
 */
export function getModifierOption(modifier, optionId) {
  if (!modifier?.opciones || !Array.isArray(modifier.opciones)) {
    return null;
  }
  return modifier.opciones.find(o => o.id === optionId) || null;
}

/**
 * Obtener precio de una opción del modificador para un tamaño específico
 * @param {Object} option - Opción del modificador
 * @param {string} sizeId - ID del tamaño
 * @returns {number} Precio adicional
 */
export function getOptionPrice(option, sizeId) {
  if (!option?.precios_por_tamano) return 0;
  return option.precios_por_tamano[sizeId] || 0;
}

/**
 * Obtener modificadores requeridos de un producto
 * @param {Object} producto - Producto del menú
 * @returns {Array} Array de modificadores requeridos
 */
export function getRequiredModifiers(producto) {
  const mods = getProductModifiers(producto);
  return mods.filter(m => m.requerido === true);
}

/**
 * Obtener modificadores opcionales de un producto
 * @param {Object} producto - Producto del menú
 * @returns {Array} Array de modificadores opcionales
 */
export function getOptionalModifiers(producto) {
  const mods = getProductModifiers(producto);
  return mods.filter(m => m.requerido !== true);
}

/**
 * Validar si una selección de modificadores es válida para un producto
 * @param {Object} producto - Producto del menú
 * @param {Array} selectedModifiers - Array de {grupoId, opcionId}
 * @returns {Object} {valido, errores}
 */
export function validateModifiers(producto, selectedModifiers = []) {
  const errores = [];
  const modifiers = getProductModifiers(producto);

  // Para cada grupo de modificadores
  for (const grupo of modifiers) {
    const seleccionadosDelGrupo = selectedModifiers.filter(
      (sel) => sel.grupoId === grupo.id
    );

    // Validar si es requerido
    if (grupo.requerido && seleccionadosDelGrupo.length === 0) {
      errores.push(
        `${grupo.nombre}: REQUERIDO (mínimo ${grupo.minimo} opción)`
      );
      continue;
    }

    // Validar cantidad mínima
    if (seleccionadosDelGrupo.length < grupo.minimo) {
      errores.push(
        `${grupo.nombre}: Se requieren mínimo ${grupo.minimo} opción(es)`
      );
    }

    // Validar cantidad máxima
    if (seleccionadosDelGrupo.length > grupo.maximo) {
      errores.push(
        `${grupo.nombre}: Se permiten máximo ${grupo.maximo} opción(es)`
      );
    }

    // Validar que cada opción existe
    for (const sel of seleccionadosDelGrupo) {
      const opcion = getModifierOption(grupo, sel.opcionId);
      if (!opcion) {
        errores.push(
          `${grupo.nombre}: Opción inválida (${sel.opcionId})`
        );
      }
    }
  }

  return {
    valido: errores.length === 0,
    errores,
  };
}

/**
 * Validar si un tamaño es válido para un producto
 * @param {Object} producto - Producto del menú
 * @param {string} sizeId - ID del tamaño
 * @returns {boolean} Es válido
 */
export function isValidSize(producto, sizeId) {
  if (!producto?.tamaños) return false;
  return producto.tamaños.some(t => t.id === sizeId);
}

/**
 * Validar si un producto requiere tamaño
 * @param {Object} producto - Producto del menú
 * @returns {boolean} Requiere tamaño
 */
export function requiresSize(producto) {
  if (!producto?.tamaños) return false;
  return producto.tamaños.length > 0;
}

/**
 * Obtener categoría de un producto
 * @param {Object} menu - Menú completo
 * @param {Object} producto - Producto del menú
 * @returns {string} Categoría
 */
export function getProductCategory(menu, producto) {
  if (!producto?.id) return null;

  const categorias = [
    'bebidas_calientes',
    'bebidas_frias',
    'te',
    'alimentos_salados',
    'alimentos_dulces',
    'postres',
    'panaderia',
    'alimentos_saludables',
    'cafe_en_grano',
    'combos',
    'productos_temporada',
    'productos_en_promocion',
    'otros',
  ];

  for (const cat of categorias) {
    if (menu[cat]?.some(p => p.id === producto.id)) {
      return cat;
    }
  }

  return null;
}

/**
 * Obtener productos de una categoría
 * @param {Object} menu - Menú completo
 * @param {string} categoria - Nombre de la categoría
 * @returns {Array} Productos de la categoría
 */
export function getProductsByCategory(menu, categoria) {
  return menu[categoria] || [];
}

/**
 * Buscar productos por palabra clave
 * @param {Object} menu - Menú completo
 * @param {string} keyword - Palabra clave
 * @returns {Array} Productos que coinciden
 */
export function searchProducts(menu, keyword) {
  if (!keyword || keyword.trim() === '') {
    return [];
  }

  const keywordLower = keyword.toLowerCase();
  const allProducts = Object.keys(menu)
    .filter(
      (key) =>
        [
          'bebidas_calientes',
          'bebidas_frias',
          'te',
          'alimentos_salados',
          'alimentos_dulces',
          'postres',
          'panaderia',
          'alimentos_saludables',
          'cafe_en_grano',
          'combos',
          'productos_temporada',
          'productos_en_promocion',
          'otros',
        ].includes(key)
    )
    .flatMap((key) => menu[key] || []);

  return allProducts.filter(
    (p) =>
      p.nombre.toLowerCase().includes(keywordLower) ||
      p.descripcion?.toLowerCase().includes(keywordLower)
  );
}

/**
 * Obtener recomendaciones del menú según contexto
 * @param {Object} menu - Menú completo
 * @param {string} contexto - 'manana', 'tarde', 'noche'
 * @param {string} perfil - 'energia', 'ligero', 'dulce', 'sinCafeina'
 * @returns {Array} Productos recomendados
 */
export function getRecommendations(menu, contexto = 'tarde', perfil = 'general') {
  const recomendaciones = menu?.metadata?.contextos || {};

  let sugerencias = [];

  // Obtener por contexto horario
  if (recomendaciones[contexto]) {
    sugerencias = [...(recomendaciones[contexto].sugerencias || [])];
  }

  // Filtrar por perfil
  if (recomendaciones.perfil?.[perfil]) {
    const perfilSugerencias = recomendaciones.perfil[perfil];
    sugerencias = [...new Set([...sugerencias, ...perfilSugerencias])].slice(0, 6);
  }

  // Buscar los productos reales
  return sugerencias
    .map((nombre) => findProductByName(menu, nombre))
    .filter((p) => p !== null);
}

/**
 * Obtener extras disponibles
 * @param {Object} menu - Menú completo
 * @returns {Object} Objeto con arrays de extras
 */
export function getExtras(menu) {
  return menu?.extras || {
    leches: [],
    endulzantes: [],
    jarabes: [],
    salsas: [],
    toppings: [],
  };
}

/**
 * Validar si un producto está disponible
 * @param {Object} producto - Producto del menú
 * @returns {boolean} Está disponible
 */
export function isProductAvailable(producto) {
  return producto?.disponible === true;
}

export default {
  findProductById,
  findProductByName,
  getProductSizes,
  getSizeById,
  getDefaultSize,
  getPriceForSize,
  getProductModifiers,
  getModifierById,
  getModifierOption,
  getOptionPrice,
  getRequiredModifiers,
  getOptionalModifiers,
  validateModifiers,
  isValidSize,
  requiresSize,
  getProductCategory,
  getProductsByCategory,
  searchProducts,
  getRecommendations,
  getExtras,
  isProductAvailable,
};