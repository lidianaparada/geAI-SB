import fs from "fs";

// Carga el archivo original
const rawData = fs.readFileSync("./Menú Mexico SDS.json", "utf-8");
const data = JSON.parse(rawData);

// Estructura base del nuevo menú
const menuSimplificado = {
  bebidas_calientes: [],
  bebidas_frias: [],
  alimentos: [],
  opciones: {
    leches: [],
    endulzantes: [],
    tamanos: ["Short", "Tall", "Grande", "Venti"]
  },
};

// Función de clasificación por nombre
function clasificarProducto(nombre) {
  const n = nombre.toLowerCase();

  // --- Bebidas calientes ---
  if (
    n.includes("latte") ||
    n.includes("americano") ||
    n.includes("mocha") ||
    n.includes("macchiato") ||
    n.includes("espresso") ||
    n.includes("hot") ||
    n.includes("chai") ||
    n.includes("chocolate")
  ) {
    return "bebida_caliente";
  }

  // --- Bebidas frías ---
  if (
    n.includes("iced") ||
    n.includes("frapp") ||
    n.includes("cold") ||
    n.includes("lemonade") ||
    n.includes("refresher") ||
    n.includes("açaí") ||
    n.includes("acai")
  ) {
    return "bebida_fria";
  }

  // --- Alimentos dulces ---
  if (
    n.includes("croissant") ||
    n.includes("cheesecake") ||
    n.includes("cookie") ||
    n.includes("cake") ||
    n.includes("doughnut") ||
    n.includes("cronut") ||
    n.includes("pan de queso") ||
    n.includes("roulet")
  ) {
    return "alimento_dulce";
  }

  // --- Alimentos salados ---
  if (
    n.includes("baguette") ||
    n.includes("sandwich") ||
    n.includes("panini") ||
    n.includes("ham") ||
    n.includes("queso") ||
    n.includes("turkey")
  ) {
    return "alimento_salado";
  }

  // --- Leches ---
  if (
    n.includes("milk") ||
    n.includes("leche") ||
    n.includes("almond") ||
    n.includes("soya") ||
    n.includes("coconut") ||
    n.includes("oat")
  ) {
    return "leche";
  }

  // --- Endulzantes / Jarabes ---
  if (
    n.includes("syrup") ||
    n.includes("jarabe") ||
    n.includes("sugar") ||
    n.includes("vainilla") ||
    n.includes("caramelo") ||
    n.includes("avellana") ||
    n.includes("canela")
  ) {
    return "endulzante";
  }

  return null;
}

// Detectar tamaño por nombre
function detectarTamano(nombre) {
  const n = nombre.toLowerCase();
  if (n.includes("short")) return "Short";
  if (n.includes("tall")) return "Tall";
  if (n.includes("gr")) return "Grande";
  if (n.includes("venti") || n.includes("vt")) return "Venti";
  return null;
}

// Procesar productos
for (const item of data) {
  if (item.type !== "ITEM") continue;

  const nombre =
    item.translations?.find((t) => t.language === "es_MX")?.name ||
    item.name.replace("MEX", "").trim();

  const categoria = clasificarProducto(nombre);
  const tamano = detectarTamano(item.name);
  const entry = { nombre, sku: item.sku };
  if (tamano) entry.tamano = tamano;

  switch (categoria) {
    case "bebida_caliente":
      menuSimplificado.bebidas_calientes.push(entry);
      break;
    case "bebida_fria":
      menuSimplificado.bebidas_frias.push(entry);
      break;
    case "alimento_dulce":
      menuSimplificado.alimentos.push({ ...entry, tipo: "dulce" });
      break;
    case "alimento_salado":
      menuSimplificado.alimentos.push({ ...entry, tipo: "salado" });
      break;
    case "leche":
      if (!menuSimplificado.opciones.leches.includes(nombre.toLowerCase()))
        menuSimplificado.opciones.leches.push(nombre.toLowerCase());
      break;
    case "endulzante":
      if (!menuSimplificado.opciones.endulzantes.includes(nombre.toLowerCase()))
        menuSimplificado.opciones.endulzantes.push(nombre.toLowerCase());
      break;
  }
}

// Limpieza final
menuSimplificado.opciones.leches = [...new Set(menuSimplificado.opciones.leches)];
menuSimplificado.opciones.endulzantes = [...new Set(menuSimplificado.opciones.endulzantes)];

// Guarda el archivo simplificado
fs.writeFileSync("./menu_simplificado.json", JSON.stringify(menuSimplificado, null, 2), "utf-8");

console.log("✅ Menú simplificado generado con tamaños: menu_simplificado.json");
