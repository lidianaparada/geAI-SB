// =========================
// MÁQUINA DE ESTADOS DEL PEDIDO
// =========================

const ORDEN_STEPS = {
    INICIO: 'inicio',
    CATEGORIA: 'categoria',           // Caliente o Frío
    TIPO_BEBIDA: 'tipo_bebida',       // Latte, Americano, Frappuccino, etc.
    TAMANO: 'tamano',                 // Tall, Grande, Venti
    LECHE: 'leche',                   // Entera, Almendra, Avena, etc.
    SHOTS_EXTRA: 'shots_extra',       // ¿Shots extra? (opcional)
    ENDULZANTE: 'endulzante',         // Azúcar, Light, Sin azúcar
    JARABES: 'jarabes',               // Vainilla, Caramelo, etc. (opcional)
    TOPPINGS: 'toppings',             // Crema, Drizzle (opcional)
    ALIMENTO: 'alimento',             // ¿Algo para acompañar? (opcional)
    CONFIRMAR: 'confirmar',           // Resumen del pedido
    FINALIZAR: 'finalizar'            // Total y pago
  };
  
  // =========================
  // FUNCIÓN: Obtener paso actual del pedido
  // =========================
  function getCurrentStep(order) {
    if (!order.bebida) return ORDEN_STEPS.TIPO_BEBIDA;
    if (!order.tamano) return ORDEN_STEPS.TAMANO;
    if (!order.leche && requiresLeche(order.bebida)) return ORDEN_STEPS.LECHE;
    if (order.shots_extra === undefined) return ORDEN_STEPS.SHOTS_EXTRA;
    if (!order.endulzante) return ORDEN_STEPS.ENDULZANTE;
    if (order.jarabes === undefined) return ORDEN_STEPS.JARABES;
    if (order.toppings === undefined) return ORDEN_STEPS.TOPPINGS;
    if (order.alimento === undefined) return ORDEN_STEPS.ALIMENTO;
    if (!order.confirmado) return ORDEN_STEPS.CONFIRMAR;
    return ORDEN_STEPS.FINALIZAR;
  }
  
  // =========================
  // FUNCIÓN: Verificar si bebida requiere leche
  // =========================
  function requiresLeche(bebida) {
    if (!bebida) return false;
    const lower = bebida.toLowerCase();
    return lower.includes("latte") || 
           lower.includes("cappuccino") || 
           lower.includes("macchiato") ||
           lower.includes("mocha") ||
           lower.includes("chai");
  }
  
  // =========================
  // FUNCIÓN: Calcular precio del pedido
  // =========================
  function calculateOrderPrice(order, menu) {
    let total = 0;
    
    // Precio base de la bebida
    if (order.bebida) {
      const bebida = [...menu.bebidas_calientes, ...menu.bebidas_frias, ...menu.te]
        .find(b => b.nombre.toLowerCase() === order.bebida.toLowerCase());
      
      if (bebida) {
        total += bebida.precio_base;
        
        // Ajuste por tamaño
        if (order.tamano === "Grande") total += 10;
        if (order.tamano === "Venti") total += 15;
        
        // Shots extra ($10 c/u)
        if (order.shots_extra > 0) total += order.shots_extra * 10;
        
        // Jarabes ($8 c/u)
        if (order.jarabes && order.jarabes.length > 0) {
          total += order.jarabes.length * 8;
        }
      }
    }
    
    // Alimento
    if (order.alimento && order.alimento !== "ninguno") {
      const alimento = [...menu.alimentos_salados, ...menu.postres]
        .find(a => a.nombre.toLowerCase() === order.alimento.toLowerCase());
      if (alimento) {
        total += alimento.precio;
      }
    }
    
    return total;
  }
  
  // =========================
  // FUNCIÓN: Generar prompt dinámico por paso
  // =========================
  function generateSystemPrompt(menu, sessionId = null) {
    const timeContext = getTimeContext();
    const session = sessionId ? sessionContext.get(sessionId) : null;
    const order = session?.currentOrder || {};
    
    // Determinar paso actual
    const currentStep = getCurrentStep(order);
    
    // Contexto temporal
    const contextMsg = menu.metadata.contextos[timeContext.momento].mensaje;
    
    // Construir estado del pedido
    let orderSummary = "";
    if (order.bebida) {
      orderSummary = `
   PEDIDO EN PROGRESO:
  ✓ Bebida: ${order.bebida}
  ${order.tamano ? `✓ Tamaño: ${order.tamano}` : '⏳ Tamaño: pendiente'}
  ${order.leche ? `✓ Leche: ${order.leche}` : requiresLeche(order.bebida) ? '⏳ Leche: pendiente' : ''}
  ${order.shots_extra > 0 ? `✓ Shots extra: ${order.shots_extra}` : ''}
  ${order.jarabes?.length > 0 ? `✓ Jarabes: ${order.jarabes.join(", ")}` : ''}
  ${order.alimento ? `✓ Alimento: ${order.alimento}` : ''}
  `;
    }
    
    // Instrucciones específicas por paso
    let stepInstructions = "";
    
    switch(currentStep) {
      case ORDEN_STEPS.TIPO_BEBIDA:
        stepInstructions = `
  🎯 PASO ACTUAL: SELECCIONAR BEBIDA
  
  TU TAREA: Ayudar a elegir una bebida del menú.
  
  BEBIDAS DISPONIBLES:
  ❄️ Calientes: ${menu.bebidas_calientes.map(b => b.nombre).join(", ")}
  ❄️ Frías: ${menu.bebidas_frias.slice(0, 8).map(b => b.nombre).join(", ")}
  ❄️ Té: ${menu.te.map(t => t.nombre).join(", ")}
  
  PREGUNTAS QUE DEBES HACER:
  1. Si no especifican: "¿Algo caliente o frío?"
  2. Si dicen "café": "¿Americano simple o Latte cremoso?"
  3. Si dicen "frío": "¿Frappuccino, café helado o refresher?"
  4. Si dicen "té": "Tenemos Chai Tea Latte. ¿Te gusta?"
  
  RESPUESTA ESPERADA: Nombre exacto de la bebida`;
        break;
        
      case ORDEN_STEPS.TAMANO:
        stepInstructions = `
        ❄️ PASO ACTUAL: SELECCIONAR TAMAÑO
  
  BEBIDA ELEGIDA: ${order.bebida}
  Precio base: $${getBebidaPrecio(order.bebida, menu)}
  
  PREGUNTA: "¿Qué tamaño? Tall, Grande o Venti"
  
  TAMAÑOS Y PRECIOS:
  - Tall (12 oz): Precio base
  - Grande (16 oz): +$10
  - Venti (20 oz): +$15
  
  RESPUESTA ESPERADA: "Tall", "Grande" o "Venti"`;
        break;
        
      case ORDEN_STEPS.LECHE:
        stepInstructions = `
  🎯 PASO ACTUAL: SELECCIONAR LECHE
  
  BEBIDA: ${order.bebida} ${order.tamano}
  
  PREGUNTA: "¿Con qué leche? Tenemos ${menu.extras.leches.join(", ")}"
  
  OPCIONES DISPONIBLES:
  ${menu.extras.leches.map(l => `- ${l}`).join("\n")}
  
  RESPUESTA ESPERADA: Una de las leches del menú`;
        break;
        
      case ORDEN_STEPS.SHOTS_EXTRA:
        stepInstructions = `
  🎯 PASO ACTUAL: SHOTS EXTRA (OPCIONAL)
  
  PEDIDO: ${order.bebida} ${order.tamano} con ${order.leche}
  
  PREGUNTA: "¿Le agregamos shots extra de espresso? Son $10 cada uno"
  
  OPCIONES:
  - No gracias / Sin shots
  - 1 shot extra
  - 2 shots extra
  
  SI DICEN "NO" o "SIN": Registrar 0 y continuar
  RESPUESTA ESPERADA: Número (0, 1, 2) o "no"`;
        break;
        
      case ORDEN_STEPS.ENDULZANTE:
        stepInstructions = `
  🎯 PASO ACTUAL: ENDULZANTE
  
  PREGUNTA: "¿Azúcar normal, light o sin azúcar?"
  
  OPCIONES:
  ${menu.extras.endulzantes.map(e => `- ${e}`).join("\n")}
  
  RESPUESTA ESPERADA: "Normal", "Light" o "Sin azúcar"`;
        break;
        
      case ORDEN_STEPS.JARABES:
        stepInstructions = `
  🎯 PASO ACTUAL: JARABES (OPCIONAL)
  
  PREGUNTA: "¿Le agregamos jarabe? Tenemos ${menu.extras.jarabes.slice(0, 5).join(", ")}"
  
  OPCIONES POPULARES:
  ${menu.extras.jarabes.slice(0, 6).map(j => `- ${j} (+$8)`).join("\n")}
  
  SI DICEN "NO": Registrar [] y continuar
  PUEDE ELEGIR MÚLTIPLES: "Vainilla y caramelo"
  RESPUESTA ESPERADA: Lista de jarabes o "no"`;
        break;
        
      case ORDEN_STEPS.TOPPINGS:
        stepInstructions = `
  🎯 PASO ACTUAL: TOPPINGS (OPCIONAL)
  
  PREGUNTA: "¿Crema batida o drizzle de caramelo?"
  
  OPCIONES:
  ${menu.extras.toppings.map(t => `- ${t}`).join("\n")}
  
  SI DICEN "NO": Continuar sin toppings
  RESPUESTA ESPERADA: Topping elegido o "no"`;
        break;
        
      case ORDEN_STEPS.ALIMENTO:
        stepInstructions = `
  🎯 PASO ACTUAL: ALIMENTO (OPCIONAL)
  
  SUGERENCIA CONTEXTUAL:
  ${timeContext.momento === "manana" ? "¿Un croissant o bagel para acompañar?" :
    timeContext.momento === "tarde" ? "¿Algo para comer? Tenemos paninis" :
    "¿Un postre? Tenemos pasteles y galletas"}
  
  OPCIONES DESTACADAS:
  ${timeContext.momento === "manana" ? 
    menu.alimentos_salados.filter(a => a.nombre.includes("Croissant") || a.nombre.includes("Bagel")).slice(0,3).map(a => `- ${a.nombre} ($${a.precio})`).join("\n") :
    menu.alimentos_salados.slice(0,3).map(a => `- ${a.nombre} ($${a.precio})`).join("\n")}
  ${menu.postres.slice(0,3).map(p => `- ${p.nombre} ($${p.precio})`).join("\n")}
  
  SI DICEN "NO": Registrar "ninguno" y continuar
  RESPUESTA ESPERADA: Nombre del alimento o "no"`;
        break;
        
      case ORDEN_STEPS.CONFIRMAR:
        const total = calculateOrderPrice(order, menu);
        stepInstructions = `
  🎯 PASO ACTUAL: CONFIRMAR PEDIDO
  
  RESUMEN COMPLETO:
  🥤 ${order.bebida} ${order.tamano} con leche ${order.leche}
  ${order.shots_extra > 0 ? `   + ${order.shots_extra} shot(s) extra` : ''}
  ${order.endulzante ? `   Endulzante: ${order.endulzante}` : ''}
  ${order.jarabes?.length > 0 ? `   + Jarabe: ${order.jarabes.join(", ")}` : ''}
  ${order.toppings ? `   + ${order.toppings}` : ''}
  ${order.alimento && order.alimento !== "ninguno" ? `🍽️ ${order.alimento}` : ''}
  
  💰 TOTAL: $${total} MXN
  
  PREGUNTA: "Tu pedido es: [RESUMEN]. ¿Está correcto o cambias algo?"
  
  SI CONFIRMA: Pasar a finalizar
  SI QUIERE CAMBIAR: Preguntar qué modificar
  RESPUESTA ESPERADA: "Sí", "Correcto", "Cambiar X"`;
        break;
        
      case ORDEN_STEPS.FINALIZAR:
        const finalTotal = calculateOrderPrice(order, menu);
        stepInstructions = `
  🎯 PASO ACTUAL: FINALIZAR
  
  MENSAJE FINAL:
  "¡Listo! Tu pedido: ${order.bebida} ${order.tamano}${order.alimento && order.alimento !== "ninguno" ? ` y ${order.alimento}` : ''}. Total: $${finalTotal} pesos. Pasa a caja"
  
  PEDIDO COMPLETADO `;
        break;
    }
    
    return `Eres Caffi, asistente de Starbucks México. Hablas español natural y conciso.
  
  ${orderSummary}
  
  ${stepInstructions}
  
  ⚙️ REGLAS GENERALES:
   MÁXIMO 20 palabras por respuesta
   Una pregunta a la vez
   Ser amigable pero eficiente
   Usar palabras simples para TTS (di "gran-de" no "grande")
   Si usuario pide algo no disponible, ofrecer alternativa similar
   NUNCA inventar productos - solo usar los del menú
   Si usuario está confundido, explicar brevemente y repetir pregunta
  
  🕐 CONTEXTO TEMPORAL: ${timeContext.momento}
  ${contextMsg}
  
  💡 SUGERENCIAS DEL MOMENTO:
  ${menu.metadata.contextos[timeContext.momento].sugerencias.slice(0, 3).join(", ")}
  
  FORMATO DE RESPUESTA:
  - Pregunta clara y directa
  - Máximo 2 opciones a la vez
  - Sin explicaciones largas
  
  EJEMPLOS POR PASO:
  ${currentStep === ORDEN_STEPS.TIPO_BEBIDA ? `
  Usuario: "Quiero café"
  Caffi: "¿Americano simple o Latte cremoso?"
  
  Usuario: "Algo frío"
  Caffi: "¿Frappuccino, café helado o refresher?"
  ` : ''}
  
  ${currentStep === ORDEN_STEPS.TAMANO ? `
  Usuario: "Grande"
  Caffi: "Perfecto. ¿Con qué leche?"
  ` : ''}
  
  ${currentStep === ORDEN_STEPS.ALIMENTO ? `
  Usuario: "No gracias"
  Caffi: "Perfecto. Tu pedido: [RESUMEN]. Total: $X pesos"
  ` : ''}`;
  }
  
  // =========================
  // FUNCIÓN: Obtener precio de bebida
  // =========================
  function getBebidaPrecio(nombreBebida, menu) {
    const bebida = [...menu.bebidas_calientes, ...menu.bebidas_frias, ...menu.te]
      .find(b => b.nombre.toLowerCase() === nombreBebida.toLowerCase());
    return bebida?.precio_base || 60;
  }
  
  // =========================
  // FUNCIÓN: Actualizar pedido según input
  // =========================
  function updateOrderFromInput(session, userInput, currentStep, menu) {
    const order = session.currentOrder;
    const lower = userInput.toLowerCase();
    
    switch(currentStep) {
      case ORDEN_STEPS.TIPO_BEBIDA:
        // Buscar bebida en el menú
        const bebida = [...menu.bebidas_calientes, ...menu.bebidas_frias, ...menu.te]
          .find(b => lower.includes(b.nombre.toLowerCase()) || 
                     b.nombre.toLowerCase().includes(lower));
        if (bebida) {
          order.bebida = bebida.nombre;
        }
        break;
        
      case ORDEN_STEPS.TAMANO:
        if (lower.includes("tall")) order.tamano = "Tall";
        else if (lower.includes("grande")) order.tamano = "Grande";
        else if (lower.includes("venti")) order.tamano = "Venti";
        else if (lower.includes("chico") || lower.includes("pequeño")) order.tamano = "Tall";
        else if (lower.includes("mediano")) order.tamano = "Grande";
        break;
        
      case ORDEN_STEPS.LECHE:
        const leche = menu.extras.leches.find(l => 
          lower.includes(l.toLowerCase()));
        if (leche) order.leche = leche;
        break;
        
      case ORDEN_STEPS.SHOTS_EXTRA:
        if (lower.includes("no") || lower.includes("sin")) {
          order.shots_extra = 0;
        } else if (lower.includes("1") || lower.includes("uno")) {
          order.shots_extra = 1;
        } else if (lower.includes("2") || lower.includes("dos")) {
          order.shots_extra = 2;
        } else {
          order.shots_extra = 0;
        }
        break;
        
      case ORDEN_STEPS.ENDULZANTE:
        const endulzante = menu.extras.endulzantes.find(e => 
          lower.includes(e.toLowerCase()));
        if (endulzante) order.endulzante = endulzante;
        else order.endulzante = "Normal";
        break;
        
      case ORDEN_STEPS.JARABES:
        if (lower.includes("no") || lower.includes("sin") || lower.includes("ninguno")) {
          order.jarabes = [];
        } else {
          order.jarabes = menu.extras.jarabes.filter(j => 
            lower.includes(j.toLowerCase()));
        }
        break;
        
      case ORDEN_STEPS.TOPPINGS:
        if (lower.includes("no") || lower.includes("sin")) {
          order.toppings = null;
        } else {
          const topping = menu.extras.toppings.find(t => 
            lower.includes(t.toLowerCase()));
          if (topping) order.toppings = topping;
        }
        break;
        
      case ORDEN_STEPS.ALIMENTO:
        if (lower.includes("no") || lower.includes("sin") || lower.includes("nada")) {
          order.alimento = "ninguno";
        } else {
          const alimento = [...menu.alimentos_salados, ...menu.postres]
            .find(a => lower.includes(a.nombre.toLowerCase()) ||
                       a.nombre.toLowerCase().includes(lower));
          if (alimento) order.alimento = alimento.nombre;
          else order.alimento = "ninguno";
        }
        break;
        
      case ORDEN_STEPS.CONFIRMAR:
        if (lower.includes("sí") || lower.includes("si") || 
            lower.includes("correcto") || lower.includes("ok")) {
          order.confirmado = true;
        }
        break;
    }
  }
  
  // =========================
  // EXPORTAR
  // =========================
  export {
    ORDEN_STEPS,
    getCurrentStep,
    generateSystemPrompt,
    calculateOrderPrice,
    updateOrderFromInput,
    requiresLeche
  };