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
    'te',
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
    'te',
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

/**
 * ✅ NORMALIZACIÓN MEJORADA V3: Maneja caracteres mal codificados
 */

/**
 * Mapa de caracteres mal codificados a su versión correcta
 */
const CARACTERES_MAL_CODIFICADOS = {
  'Ã©': 'e',  // é mal codificado
  'Ã¡': 'a',  // á mal codificado
  'Ã­': 'i',  // í mal codificado
  'Ã³': 'o',  // ó mal codificado
  'Ãº': 'u',  // ú mal codificado
  'Ã±': 'n',  // ñ mal codificado
  'Ã': 'a',   // à mal codificado
  'Â®': '',   // ® mal codificado
  'Â©': '',   // © mal codificado
  'Â´': '',   // ´ mal codificado
  'Ã¼': 'u',  // ü mal codificado
  'Ã©': 'e',  // é
  'Ã¨': 'e',  // è
  'Ã«': 'e',  // ë
  'Ã¯': 'i',  // ï
  'Ã´': 'o',  // ô
  'Ã¶': 'o',  // ö
  'Ã»': 'u',  // û
};

/**
 * Normalizar texto INCLUYENDO caracteres mal codificados
 */
function normalizarTexto(texto) {
  if (!texto) return '';
  
  let textoNormalizado = texto.toLowerCase();
  
  // 1️⃣ ARREGLAR caracteres mal codificados
  for (const [malCodificado, correcto] of Object.entries(CARACTERES_MAL_CODIFICADOS)) {
    textoNormalizado = textoNormalizado.split(malCodificado).join(correcto);
  }
  
  // 2️⃣ Normalización estándar
  textoNormalizado = textoNormalizado
    .normalize("NFD")                    // Descomponer acentos
    .replace(/[\u0300-\u036f]/g, "")    // Quitar marcas diacríticas
    .replace(/[®©™]/g, "")               // Quitar símbolos registrados
    .replace(/[^\w\s]/g, "")             // Quitar puntuación
    .replace(/\s+/g, " ")                // Normalizar espacios múltiples
    .trim();
  
  return textoNormalizado;
}

/**
 * Buscar producto en el menú - VERSIÓN FINAL V3
 */
function buscarProductoEnMenu(userInput, menu, tipo = null) {
  console.log(`\n🔍 buscarProductoEnMenu()`);
  console.log(`   Input original: "${userInput}"`);
  
  const inputNormalizado = normalizarTexto(userInput);
  console.log(`   Input normalizado: "${inputNormalizado}"`);
  
  // Obtener categorías según tipo
  const categorias = tipo === 'alimento'
    ? ['alimentos_salados', 'alimentos_dulces', 'alimentos_saludables', 'panaderia']
    : ['bebidas_calientes', 'bebidas_frias', 'frappuccino', 'bebidas_te'];
  
  const todosLosProductos = [];
  
  for (const cat of categorias) {
    if (menu[cat] && Array.isArray(menu[cat])) {
      todosLosProductos.push(...menu[cat].filter(p => p.disponible !== false));
    }
  }
  
  console.log(`   📦 Productos a buscar: ${todosLosProductos.length}`);
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1️⃣ BÚSQUEDA EXACTA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  for (const producto of todosLosProductos) {
    const nombreNormalizado = normalizarTexto(producto.nombre);
    
    if (nombreNormalizado === inputNormalizado) {
      console.log(`   ✅ MATCH EXACTO: "${producto.nombre}" (ID: ${producto.id})`);
      console.log(`      Original en menú: "${producto.nombre}"`);
      console.log(`      Normalizado: "${nombreNormalizado}"`);
      return { encontrado: true, producto };
    }
  }
  
  console.log(`   ⏭️ No hay match exacto, intentando sin espacios...`);
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2️⃣ BÚSQUEDA SIN ESPACIOS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  const inputSinEspacios = inputNormalizado.replace(/\s+/g, "");
  
  for (const producto of todosLosProductos) {
    const nombreSinEspacios = normalizarTexto(producto.nombre).replace(/\s+/g, "");
    
    if (nombreSinEspacios === inputSinEspacios) {
      console.log(`   ✅ MATCH SIN ESPACIOS: "${producto.nombre}" (ID: ${producto.id})`);
      return { encontrado: true, producto };
    }
  }
  
  console.log(`   ⏭️ No hay match sin espacios, intentando palabras...`);
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3️⃣ BÚSQUEDA POR PALABRAS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  const palabrasInput = inputNormalizado.split(/\s+/).filter(p => p.length > 0);
  console.log(`   Palabras: [${palabrasInput.join(", ")}]`);
  
  let mejorCoincidencia = null;
  let mejorScore = 0;
  
  for (const producto of todosLosProductos) {
    const nombreNormalizado = normalizarTexto(producto.nombre);
    const palabrasProducto = nombreNormalizado.split(/\s+/);
    
    let palabrasCoinciden = 0;
    
    for (const palabraInput of palabrasInput) {
      for (const palabraProd of palabrasProducto) {
        if (palabraInput === palabraProd) {
          palabrasCoinciden++;
          break;
        }
      }
    }
    
    const score = palabrasCoinciden / palabrasInput.length;
    
    if (score > mejorScore) {
      mejorScore = score;
      mejorCoincidencia = producto;
    }
  }
  
  if (mejorCoincidencia && mejorScore >= 0.5) {
    console.log(`   ✅ MATCH PALABRAS: "${mejorCoincidencia.nombre}" (ID: ${mejorCoincidencia.id})`);
    console.log(`      Score: ${(mejorScore * 100).toFixed(0)}%`);
    return { encontrado: true, producto: mejorCoincidencia };
  }
  
  console.log(`   ⏭️ No hay match de palabras suficiente, intentando fuzzy...`);
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4️⃣ BÚSQUEDA FUZZY
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  const palabrasLargas = palabrasInput.filter(p => p.length >= 5);
  
  if (palabrasLargas.length > 0) {
    mejorCoincidencia = null;
    mejorScore = 0;
    
    for (const producto of todosLosProductos) {
      const nombreNormalizado = normalizarTexto(producto.nombre);
      
      let coincidencias = 0;
      
      for (const palabra of palabrasLargas) {
        if (nombreNormalizado.includes(palabra)) {
          coincidencias++;
        }
      }
      
      const score = coincidencias / palabrasLargas.length;
      
      if (score > mejorScore) {
        mejorScore = score;
        mejorCoincidencia = producto;
      }
    }
    
    if (mejorCoincidencia && mejorScore >= 0.7) {
      console.log(`   ✅ MATCH FUZZY: "${mejorCoincidencia.nombre}" (ID: ${mejorCoincidencia.id})`);
      console.log(`      Score: ${(mejorScore * 100).toFixed(0)}%`);
      return { encontrado: true, producto: mejorCoincidencia };
    }
  }
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ❌ NO ENCONTRADO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  console.log(`   ❌ NO ENCONTRADO en ninguna estrategia`);
  
  return {
    encontrado: false,
    producto: null,
    sugerencias: []
  };
}


export default {
  getRecommendations,
  getRandomBeverage,
  getBeveragesByCategory,
  getPopularBeverages,
  searchBeverages,
  getFallbackRecommendations,
  normalizarTexto,
  buscarProductoEnMenu

};