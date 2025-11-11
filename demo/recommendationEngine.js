/**
 * recommendationEngine.js - v3.6.3 FINAL
 * Usa indice_por_nombre + búsqueda en categorías para obtener objetos completos
 */

/**
 * Buscar producto completo por ID
 * @param {Object} menu - Menú completo
 * @param {string} productId - ID del producto
 * @returns {Object|null} Producto completo o null
 */
 function findProductById(menu, productId) {
  const categorias = [
    'bebidas_calientes',
    'bebidas_frias',
    'frappuccino',
    'bebidas_te',
    'alimentos_salados',
    'alimentos_dulces',
    'panaderia'
  ];
  
  for (const categoria of categorias) {
    if (menu[categoria] && Array.isArray(menu[categoria])) {
      const producto = menu[categoria].find(p => p.id === productId);
      if (producto) {
        return producto;
      }
    }
  }
  
  return null;
}

/**
 * Obtener todas las bebidas del menú
 * @param {Object} menu - Menú completo
 * @returns {Array} Array de todas las bebidas
 */
function getAllBeverages(menu) {
  const bebidas = [];
  
  const categoriasBebidas = [
    'bebidas_calientes',
    'bebidas_frias',
    'frappuccino',
    'bebidas_te',
    'bebidas_cafe'
  ];
  
  for (const categoria of categoriasBebidas) {
    if (menu[categoria] && Array.isArray(menu[categoria])) {
      bebidas.push(...menu[categoria].filter(p => p.disponible !== false));
    }
  }
  
  return bebidas;
}

/**
 * Obtener recomendaciones según momento del día
 * @param {Object} menu - Menú del restaurante
 * @param {string} momento - 'mañana', 'tarde', 'noche'
 * @returns {Array} Array de productos recomendados
 */
export function getRecommendations(menu, momento = 'tarde') {
  console.log("getRecommendations: ", momento)
  // Recomendaciones por momento del día (nombres normalizados)
  const recomendacionesPorMomento = {
    mañana: [
      'latte',
      'cappuccino',
      'espresso americano',
      'café del día: chiapas',
      'flat white'
    ],
    tarde: [
      'café frappuccino®',
      'caramel frappuccino®',
      'helado latte',
      'helado espresso americano',
      'mocha frappuccino®'
    ],
    noche: [
      'mocha',
      'chocolate caliente',
      'chai latte',
      'chocolate 100% mexicano',
      'caramel macchiato'
    ],
  };

  const nombresRecomendados = recomendacionesPorMomento[momento] || 
                               recomendacionesPorMomento['tarde'];
  
  console.log(`🔍 Buscando recomendaciones para ${momento}:`, nombresRecomendados);

  const recomendadas = [];
  
  // Estrategia 1: Buscar usando indice_por_nombre (rápido)
  if (menu.indice_por_nombre) {
    for (const nombreBuscado of nombresRecomendados) {
      const productId = menu.indice_por_nombre[nombreBuscado];
      
      if (productId) {
        // Encontramos el ID, ahora buscar el objeto completo
        const producto = findProductById(menu, productId);
        
        if (producto && !recomendadas.find(r => r.id === producto.id)) {
          recomendadas.push({
            nombre: producto.nombre,
            id: producto.id,
            precio: producto.precio_base || 0,
          });
          console.log(`   ✅ Encontrado por índice: ${producto.nombre} (ID: ${producto.id})`);
        }
      }
    }
  }

  // Estrategia 2: Búsqueda fuzzy si no hay suficientes (backup)
  if (recomendadas.length < 3) {
    console.log(`   ⚠️ Solo ${recomendadas.length} por índice, buscando más...`);
    
    const todasLasBebidas = getAllBeverages(menu);
    
    for (const nombreBuscado of nombresRecomendados) {
      if (recomendadas.length >= 5) break;
      
      const encontrada = todasLasBebidas.find(bebida => {
        // Saltar si ya está en recomendadas
        if (recomendadas.find(r => r.id === bebida.id)) return false;
        
        const nombreNormalizado = bebida.nombre.toLowerCase();
        const busquedaNormalizada = nombreBuscado.toLowerCase();
        
        return nombreNormalizado.includes(busquedaNormalizada) || 
               busquedaNormalizada.includes(nombreNormalizado);
      });
      
      if (encontrada) {
        recomendadas.push({
          nombre: encontrada.nombre,
          id: encontrada.id,
          precio: encontrada.precio_base || 0,
        });
        console.log(`   ✅ Encontrado por fuzzy: ${encontrada.nombre}`);
      }
    }
  }

  // Estrategia 3: Agregar bebidas populares si aún faltan
  if (recomendadas.length < 3) {
    console.log(`   ⚠️ Solo ${recomendadas.length}, agregando populares...`);
    
    const todasLasBebidas = getAllBeverages(menu);
    const adicionales = todasLasBebidas
      .filter(b => !recomendadas.find(r => r.id === b.id))
      .slice(0, 3 - recomendadas.length)
      .map(b => ({
        nombre: b.nombre,
        id: b.id,
        precio: b.precio_base || 0,
      }));
    
    recomendadas.push(...adicionales);
  }

  console.log(`   📋 Total recomendadas: ${recomendadas.slice(0, 5)}`);
  return recomendadas.slice(0, 5);
}

/**
 * Obtener bebida aleatoria del menú
 * @param {Object} menu - Menú del restaurante
 * @returns {Object} Bebida aleatoria
 */
export function getRandomBeverage(menu) {
  const bebidas = getAllBeverages(menu);
  
  if (bebidas.length === 0) return null;

  return bebidas[Math.floor(Math.random() * bebidas.length)];
}

/**
 * Obtener bebidas por categoría
 * @param {Object} menu - Menú del restaurante
 * @param {string} categoria - Categoría a filtrar
 * @returns {Array} Bebidas de esa categoría
 */
export function getBeveragesByCategory(menu, categoria) {
  const categoriaLower = categoria.toLowerCase();
  const categorias = [
    'bebidas_calientes',
    'bebidas_frias',
    'frappuccino',
    'bebidas_te',
    'bebidas_cafe'
  ];
  
  for (const cat of categorias) {
    if (cat.includes(categoriaLower) && menu[cat]) {
      return menu[cat].slice(0, 5);
    }
  }
  
  return getAllBeverages(menu).slice(0, 5);
}

/**
 * Obtener bebidas populares (más vendidas)
 * @param {Object} menu - Menú del restaurante
 * @returns {Array} Bebidas populares
 */
export function getPopularBeverages(menu) {
  // Lista de bebidas populares (nombres normalizados para el índice)
  const populares = [
    'latte',
    'cappuccino',
    'espresso americano',
    'caramel macchiato',
    'café frappuccino®',
  ];

  const resultado = [];

  // Buscar primero en el índice
  if (menu.indice_por_nombre) {
    for (const nombrePopular of populares) {
      const productId = menu.indice_por_nombre[nombrePopular];
      if (productId) {
        const producto = findProductById(menu, productId);
        if (producto && !resultado.find(r => r.id === producto.id)) {
          resultado.push(producto);
        }
      }
    }
  }

  // Si no hay suficientes, buscar en todas las bebidas
  if (resultado.length < 3) {
    const bebidas = getAllBeverages(menu);
    const adicionales = bebidas
      .filter(b => !resultado.find(r => r.id === b.id))
      .slice(0, 3 - resultado.length);
    resultado.push(...adicionales);
  }

  return resultado.slice(0, 5);
}

/**
 * Buscar bebidas que coincidan con criterios
 * @param {Object} menu - Menú del restaurante
 * @param {Object} criterios - Criterios de búsqueda {temperatura, tipo, precio}
 * @returns {Array} Bebidas que coinciden
 */
export function searchBeverages(menu, criterios = {}) {
  let resultados = getAllBeverages(menu);

  // Filtrar por temperatura
  if (criterios.temperatura) {
    const temp = criterios.temperatura.toLowerCase();
    resultados = resultados.filter(p => {
      const nombre = p.nombre.toLowerCase();
      const categoria = p.categoria?.toLowerCase() || '';
      
      if (temp === 'caliente') {
        return categoria.includes('caliente') ||
               (!nombre.includes('helado') && !nombre.includes('iced') && !nombre.includes('frappuccino'));
      }
      if (temp === 'frio' || temp === 'iced') {
        return categoria.includes('fria') ||
               nombre.includes('helado') ||
               nombre.includes('iced') || 
               nombre.includes('frappuccino') ||
               nombre.includes('cold');
      }
      return true;
    });
  }

  // Filtrar por tipo
  if (criterios.tipo) {
    const tipo = criterios.tipo.toLowerCase();
    resultados = resultados.filter(p =>
      p.categoria?.toLowerCase().includes(tipo) ||
      p.nombre.toLowerCase().includes(tipo)
    );
  }

  // Filtrar por precio
  if (criterios.precioMin) {
    resultados = resultados.filter(p => {
      const precio = p.precio_base || 0;
      return precio >= criterios.precioMin;
    });
  }

  if (criterios.precioMax) {
    resultados = resultados.filter(p => {
      const precio = p.precio_base || 0;
      return precio <= criterios.precioMax;
    });
  }

  return resultados.slice(0, 5);
}
// Inserta estas funciones cerca de tus helpers (p. ej. después de normalizeText / isRecommendationRequest)

function getFallbackRecommendations(menu, count = 3) {
  const buckets = [
    'bebidas_calientes',
    'bebidas_frias',
    'frappuccino',
    'especialidades',
    'brebajes'
  ];

  const items = [];

  // Recolecta items por categoría conocida
  for (const cat of buckets) {
    if (menu[cat] && Array.isArray(menu[cat])) {
      for (const p of menu[cat]) {
        if (p && p.nombre) items.push(p);
        if (items.length >= count) break;
      }
    }
    if (items.length >= count) break;
  }

  // Si no hay en buckets, flatten todo el menú y toma primeros
  if (items.length < count) {
    for (const key of Object.keys(menu)) {
      const arr = menu[key];
      if (!Array.isArray(arr)) continue;
      for (const p of arr) {
        if (p && p.nombre && !items.some(x => x.nombre === p.nombre)) {
          items.push(p);
          if (items.length >= count) break;
        }
      }
      if (items.length >= count) break;
    }
  }

  // última defensa: crear objetos genéricos si aún vacíos
  if (items.length === 0) {
    return [
      { nombre: 'Café Americano' },
      { nombre: 'Caffè Latte' },
      { nombre: 'Cappuccino' }
    ].slice(0, count);
  }

  return items.slice(0, count);
}

// ---- Modificar buscarProductoEnMenu para usar fallback si recommendationEngine devuelve vacío ----
// Reemplaza la creación de sugerencias por algo como esto:

function buscarProductoEnMenu(userInput, tipo = null) {
  const producto = menuUtils.findProductByName(MENU, userInput, tipo);
  
  if (producto) {
    return { encontrado: true, producto };
  }
  
  const timeContext = promptGen.getTimeContext();
  let sugerencias = [];
  
  if (tipo === 'bebida' || !tipo) {
    sugerencias = recommendationEngine
      .getRecommendations(MENU, timeContext.momento)
      .slice(0, 3);
  } else if (tipo === 'alimento') {
    const categorias = ['alimentos_salados', 'alimentos_dulces', 'panaderia'];
    for (const cat of categorias) {
      if (MENU[cat] && Array.isArray(MENU[cat])) {
        sugerencias.push(...MENU[cat].slice(0, 2));
      }
    }
    sugerencias = sugerencias.slice(0, 3);
  }

  // Si recommendationEngine devolvió vacío, usar fallback
  if (!sugerencias || sugerencias.length === 0) {
    console.warn('⚠️ recommendationEngine devolvió vacío, usando fallback del menú');
    sugerencias = getFallbackRecommendations(MENU, 3);
  }
  
  return {
    encontrado: false,
    producto: null,
    sugerencias: sugerencias.map(p => p.nombre)
  };
}

export default {
  getRecommendations,
  getRandomBeverage,
  getBeveragesByCategory,
  getPopularBeverages,
  searchBeverages,
  getFallbackRecommendations,
  buscarProductoEnMenu

};