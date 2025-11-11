import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================
// CONFIGURACIÓN
// =========================
const INPUT_FILE = "Menú Mexico SDS.json";
const OUTPUT_FILE = "menu_simplificadoV2.json";

// =========================
// FUNCIÓN: Limpiar nombre de producto
// =========================
function cleanProductName(name, translations = []) {
  // Buscar nombre en español
  const esTranslation = translations.find(t => t.language === "es_MX");
  let cleanName = esTranslation?.name || name;
  
  // Limpiar prefijos comunes
  cleanName = cleanName
    .replace(/^MEX\s+/i, '')
    .replace(/\s+MOP$/i, '')
    .replace(/\s+DELIVERY$/i, '')
    .replace(/\s+BIS$/i, '')
    .replace(/\s+Wb\s+\d+\/Cs/i, '')
    .replace(/\d+g$/i, '')
    .trim();
  
  return cleanName;
}

// =========================
// FUNCIÓN: Detectar categoría de producto
// =========================
function categorizeProduct(name, productId) {
  const lower = name.toLowerCase();
  
  // TÉ Y CHAI (PRIMERO - antes que latte)
  if (lower.includes("chai") || 
      (lower.includes("tea") && !lower.includes("steam"))) {
    return "te";
  }
  
  // Bebidas frías - Iced (ANTES que calientes)
  if (lower.includes("iced") && !lower.includes("frapp")) {
    return "bebidas_frias";
  }
  
  // Frappuccinos
  if (lower.includes("frapp")) {
    return "bebidas_frias";
  }
  
  // Refreshers y bebidas de frutas
  if (lower.includes("refresher") || lower.includes("lemonade") || 
      lower.includes("acai") || lower.includes("açaí") ||
      lower.includes("dragonfruit") || lower.includes("mango") ||
      lower.includes("strawberry") && lower.includes("drink")) {
    return "bebidas_frias";
  }
  
  // Shaken Espresso y Cold Foam
  if (lower.includes("shaken") || lower.includes("cold foam")) {
    return "bebidas_frias";
  }
  
  // Chocolate caliente (ANTES que mocha)
  if ((lower.includes("chocolate") && 
       (lower.includes("hot") || lower.includes("classic"))) && 
      !lower.includes("cake") && !lower.includes("croissant") &&
      !lower.includes("white chocolate mocha")) {
    return "bebidas_calientes";
  }
  
  // Bebidas calientes (café base)
  if ((lower.includes("latte") || lower.includes("mocha") || 
       lower.includes("americano") || lower.includes("cappuccino") ||
       lower.includes("macchiato") || lower.includes("espresso")) && 
      !lower.includes("iced") && !lower.includes("frapp")) {
    return "bebidas_calientes";
  }
  
  // Café del día / Café filtrado
  if ((lower.includes("chiapas") || lower.includes("café del día") ||
       lower.includes("coffee of") || lower.includes("drip")) &&
      !lower.includes("250g")) {
    return "te"; // Lo ponemos en té para bebidas alternativas
  }
  
  // Café en grano
  if (lower.includes("250g") || lower.includes("wb") || 
      (lower.includes("esp ") && lower.includes("cs")) ||
      lower.includes("sumatra") || lower.includes("verona")) {
    return "cafe_grano";
  }
  
  // Alimentos salados (más específico)
  if (lower.includes("panini") || 
      (lower.includes("sandwich") && !lower.includes("cookie")) || 
      lower.includes("bagel") || lower.includes("baguette") ||
      (lower.includes("ham") && lower.includes("cheese")) ||
      (lower.includes("turkey") && !lower.includes("sweet")) ||
      lower.includes("grilled cheese")) {
    return "alimentos_salados";
  }
  
  // Frutas y yogurt
  if (lower.includes("fruit cup") || lower.includes("yogurt") ||
      lower.includes("granola")) {
    return "alimentos_salados"; // O crear categoría "saludables"
  }
  
  // Postres (más exhaustivo)
  if (lower.includes("cake") || lower.includes("croissant") || 
      lower.includes("donut") || lower.includes("doughnut") ||
      lower.includes("cookies") || lower.includes("cookie") ||
      lower.includes("cheesecake") || lower.includes("cronut") ||
      lower.includes("loaf") || lower.includes("pan de queso") ||
      lower.includes("roulet") || lower.includes("pain au")) {
    return "postres";
  }
  
  return null;
}

// =========================
// FUNCIÓN: Procesar JSON original
// =========================
function processMenu(rawData) {
  const menu = {
    bebidas_calientes: [],
    bebidas_frias: [],
    te: [],
    alimentos_salados: [],
    postres: [],
    cafe_grano: [],
    extras: {
      leches: ["Entera", "Descremada", "Almendra", "Coco", "Soya", "Avena"],
      salsas: ["Mocha", "Caramelo", "Chocolate Blanco", "Chai", "Fresa"],
      jarabes: ["Vainilla", "Caramelo", "Avellana", "Canela", "Frambuesa", "Coco", "Menta"],
      endulzantes: ["Normal", "Light", "Sin azúcar"],
      toppings: ["Crema batida", "Drizzle de caramelo", "Drizzle de mocha"],
      temperatura: ["Extra caliente", "Caliente", "Tibio"]
    },
    metadata: {
      contextos: {
        manana: {
          descripcion: "6:00 - 11:00",
          sugerencias: ["Americano", "Latte", "Cappuccino", "Croissant", "Bagel"]
        },
        tarde: {
          descripcion: "12:00 - 18:00",
          sugerencias: ["Frappuccino", "Iced Latte", "Refreshers", "Panini"]
        },
        noche: {
          descripcion: "19:00 - 22:00",
          sugerencias: ["Chocolate Caliente", "Chai Tea Latte", "Mocha"]
        }
      },
      recomendaciones_clima: {
        calor: ["Frappuccino", "Iced Coffee", "Refreshers", "Cold Foam Cappuccino"],
        frio: ["Latte", "Americano", "Chocolate Caliente", "Mocha"],
        templado: ["Iced Latte", "Cappuccino", "Chai Tea"]
      },
      recomendaciones_perfil: {
        energia: ["Americano", "Espresso", "Shaken Espresso"],
        dulce: ["Frappuccino", "Mocha", "Caramel Macchiato"],
        ligero: ["Americano", "Té", "Refreshers"],
        cremoso: ["Latte", "Cappuccino", "White Chocolate Mocha"]
      },
      preguntas_flujo: {
        "1_inicial": "¿Qué te gustaría hoy?",
        "2_categoria": "¿Algo caliente o frío?",
        "3_tipo": "¿Café, té o algo dulce?",
        "4_tamano": "¿Qué tamaño? Tall, Grande o Venti",
        "5_personalizacion": "¿Con qué leche?",
        "6_extras": "¿Le agregamos algo?",
        "7_alimento": "¿Algo para acompañar?",
        "8_confirmacion": "Tu pedido: [RESUMEN]. ¿Algo más?",
        "9_cierre": "Total: $[X] pesos. Pasa a caja"
      }
    }
  };
  
  const seen = new Set();
  const products = {};
  
  // Agrupar productos por categoría
  rawData.forEach(item => {
    if (item.type !== "ITEM" || !item.name || !item.productId) return;
    
    const cleanName = cleanProductName(item.name, item.translations);
    const category = categorizeProduct(item.name, item.productId);
    
    if (!category) return;
    
    // Evitar duplicados (diferentes tamaños del mismo producto)
    const baseKey = cleanName.toLowerCase()
      .replace(/\s+(tall|grande|venti|tl|gr|vt|sh)/gi, '')
      .trim();
    
    if (seen.has(baseKey)) return;
    seen.add(baseKey);
    
    // Crear objeto de producto
    const product = {
      nombre: cleanName,
      sku: item.sku
    };
    
    // Agregar campos específicos por categoría
    if (category.includes("bebidas") || category === "te") {
      product.tamaños = ["Tall", "Grande", "Venti"];
      
      // Calcular precio base estimado (más preciso)
      if (item.name.toLowerCase().includes("americano")) {
        product.precio_base = 45;
      } else if (item.name.toLowerCase().includes("chai")) {
        product.precio_base = 60;
      } else if (item.name.toLowerCase().includes("latte") && 
                 !item.name.toLowerCase().includes("macchiato")) {
        product.precio_base = 55;
      } else if (item.name.toLowerCase().includes("macchiato")) {
        product.precio_base = 65;
      } else if (item.name.toLowerCase().includes("cappuccino")) {
        product.precio_base = 60;
      } else if (item.name.toLowerCase().includes("mocha")) {
        product.precio_base = 65;
      } else if (item.name.toLowerCase().includes("frapp")) {
        product.precio_base = 75;
      } else if (item.name.toLowerCase().includes("refresher") || 
                 item.name.toLowerCase().includes("lemonade")) {
        product.precio_base = 65;
      } else if (item.name.toLowerCase().includes("chocolate")) {
        product.precio_base = 55;
      } else if (item.name.toLowerCase().includes("chiapas") ||
                 item.name.toLowerCase().includes("café del día")) {
        product.precio_base = 40;
      } else {
        product.precio_base = 60;
      }
      
      // Tipo de bebida fría
      if (category === "bebidas_frias") {
        if (item.name.toLowerCase().includes("frapp")) {
          product.tipo = "frappuccino";
        } else if (item.name.toLowerCase().includes("refresher") ||
                   item.name.toLowerCase().includes("lemonade") ||
                   item.name.toLowerCase().includes("mango") ||
                   item.name.toLowerCase().includes("strawberry")) {
          product.tipo = "refresher";
        } else if (item.name.toLowerCase().includes("shaken")) {
          product.tipo = "shaken";
        } else if (item.name.toLowerCase().includes("cold foam")) {
          product.tipo = "cold_foam";
        } else {
          product.tipo = "iced";
        }
      }
      
      // Tipo de té/bebida alternativa
      if (category === "te") {
        if (item.name.toLowerCase().includes("chai")) {
          product.tipo = "chai";
        } else if (item.name.toLowerCase().includes("chiapas") ||
                   item.name.toLowerCase().includes("café del día")) {
          product.tipo = "cafe_filtrado";
        } else {
          product.tipo = "te";
        }
      }
      
      // Descafeinado
      if (item.name.toLowerCase().includes("decaf")) {
        product.descafeinado = true;
      }
    }
    
    // Alimentos
    if (category.includes("alimentos") || category === "postres") {
      // Precios más específicos
      if (cleanName.toLowerCase().includes("croissant") && 
          !cleanName.toLowerCase().includes("chocolate")) {
        product.precio = 35;
      } else if (cleanName.toLowerCase().includes("croissant")) {
        product.precio = 40;
      } else if (cleanName.toLowerCase().includes("panini")) {
        product.precio = 65;
      } else if (cleanName.toLowerCase().includes("bagel")) {
        product.precio = 50;
      } else if (cleanName.toLowerCase().includes("cake")) {
        product.precio = 50;
      } else if (cleanName.toLowerCase().includes("cheesecake")) {
        product.precio = 55;
      } else if (cleanName.toLowerCase().includes("cookie") ||
                 cleanName.toLowerCase().includes("pan de queso")) {
        product.precio = 35;
      } else if (cleanName.toLowerCase().includes("yogurt")) {
        product.precio = 45;
      } else if (category === "postres") {
        product.precio = 45;
      } else {
        product.precio = 60;
      }
      
      product.requiere_calentar = 
        cleanName.toLowerCase().includes("panini") ||
        (cleanName.toLowerCase().includes("croissant") && 
         cleanName.toLowerCase().includes("chocolate")) ||
        (cleanName.toLowerCase().includes("croissant") && 
         cleanName.toLowerCase().includes("ham"));
    }
    
    // Café en grano
    if (category === "cafe_grano") {
      product.peso = "250g";
      product.precio = 180;
      
      // Tipo de tueste
      if (cleanName.toLowerCase().includes("espresso")) {
        product.tueste = "oscuro";
      } else if (cleanName.toLowerCase().includes("verona")) {
        product.tueste = "oscuro";
      } else if (cleanName.toLowerCase().includes("sumatra")) {
        product.tueste = "oscuro";
      } else {
        product.tueste = "medio";
      }
    }
    
    menu[category].push(product);
  });
  
  // Ordenar por nombre
  Object.keys(menu).forEach(key => {
    if (Array.isArray(menu[key])) {
      menu[key].sort((a, b) => a.nombre.localeCompare(b.nombre));
    }
  });
  
  return menu;
}

// =========================
// EJECUTAR PROCESAMIENTO
// =========================
try {
  console.log("🔄 Procesando menú original...\n");
  
  const inputPath = path.join(__dirname, INPUT_FILE);
  const outputPath = path.join(__dirname, OUTPUT_FILE);
  
  // Leer JSON original
  const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  console.log(`✅ Leído: ${rawData.length} items del menú original`);
  
  // Procesar
  const synthesizedMenu = processMenu(rawData);
  
  // Guardar
  fs.writeFileSync(
    outputPath,
    JSON.stringify(synthesizedMenu, null, 2),
    'utf-8'
  );
  
  console.log(`✅ Guardado: ${OUTPUT_FILE}\n`);
  console.log("📊 Estadísticas del menú sintetizado:");
  console.log(`   🔥 Bebidas calientes: ${synthesizedMenu.bebidas_calientes.length}`);
  console.log(`   ❄️ Bebidas frías: ${synthesizedMenu.bebidas_frias.length}`);
  console.log(`   🫖 Té y alternativas: ${synthesizedMenu.te.length}`);
  console.log(`   🥪 Alimentos salados: ${synthesizedMenu.alimentos_salados.length}`);
  console.log(`   🍰 Postres: ${synthesizedMenu.postres.length}`);
  console.log(`   ☕ Café en grano: ${synthesizedMenu.cafe_grano.length}`);
  
  // Mostrar algunos productos de cada categoría
  console.log("\n📋 Vista previa:");
  console.log("\n🔥 Bebidas calientes:");
  synthesizedMenu.bebidas_calientes.slice(0, 3).forEach(b => 
    console.log(`   - ${b.nombre} (${b.precio_base})`));
  
  console.log("\n❄️ Bebidas frías:");
  synthesizedMenu.bebidas_frias.slice(0, 3).forEach(b => 
    console.log(`   - ${b.nombre} [${b.tipo}] (${b.precio_base})`));
  
  console.log("\n🫖 Té y alternativas:");
  synthesizedMenu.te.forEach(t => 
    console.log(`   - ${t.nombre} [${t.tipo || 'té'}] (${t.precio_base})`));
  
  console.log(`\n✅ Proceso completado exitosamente`);
  
} catch (error) {
  console.error("❌ Error:", error.message);
  process.exit(1);
}