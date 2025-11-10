import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = "menu Corporativo barranca response.json";
const OUTPUT_FILE = "menu_simplificado_CORRECTO.json";

/* =========================
   FUNCIONES AUXILIARES
========================= */

function isAvailable(item) {
  return item.inventory?.available === true;
}

function isSeasonal(item) {
  return JSON.stringify(item.categories || [])
    .toLowerCase()
    .includes("temporada");
}

function getCategoryPath(categories) {
  if (!categories) return [];
  const path = [];
  function traverse(catArr) {
    for (const cat of catArr) {
      if (cat.name) path.push(cat.name);
      if (cat.subCategory?.length) traverse(cat.subCategory);
    }
  }
  traverse(categories);
  return path;
}

function classifyProduct(name, categories = []) {
  const lower = name.toLowerCase();
  const catStr = JSON.stringify(categories).toLowerCase();

  if (
    catStr.includes("bebidas calientes") ||
    /latte|americano|mocha|espresso|cappuccino|macchiato|chai|chocolate|té caliente/.test(
      lower
    )
  )
    return "bebidas_calientes";

  if (
    catStr.includes("bebidas frías") ||
    /iced|frapp|refresher|cold brew|granizado/.test(lower)
  )
    return "bebidas_frias";

  if (
    catStr.includes("salado") ||
    /sandwich|panini|bowl|ensalada|baguette|wrap/.test(lower)
  )
    return "alimentos_salados";

  if (
    catStr.includes("dulce") ||
    /muffin|cookie|brownie|donut|roll|donas|dona|cronut|pasta/.test(lower)
  )
    return "alimentos_dulces";

  if (
    catStr.includes("postre") ||
    /cake|cheesecake|tart|pie|pasteles|brownie/.test(lower)
  )
    return "postres";

  if (
    catStr.includes("panadería") ||
    /croissant|bagel|pan|scone|muffin inglés/.test(lower)
  )
    return "panaderia";

  if (
    catStr.includes("fresco") ||
    /healthy|fresh|fruit|yogurt|granola|fruta|ensalada/.test(lower)
  )
    return "alimentos_saludables";

  if (
    catStr.includes("café en grano") ||
    /café en grano|coffee beans|whole bean/.test(lower)
  )
    return "cafe_en_grano";

  if (catStr.includes("té") || /té|tea|chai|matcha/.test(lower))
    return "te";

  return "otros";
}

/* =========================
   EXTRACCIÓN DE TAMAÑOS
========================= */

function getProductSizes(priceLevels = []) {
  /**
   * Extrae los tamaños disponibles del producto
   * CRÍTICO: Preserva el ID porque es lo que usan modificadores para referenciar precios
   */
  if (!priceLevels || priceLevels.length === 0) {
    return [];
  }

  return priceLevels
    .filter((pl) => pl.available !== false)
    .map((priceLevel) => ({
      id: priceLevel.id,
      nombre: priceLevel.description?.trim() || `Size ${priceLevel.id}`,
      precio: priceLevel.pricePerUnit || 0,
      disponible: true,
    }));
}

/* =========================
   EXTRACCIÓN DE TAMAÑO DEFAULT
========================= */

function getDefaultSize(priceLevels = [], priceBaseLevel = null) {
  /**
   * Encuentra cuál es el tamaño DEFAULT según priceBaseLevel
   * priceBaseLevel es un STRING que referencia el ID en priceLevels
   */
  if (!priceLevels || priceLevels.length === 0) {
    return null;
  }

  // Si hay priceBaseLevel, busca ese ID
  if (priceBaseLevel) {
    const defaultSize = priceLevels.find(
      (pl) => pl.id === priceBaseLevel && pl.available !== false
    );
    if (defaultSize) {
      return {
        id: defaultSize.id,
        nombre: defaultSize.description?.trim() || `Size ${defaultSize.id}`,
        precio: defaultSize.pricePerUnit || 0,
      };
    }
  }

  // Si no encuentra o no hay priceBaseLevel, retorna el primero disponible
  const firstAvailable = priceLevels.find((pl) => pl.available !== false);
  if (firstAvailable) {
    return {
      id: firstAvailable.id,
      nombre: firstAvailable.description?.trim() || `Size ${firstAvailable.id}`,
      precio: firstAvailable.pricePerUnit || 0,
    };
  }

  return null;
}

/* =========================
   EXTRACCIÓN DE MODIFICADORES
========================= */

function getProductModifiers(modifierGroups = []) {
  /**
   * Extrae los modificadores de un producto
   * CRÍTICO: Preserva la estructura de precios por tamaño
   * Diferencia entre requeridos y opcionales
   */
  if (!modifierGroups || modifierGroups.length === 0) {
    return [];
  }

  return modifierGroups
    .filter((group) => group.available !== false)
    .map((group) => {
      // Extraer precios por tamaño para cada modificador
      const opciones = group.modifiers
        .filter((mod) => mod.available !== false)
        .map((modifier) => {
          // Convertir array de priceLevels a objeto clave-valor {id: precio}
          const preciosPorTamano = {};

          if (modifier.priceLevels && Array.isArray(modifier.priceLevels)) {
            modifier.priceLevels.forEach((pl) => {
              if (pl.available !== false) {
                preciosPorTamano[pl.id] = pl.pricePerUnit || 0;
              }
            });
          }

          return {
            id: modifier.modifierId,
            nombre: modifier.name?.trim() || "Sin nombre",
            descripcion: modifier.description?.trim() || null,
            precios_por_tamano: preciosPorTamano,
            disponible: true,
          };
        });

      return {
        id: group.modifierGroupId,
        nombre: group.name?.trim() || "Sin nombre",
        requerido: group.required || false,
        minimo: group.min || 0,
        maximo: group.max || 1,
        disponible: true,
        opciones: opciones,
      };
    });
}

/* =========================
   FUNCIÓN PRINCIPAL: SIMPLIFY ITEM
========================= */

function simplifyItem(item) {
  /**
   * Simplifica un item RESPETANDO su estructura única
   * NO normaliza ni asume nada que no esté en el JSON
   */

  const sizes = getProductSizes(item.priceLevels);
  const defaultSize = getDefaultSize(item.priceLevels, item.priceBaseLevel);
  const modifiers = getProductModifiers(item.modifierGroups);

  return {
    // IDENTIFICACIÓN
    id: item.itemId,
    nombre: item.name?.trim(),
    descripcion: item.description?.trim(),

    // IMAGEN
    imagen: item.imagen || null,

    // TAMAÑOS Y PRECIOS - ESTRUCTURA CORRECTA
    tamaños: sizes,
    tamaño_default: defaultSize,

    // MODIFICADORES - ESTRUCTURA CORRECTA
    modificadores: modifiers,

    // CATEGORÍA
    categoria: getCategoryPath(item.categories).join(" > "),
    categorias_jerarquia: getCategoryPath(item.categories),

    // CLASIFICACIÓN AUTOMÁTICA
    categoria_principal: classifyProduct(item.name, item.categories),

    // FLAGS
    combo: item.combo || false,
    temporada: isSeasonal(item),
    promocion: item.promotion || false,
    disponible: item.inventory?.available === true,

    // RESTRICCIONES
    restriction: item.restriction || 0,

    // FECHAS
    fecha_inicio: item.startDate || null,
    fecha_fin: item.endDate || null,

    // POSICIÓN EN MENÚ
    posicion: item.position || null,
  };
}

/* =========================
   FUNCIÓN DE PROCESAMIENTO PRINCIPAL
========================= */

function processMenu(data) {
  /**
   * Procesa el menú completo y lo categoriza
   */

  const output = {
    bebidas_calientes: [],
    bebidas_frias: [],
    te: [],
    productos_temporada: [],
    productos_en_promocion: [],
    alimentos_salados: [],
    alimentos_dulces: [],
    postres: [],
    panaderia: [],
    alimentos_saludables: [],
    cafe_en_grano: [],
    combos: [],
    otros: [],

    // ÍNDICES PARA BÚSQUEDA RÁPIDA
    indice_por_id: {},
    indice_por_nombre: {},

    // RESUMEN Y METADATA
    resumen: {},
  };

  const items = data.content || [];
  let totalProcesados = 0;
  let totalSaltados = 0;

  for (const item of items) {
    if (!isAvailable(item)) {
      totalSaltados++;
      continue;
    }

    const simplified = simplifyItem(item);
    totalProcesados++;

    // AGREGAR A ÍNDICES
    output.indice_por_id[simplified.id] = simplified;
    output.indice_por_nombre[simplified.nombre.toLowerCase()] = simplified.id;

    // CLASIFICAR Y AGREGAR
    if (simplified.combo) {
      output.combos.push(simplified);
    } else if (simplified.promocion) {
      output.productos_en_promocion.push(simplified);
    } else if (simplified.temporada) {
      output.productos_temporada.push(simplified);
    } else {
      const category = simplified.categoria_principal;
      if (output[category]) {
        output[category].push(simplified);
      } else {
        output.otros.push(simplified);
      }
    }
  }

  // GENERAR RESUMEN
  output.resumen = {
    fecha_generacion: new Date().toISOString(),
    total_disponibles: totalProcesados,
    total_saltados: totalSaltados,
    total_items: totalProcesados + totalSaltados,
    porcentaje_disponibilidad: (
      (totalProcesados / (totalProcesados + totalSaltados)) *
      100
    ).toFixed(2),
    por_categoria: {
      bebidas_calientes: output.bebidas_calientes.length,
      bebidas_frias: output.bebidas_frias.length,
      te: output.te.length,
      alimentos_salados: output.alimentos_salados.length,
      alimentos_dulces: output.alimentos_dulces.length,
      postres: output.postres.length,
      panaderia: output.panaderia.length,
      alimentos_saludables: output.alimentos_saludables.length,
      cafe_en_grano: output.cafe_en_grano.length,
      combos: output.combos.length,
      productos_temporada: output.productos_temporada.length,
      productos_en_promocion: output.productos_en_promocion.length,
      otros: output.otros.length,
    },
  };

  return output;
}

/* =========================
   FUNCIONES PARA USAR CON EL MENÚ SIMPLIFICADO
========================= */

/**
 * Buscar producto por ID
 */
function findProductById(menu, productId) {
  return menu.indice_por_id[productId] || null;
}

/**
 * Buscar producto por nombre (flexible)
 */
function findProductByName(menu, name) {
  const nameLower = name.toLowerCase();

  // Búsqueda exacta
  if (menu.indice_por_nombre[nameLower]) {
    return findProductById(menu, menu.indice_por_nombre[nameLower]);
  }

  // Búsqueda parcial
  for (const [key, id] of Object.entries(menu.indice_por_nombre)) {
    if (
      key.includes(nameLower) ||
      nameLower.includes(key) ||
      key.indexOf(nameLower) !== -1
    ) {
      return findProductById(menu, id);
    }
  }

  return null;
}

/**
 * Calcular precio de una orden
 */
function calculateOrderPrice(product, selectedSizeId, selectedModifiers = []) {
  // 1. Precio del tamaño base
  const sizePrice = product.tamaños.find((t) => t.id === selectedSizeId)
    ?.precio;

  if (sizePrice === undefined) {
    return {
      valido: false,
      error: `Tamaño ${selectedSizeId} no disponible`,
    };
  }

  // 2. Sumar precios de modificadores
  let modifierPrice = 0;
  const modifierDetails = [];

  for (const selected of selectedModifiers) {
    const group = product.modificadores.find((m) => m.id === selected.grupoId);

    if (!group) {
      return {
        valido: false,
        error: `Grupo de modificador no encontrado: ${selected.grupoId}`,
      };
    }

    const option = group.opciones.find((o) => o.id === selected.opcionId);

    if (!option) {
      return {
        valido: false,
        error: `Modificador no encontrado: ${selected.opcionId}`,
      };
    }

    const modPrice = option.precios_por_tamano[selectedSizeId] || 0;
    modifierPrice += modPrice;

    modifierDetails.push({
      grupo: group.nombre,
      opcion: option.nombre,
      precio: modPrice,
    });
  }

  return {
    valido: true,
    precio_base: sizePrice,
    precio_modificadores: modifierPrice,
    detalles_modificadores: modifierDetails,
    total: sizePrice + modifierPrice,
  };
}

/**
 * Validar orden
 */
function validateOrder(product, selectedSizeId, selectedModifiers = []) {
  const errores = [];

  // 1. Validar tamaño
  if (!product.tamaños.find((t) => t.id === selectedSizeId)) {
    errores.push("Tamaño seleccionado no disponible para este producto");
  }

  // 2. Para cada grupo de modificadores
  for (const grupo of product.modificadores) {
    const seleccionadosDelGrupo = selectedModifiers.filter(
      (m) => m.grupoId === grupo.id
    );

    // Validar si es requerido
    if (grupo.requerido && seleccionadosDelGrupo.length === 0) {
      errores.push(
        `${grupo.nombre}: REQUERIDO (mínimo ${grupo.minimo} opción)`
      );
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
      if (!grupo.opciones.find((o) => o.id === sel.opcionId)) {
        errores.push(
          `${grupo.nombre}: Opción no válida (${sel.opcionId})`
        );
      }
    }
  }

  return {
    valido: errores.length === 0,
    errores,
  };
}

/* =========================
   EXPORTAR FUNCIONES
========================= */

export {
  processMenu,
  simplifyItem,
  findProductById,
  findProductByName,
  calculateOrderPrice,
  validateOrder,
  getProductSizes,
  getProductModifiers,
  getDefaultSize,
};

/* =========================
   EJECUCIÓN
========================= */

try {
  console.log("☕ Procesando menú Starbucks (ESTRUCTURA CORRECTA)");

  const inputPath = path.join(__dirname, INPUT_FILE);

  // Verificar que el archivo existe
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Archivo no encontrado: ${inputPath}`);
  }

  const rawData = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const result = processMenu(rawData);

  const outputPath = path.join(__dirname, OUTPUT_FILE);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

  console.log(` ✅ Archivo generado: ${OUTPUT_FILE}`);

  // MOSTRAR RESUMEN
  console.log("\n📊 RESUMEN DEL PROCESAMIENTO:");
  console.log("═".repeat(50));

  console.log(`Total disponibles: ${result.resumen.total_disponibles}`);
  console.log(`Total saltados: ${result.resumen.total_saltados}`);
  console.log(
    `Disponibilidad: ${result.resumen.porcentaje_disponibilidad}%\n`
  );

  console.log("POR CATEGORÍA:");
  for (const [cat, count] of Object.entries(result.resumen.por_categoria)) {
    if (count > 0) {
      console.log(`  ${cat}: ${count}`);
    }
  }

  // EJEMPLO DE USO
  console.log("\n" + "═".repeat(50));
  console.log("EJEMPLOS DE USO:");
  console.log("═".repeat(50));

  // Buscar producto
  const producto = findProductByName(result, "Chocolate");
  if (producto) {
    console.log(`\n1. Producto encontrado: ${producto.nombre}`);
    console.log(`   Tamaños disponibles: ${producto.tamaños.map((t) => t.nombre).join(", ")}`);
    console.log(`   Tamaño default: ${producto.tamaño_default.nombre}`);

    // Validar orden
    const sizeId = producto.tamaño_default.id;
    const modificadores = [];

    // Agregar modificadores requeridos con primera opción
    for (const mod of producto.modificadores) {
      if (mod.requerido && mod.opciones.length > 0) {
        modificadores.push({
          grupoId: mod.id,
          opcionId: mod.opciones[0].id,
        });
      }
    }

    const validacion = validateOrder(producto, sizeId, modificadores);
    console.log(
      `\n2. Validación de orden: ${validacion.valido ? "✅ VÁLIDA" : "❌ INVÁLIDA"}`
    );
    if (!validacion.valido) {
      console.log(`   Errores: ${validacion.errores.join(", ")}`);
    }

    // Calcular precio
    const precio = calculateOrderPrice(producto, sizeId, modificadores);
    console.log(
      `\n3. Cálculo de precio: ${precio.valido ? "✅ VÁLIDO" : "❌ INVÁLIDO"}`
    );
    if (precio.valido) {
      console.log(`   Precio base: $${precio.precio_base}`);
      if (precio.detalles_modificadores.length > 0) {
        console.log(`   Modificadores:`);
        precio.detalles_modificadores.forEach((m) => {
          if (m.precio > 0) {
            console.log(`     - ${m.opcion}: +$${m.precio}`);
          }
        });
      }
      console.log(`   TOTAL: $${precio.total}`);
    }
  }

  console.log("\n✅ Procesamiento completado correctamente");
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}