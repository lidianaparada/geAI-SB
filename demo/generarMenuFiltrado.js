/**
 * Script para generar JSON filtrado de menú
 * Filtra: Bebidas Calientes y Recién Horneados
 * 
 * Estructura de entrada esperada:
 * {
 *   "content": [
 *     {
 *       "itemId": "...",
 *       "name": "...",
 *       "categories": [
 *         {
 *           "name": "Bebidas",
 *           "subCategory": [
 *             {
 *               "name": "Bebidas Calientes",  <-- Primera subcategoría (filtro)
 *               "subCategory": [
 *                 { "name": "Espresso Tradicional" }  <-- Segunda subcategoría
 *               ]
 *             }
 *           ]
 *         }
 *       ],
 *       "modifierGroups": [...],
 *       "priceLevels": [...]
 *     }
 *   ]
 * }
 * 
 * Uso: node generarMenuFiltrado.js
 */

 import fs from 'fs';
 import path from 'path';
 import { fileURLToPath } from 'url';
 
 const __filename = fileURLToPath(import.meta.url);
 const __dirname = path.dirname(__filename);
 
 // ============================================
 // CONFIGURACIÓN
 // ============================================
 
 const CONFIG = {
   // Archivo de entrada
   archivoEntrada: './respaldo/menu Corporativo barranca response.json',
   
   // Archivo de salida
   archivoSalida: './demo/menu_bebidas_y_horneados.json',
   
   // Primera subcategoría a filtrar
   filtros: {
     bebidas_calientes: 'Bebidas Calientes',
     recien_horneados: 'Recién Horneados'
   }
 };
 
 // ============================================
 // FUNCIÓN PARA EXTRAER RUTA DE CATEGORÍAS
 // ============================================
 
 function getCategoriaPath(categories) {
   /**
    * Extrae la ruta completa de categorías como array
    * Ejemplo: ["Bebidas", "Bebidas Calientes", "Espresso Tradicional"]
    */
   if (!categories || categories.length === 0) {
     return [];
   }
   
   const path = [];
   let cat = categories[0];
   
   while (cat) {
     path.push(cat.name || '');
     const subcats = cat.subCategory || [];
     cat = subcats.length > 0 ? subcats[0] : null;
   }
   
   return path;
 }
 
 // ============================================
 // FUNCIÓN PARA TRANSFORMAR PRODUCTO
 // ============================================
 
 function transformarProducto(producto, categoriaPath) {
   /**
    * Transforma el producto al formato simplificado
    */
   
   // Extraer tamaños de priceLevels
   const tamanos = (producto.priceLevels || []).map(pl => ({
     id: pl.id,
     nombre: getSizeNombre(pl.id, pl.description),
     precio: pl.pricePerUnit,
     disponible: pl.available
   }));
   
   // Determinar tamaño default
   const defaultSizeId = producto.priceBaseLevel || '3';
   const tamanoDefault = tamanos.find(t => t.id === defaultSizeId) || tamanos[0] || null;
   
   // Transformar modificadores
   const modificadores = (producto.modifierGroups || []).map(mg => ({
     id: mg.modifierGroupId,
     nombre: mg.name,
     requerido: mg.required,
     minimo: mg.min,
     maximo: mg.max,
     disponible: mg.available,
     opciones: (mg.modifiers || []).map(mod => ({
       id: mod.modifierId,
       nombre: mod.name,
       descripcion: mod.description,
       precios_por_tamano: (mod.priceLevels || []).reduce((acc, pl) => {
         acc[pl.id] = pl.pricePerUnit;
         return acc;
       }, {}),
       disponible: mod.available
     }))
   }));
   
   return {
     id: producto.itemId,
     nombre: producto.name,
     descripcion: producto.description || '',
     imagen: producto.imagen || '',
     tamaños: tamanos,
     tamaño_default: tamanoDefault,
     modificadores: modificadores,
     categoria: categoriaPath.join(' > '),
     categorias_jerarquia: categoriaPath,
     categoria_principal: categoriaPath[0] || '',
     subcategoria: categoriaPath[2] || null, // Segunda subcategoría
     combo: producto.combo || false,
     temporada: false,
     promocion: producto.promotion || false,
     disponible: producto.inventory?.available ?? true,
     inventario: producto.inventory?.stock || 0,
     restriction: producto.restriction || 0,
     fecha_inicio: producto.startDate || '',
     fecha_fin: producto.endDate || '',
     posicion: producto.position || null,
     nutrientes: producto.nutrients?.[0] || null
   };
 }
 
 function getSizeNombre(id, description) {
   /**
    * Convierte ID de tamaño a nombre legible
    */
   const sizeNames = {
     '1': 'Size 1',
     '2': 'Alto (12oz - 350ml)',
     '3': 'Grande (16oz - 437ml)',
     '4': 'Venti (20oz - 606ml)'
   };
   
   if (description && description.trim() && description.trim() !== '-') {
     return description.trim();
   }
   
   return sizeNames[id] || `Size ${id}`;
 }
 
 // ============================================
 // FUNCIÓN PARA CORREGIR CODIFICACIÓN UTF-8
 // ============================================
 
 function fixEncoding(text) {
   if (typeof text !== 'string') return text;
   
   try {
     const buffer = Buffer.from(text, 'latin1');
     const fixed = buffer.toString('utf8');
     if (!fixed.includes('�')) {
       return fixed;
     }
   } catch (e) {
     // Si falla, devolver el texto original
   }
   
   return text;
 }
 
 function fixObjectEncoding(obj) {
   if (obj === null || obj === undefined) {
     return obj;
   }
   
   if (Array.isArray(obj)) {
     return obj.map(item => fixObjectEncoding(item));
   }
   
   if (typeof obj === 'object') {
     const fixed = {};
     for (const [key, value] of Object.entries(obj)) {
       const fixedKey = fixEncoding(key);
       fixed[fixedKey] = fixObjectEncoding(value);
     }
     return fixed;
   }
 
   if (typeof obj === 'string') {
     return fixEncoding(obj);
   }
 
   return obj;
 }
 
 // ============================================
 // FUNCIÓN PRINCIPAL
 // ============================================
 
 function generarMenuFiltrado() {
   console.log('🚀 Iniciando generación de menú filtrado...\n');
   
   // 1. Leer archivo de entrada
   console.log(`📂 Leyendo: ${CONFIG.archivoEntrada}`);
   
   let menuOriginal;
   try {
     const contenido = fs.readFileSync(CONFIG.archivoEntrada, 'utf8');
     menuOriginal = JSON.parse(contenido);
   } catch (error) {
     console.error(`❌ Error al leer el archivo: ${error.message}`);
     process.exit(1);
   }
   
   // Obtener array de productos
   const productos = menuOriginal.content || menuOriginal;
   
   if (!Array.isArray(productos)) {
     console.error('❌ El archivo no tiene la estructura esperada (content: [...])');
     process.exit(1);
   }
   
   console.log(`   Encontrados ${productos.length} productos en total\n`);
   
   // 2. Estructura del menú filtrado
   const menuFiltrado = {
     bebidas_calientes: {
       nombre: 'Bebidas Calientes',
       emoji: '☕',
       ruta: 'Bebidas > Bebidas Calientes',
       subcategorias: [],
       productos: [],
       por_subcategoria: {}
     },
     recien_horneados: {
       nombre: 'Recién Horneados',
       emoji: '🥐',
       ruta: 'Alimentos > Recién Horneados',
       subcategorias: [],
       productos: [],
       por_subcategoria: {}
     },
     metadata: {
       version: '2.0',
       fecha_generacion: new Date().toISOString(),
       descripcion: 'Menú filtrado por Bebidas Calientes y Recién Horneados',
       estructura: 'Clasificación por primera subcategoría, conservando segunda subcategoría',
       archivo_origen: CONFIG.archivoEntrada
     }
   };
   
   // 3. Filtrar y transformar productos
   console.log('🔍 Filtrando productos...\n');
   
   for (const producto of productos) {
     const categoriaPath = getCategoriaPath(producto.categories);
     
     if (categoriaPath.length < 2) continue;
     
     const primeraSubcat = categoriaPath[1]; // Bebidas Calientes, Recién Horneados, etc.
     
     // Transformar producto
     const productoTransformado = transformarProducto(producto, categoriaPath);
     
     // Filtrar por Bebidas Calientes
     if (primeraSubcat === CONFIG.filtros.bebidas_calientes) {
       menuFiltrado.bebidas_calientes.productos.push(productoTransformado);
     }
     
     // Filtrar por Recién Horneados
     if (primeraSubcat === CONFIG.filtros.recien_horneados) {
       menuFiltrado.recien_horneados.productos.push(productoTransformado);
     }
   }
   
   // 4. Organizar por subcategoría
   console.log('📦 Organizando por subcategorías...\n');
   
   for (const catKey of ['bebidas_calientes', 'recien_horneados']) {
     const porSubcat = {};
     
     for (const producto of menuFiltrado[catKey].productos) {
       const subcat = producto.subcategoria || 'Otros';
       
       if (!porSubcat[subcat]) {
         porSubcat[subcat] = [];
       }
       porSubcat[subcat].push(producto);
     }
     
     menuFiltrado[catKey].por_subcategoria = porSubcat;
     menuFiltrado[catKey].subcategorias = Object.keys(porSubcat);
   }
   
   // 5. Agregar resumen
   menuFiltrado.resumen = {
     bebidas_calientes: {
       total: menuFiltrado.bebidas_calientes.productos.length,
       subcategorias: menuFiltrado.bebidas_calientes.subcategorias
     },
     recien_horneados: {
       total: menuFiltrado.recien_horneados.productos.length,
       subcategorias: menuFiltrado.recien_horneados.subcategorias
     }
   };
   
   // 6. Corregir codificación UTF-8
   console.log('🔧 Corrigiendo codificación UTF-8...\n');
   const menuCorregido = fixObjectEncoding(menuFiltrado);
   
   // 7. Guardar archivo
   console.log(`💾 Guardando: ${CONFIG.archivoSalida}`);
   
   try {
     fs.writeFileSync(
       CONFIG.archivoSalida,
       JSON.stringify(menuCorregido, null, 2),
       'utf8'
     );
   } catch (error) {
     console.error(`❌ Error al guardar: ${error.message}`);
     process.exit(1);
   }
   
   // 8. Mostrar resumen
   console.log('\n✅ ¡Generación completada!\n');
   console.log('═══════════════════════════════════════════════════════════');
   console.log('                         RESUMEN                            ');
   console.log('═══════════════════════════════════════════════════════════\n');
   
   console.log(`☕ BEBIDAS CALIENTES: ${menuCorregido.bebidas_calientes.productos.length} productos`);
   for (const [subcat, prods] of Object.entries(menuCorregido.bebidas_calientes.por_subcategoria)) {
     console.log(`   📁 ${subcat} (${prods.length})`);
     for (const p of prods) {
       const precio = p.tamaño_default?.precio ?? 'N/A';
       console.log(`      • ${p.nombre} - $${precio}`);
     }
   }
   
   console.log(`\n🥐 RECIÉN HORNEADOS: ${menuCorregido.recien_horneados.productos.length} productos`);
   for (const [subcat, prods] of Object.entries(menuCorregido.recien_horneados.por_subcategoria)) {
     console.log(`   📁 ${subcat} (${prods.length})`);
     for (const p of prods) {
       const precio = p.tamaño_default?.precio ?? 'N/A';
       console.log(`      • ${p.nombre} - $${precio}`);
     }
   }
   
   console.log('\n═══════════════════════════════════════════════════════════');
   console.log(`📄 Archivo generado: ${CONFIG.archivoSalida}`);
   console.log('═══════════════════════════════════════════════════════════\n');
   
   return menuCorregido;
 }
 
 // ============================================
 // EJECUTAR
 // ============================================
 
 generarMenuFiltrado();
 
 export { generarMenuFiltrado, getCategoriaPath, transformarProducto, CONFIG };