/**
 * recommendationEngine.js
 * Motor de recomendaciones de bebidas según contexto y momento del día
 */

/**
 * Obtener recomendaciones según momento del día
 * @param {Object} menu - Menú del restaurante
 * @param {string} momento - 'mañana', 'tarde', 'noche'
 * @returns {Array} Array de productos recomendados
 */
 export function getRecommendations(menu, momento = 'tarde') {
  if (!menu?.indice_por_nombre) {
    return [];
  }

  // Recomendaciones por momento del día
  const recomendacionesPorMomento = {
    mañana: [
      'Caffe Latte',
      'Cappuccino',
      'Americano',
      'Café Americano',
      'Espresso',
    ],
    tarde: [
      'Frappuccino de Caramelo',
      'Iced Latte',
      'Caffe Latte',
      'Iced Americano',
      'Matcha Frappuccino',
    ],
    noche: [
      'Caffe Mocha',
      'Hot Chocolate',
      'Chai Tea Latte',
      'Vanilla Steamer',
      'Caramelo Macchiato',
    ],
  };

  const nombresRecomendados = recomendacionesPorMomento[momento] || 
                               recomendacionesPorMomento['tarde'];

  const recomendadas = [];
  
  for (const nombre of nombresRecomendados) {
    const producto = menu.indice_por_nombre[nombre.toLowerCase()];
    if (producto) {
      recomendadas.push({
        nombre: producto.nombre,
        id: producto.id,
        precio: producto.tamaños?.[0]?.precio || 0,
      });
    }
  }

  // Si no encontró suficientes, retornar bebidas aleatorias
  if (recomendadas.length < 3) {
    const todasLasBebidas = Object.values(menu.indice_por_nombre || {})
      .filter(p => p.categoria === 'Bebidas' || p.tipo === 'bebida')
      .slice(0, 5);
    
    return todasLasBebidas.length > 0 ? todasLasBebidas : recomendadas;
  }

  return recomendadas;
}

/**
 * Obtener bebida aleatoria del menú
 * @param {Object} menu - Menú del restaurante
 * @returns {Object} Bebida aleatoria
 */
export function getRandomBeverage(menu) {
  if (!menu?.indice_por_nombre) {
    return null;
  }

  const bebidas = Object.values(menu.indice_por_nombre)
    .filter(p => p.categoria === 'Bebidas' || p.tipo === 'bebida');

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
  if (!menu?.indice_por_nombre) {
    return [];
  }

  return Object.values(menu.indice_por_nombre)
    .filter(p => 
      (p.categoria === categoria || p.tipo === categoria) &&
      p.nombre.trim() !== ''
    )
    .slice(0, 5);
}

/**
 * Obtener bebidas populares (más vendidas)
 * @param {Object} menu - Menú del restaurante
 * @returns {Array} Bebidas populares
 */
export function getPopularBeverages(menu) {
  if (!menu?.indice_por_nombre) {
    return [];
  }

  // Las bebidas más populares de Starbucks
  const populares = [
    'Caffe Latte',
    'Iced Coffee',
    'Caramel Macchiato',
    'Americano',
    'Cappuccino',
  ];

  const resultado = [];

  for (const nombre of populares) {
    const producto = menu.indice_por_nombre[nombre.toLowerCase()];
    if (producto) {
      resultado.push(producto);
    }
  }

  // Si no encontró suficientes, agregar aleatoriamente
  if (resultado.length < 3) {
    const todas = Object.values(menu.indice_por_nombre || {})
      .filter(p => p.nombre.trim() !== '')
      .slice(0, 5);
    
    return resultado.concat(todas).slice(0, 5);
  }

  return resultado;
}

/**
 * Buscar bebidas que coincidan con criterios
 * @param {Object} menu - Menú del restaurante
 * @param {Object} criterios - Criterios de búsqueda {temperatura, tipo, precio}
 * @returns {Array} Bebidas que coinciden
 */
export function searchBeverages(menu, criterios = {}) {
  if (!menu?.indice_por_nombre) {
    return [];
  }

  let resultados = Object.values(menu.indice_por_nombre || {});

  // Filtrar por temperatura
  if (criterios.temperatura) {
    const temp = criterios.temperatura.toLowerCase();
    resultados = resultados.filter(p => {
      const nombre = p.nombre.toLowerCase();
      if (temp === 'caliente') {
        return nombre.includes('latte') || 
               nombre.includes('cappuccino') ||
               nombre.includes('macchiato') ||
               nombre.includes('americano') ||
               nombre.includes('mocha');
      }
      if (temp === 'frio' || temp === 'iced') {
        return nombre.includes('iced') || 
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
      p.tipo?.toLowerCase().includes(tipo) ||
      p.nombre.toLowerCase().includes(tipo)
    );
  }

  // Filtrar por precio
  if (criterios.precioMin) {
    resultados = resultados.filter(p => {
      const precio = p.tamaños?.[0]?.precio || 0;
      return precio >= criterios.precioMin;
    });
  }

  if (criterios.precioMax) {
    resultados = resultados.filter(p => {
      const precio = p.tamaños?.[0]?.precio || 0;
      return precio <= criterios.precioMax;
    });
  }

  return resultados.slice(0, 5);
}

export default {
  getRecommendations,
  getRandomBeverage,
  getBeveragesByCategory,
  getPopularBeverages,
  searchBeverages,
};