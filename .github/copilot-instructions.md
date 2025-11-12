# geAI-SB: AI Coding Assistant Guidelines

## Project Overview
**geAI-SB** is an AI-powered Starbucks ordering assistant that uses NVIDIA LLM APIs for conversational intelligence and voice capabilities. It implements a multi-turn conversation flow for order collection with client-side state management and menu-driven UI.

### Core Stack
- **Backend**: Node.js/Express, ES modules
- **AI Models**: NVIDIA Llama 3.3 (LLM), OpenAI Whisper (speech-to-text), voice synthesis
- **Frontend**: Vanilla JS with WebM audio recording, CSS animations
- **Data**: JSON-based menu structure with indexed lookups

---

## Architecture: Conversation State Machine

The system follows a **strict order-building workflow** (`demo/server.js:getCurrentStep()`):

```
bienvenida → esperando_confirmacion → sucursal → bebida → tamano (if needed)
  → modifier_* (one per required modifier group) → alimento → revision 
  → confirmacion → metodoPago → finalizar
```

**Key Files**:
- `demo/server.js`: Main state machine (1779 lines) - all conversation logic
- `demo/promptGenerator.js`: LLM system prompts with time-based recommendations
- `demo/orderValidation.js`: Step-by-step order validation rules
- `demo/menuUtils.js`: Menu indexing and product lookup (O(1) by ID)
- `demo/priceCalculator.js`: Price calculation with modifier handling
- `demo/sizeDetection.js`: Size alias mapping ("pequeño" → "1", "venti" → "4")
- `demo/recommendationEngine.js`: Time-of-day recommendations

**Why this matters**: Each step updates `session.currentOrder` immutably. The LLM never directly modifies state—the backend determines the next step. Always call `getCurrentStep()` to decide what prompt to generate.

---

## Critical Data Flows

### 1. Menu Loading & Lookup Pattern
Menu is indexed at startup in `demo/server.js:loadMenu()`:
```javascript
// Menu has pre-built indices for O(1) lookup
menu.indice_por_id[productId]  // Fast by ID
menu.indice_por_nombre[normalizedName]  // Fast by name
menu.bebidas_calientes, menu.bebidas_frias, etc.  // Categories
```

**Pattern**: Always use `menuUtils.findProductByName(MENU, userInput)` or `findProductById()` — never iterate categories manually.

### 2. Modifier Selection Flow
Modifiers (milk type, size, extras) are **required** or **optional**:
```javascript
// In server.js:updateOrderFromInput() case "modifier_*"
const requiredMods = menuUtils.getRequiredModifiers(producto);
// Loop through mods until all required ones are satisfied
// Use findBestMatchingOption() for fuzzy matching against mod.opciones
```

**Key insight**: Modifiers are stored as `{grupoId, opcionId}` pairs. Multiple modifiers of same group can exist.

### 3. Price Calculation
`demo/priceCalculator.js:calculateOrderPrice()` returns:
```javascript
{ 
  valido, 
  precio_base,         // Beverage size price
  precio_modificadores,// Sum of modifier extras
  precio_alimento,     // Food price
  total, 
  detalles            // itemized breakdown
}
```

Prices are **size-dependent**: `modifier.opciones[i].precios_por_tamano["3"]`

---

## Project-Specific Conventions

### 1. Text Normalization (Everywhere)
**Every** user input comparison uses:
```javascript
const normalizado = userInput.toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")  // Remove accents
  .replace(/[^\w\s]/g, "");          // Remove special chars
```

Reason: Spanish accents and encoding issues from voice transcription. Do NOT skip this.

### 2. Fuzzy Matching Hierarchy
`server.js:findBestMatchingOption()` uses 4-level fallback:
1. Direct substring match
2. Normalized substring match  
3. Keyword variations ("almendra" ← "almond", "entera" ← "whole")
4. Partial word overlap (4+ char words)

**Apply this pattern** for any user input → predefined option lookup.

### 2. Session State Structure
```javascript
session = {
  currentOrder: {
    sucursal, bebida, bebida_id, tamano, alimento, alimento_id,
    modificadores: [{grupoId, opcionId}, ...],
    metodoPago,
    solicitoRecomendacion,    // Flag for recommendation requests
    preferenciaRecomendacion, // "frio", "caliente", "dulce", "cafe", "te"
    revisado, confirmado      // Workflow flags
  },
  orderHistory: [...]
}
```

Session is ephemeral (in-memory Map). No persistence layer.

### 4. API Response Pattern
All endpoints return:
```javascript
{
  proximoPaso,      // Next state from getCurrentStep()
  sugerencias,      // ['option1', 'option2'] for UI chips
  prompt,           // LLM-generated greeting/question (cleaned for TTS)
  orden: { ... },   // Current order state
  status: "ok" | "error"
}
```

### 5. Logging Convention
Every function logs with emoji prefixes:
- `✅` = Success
- `❌` = Error
- `⚠️` = Warning
- `💡` = Info
- `🔍` = Search
- `🔧` = Modifier processing

Reason: Console logs are user-visible in dev tools for debugging.

---

## Integration Points

### NVIDIA API Integration
Located in `demo/server.js` (lines 995, 1000+):
```javascript
const response = await axios.post(
  "https://integrate.api.nvidia.com/v1/chat/completions",
  {
    model: "meta/llama-3.3-70b-instruct",
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userInput }
    ],
    temperature: 0.4  // Lower = more deterministic
  },
  { headers: { Authorization: `Bearer ${NVIDIA_API_KEY}` } }
);
```

Temperature is **deliberately low** (0.4) for order-taking reliability.

### OpenAI Whisper Integration
`assistant-voice.js` lines 74-100:
- **Input**: WebM audio blob from browser
- **Output**: Transcribed Spanish text
- **Error handling**: Fallback to browser Web Speech API if Whisper fails

### Voice Synthesis
TTS endpoint (`/tts`) uses OpenAI's voice API OR browser's `SpeechSynthesisUtterance`.

---

## Common Implementation Tasks

### Adding a New Menu Item
1. Add to `demo/menu_simplificado_CORRECTO.json` with proper structure
2. Include `tamaños[]` with `precios_por_tamano` per size ID
3. Reload menu via `demo/server.js:loadMenu()` or restart server

### Extending Conversation Flow
1. Add step to `getCurrentStep()` switch statement
2. Add case handler in `updateOrderFromInput()`
3. Add suggestion generation in `getSuggestions()`
4. Test via `/chat` endpoint with explicit `order` param

### Modifying Recommendation Logic
Edit `demo/recommendationEngine.js:getRecommendations()`:
- Maps moment ("mañana", "tarde", "noche") to product arrays
- Updates product priorities based on `orden.preferenciaRecomendacion`

### Fuzzy Matching Issues
When users say something that doesn't match:
1. Check `findBestMatchingOption()` keyword dictionary
2. Add new variation to `palabrasClave` object
3. Test normalization pipeline (accents, special chars)

---

## Development Workflow

### Start Server
```bash
npm start  # Runs demo/server.js
# Requires NVIDIA_API_KEY and OPENAI_API_KEY in .env
```

### Test Locally
1. Open `demo/index.html` in browser
2. Use chat interface or voice recording
3. Check browser console for detailed logs
4. POST to `/chat` directly for API testing

### Environment Variables
```
NVIDIA_API_KEY=xxx      # Required for LLM
OPENAI_API_KEY=xxx      # Required for Whisper + TTS
```

---

## Debugging Patterns

### Order State Mismatch
Enable logging in `updateOrderFromInput()` — prints full state after each update:
```javascript
console.log(`   📦 Estado final:`, JSON.stringify(order));
```

### LLM Not Recognizing User Input
1. Check `userInput` normalization in the specific case handler
2. Add to keyword dictionary if it's a domain term
3. Check if input matches product names in menu

### Menu Not Loading
Run `/status` endpoint — logs which products indexed successfully.

### Speech Issues
Check Whisper response in `/transcribe` — if empty, audio quality may be poor.

---

## File Reference Map

| File | Purpose | Key Functions |
|------|---------|---|
| `demo/server.js` | Main server + conversation logic | `getCurrentStep()`, `updateOrderFromInput()` |
| `demo/promptGenerator.js` | LLM prompts | `generateSystemPrompt()`, `getTimeContext()` |
| `demo/orderValidation.js` | Validate orders | `validateCompleteOrder()`, `suggestNextStep()` |
| `demo/menuUtils.js` | Menu lookups | `findProductByName()`, `getRequiredModifiers()` |
| `demo/priceCalculator.js` | Price math | `calculateOrderPrice()` |
| `demo/sizeDetection.js` | Size parsing | `detectSizeFromInput()`, size aliases |
| `demo/recommendationEngine.js` | Recommendations | `getRecommendations()` by time/preference |
| `demo/index.html` | Frontend UI + voice capture | Audio recording, chat UI |
| `demo/menu_simplificado_CORRECTO.json` | Menu definition | Product structure with prices |

---

## Gotchas & Lessons Learned

1. **State is ephemeral**: Restarting server loses all sessions. No DB backing.
2. **Temperature matters**: Keep LLM temperature low for order reliability.
3. **Modifiers are cumulative**: A user can pick multiple modifiers per group — don't assume one per group.
4. **Size ID mapping is inconsistent**: "1"=short, "2"=tall, "3"=grande, "4"=venti (not intuitive).
5. **Price indexing by size**: Every modifier has `precios_por_tamano` — size must be known before final price.
6. **Recommendation preference is optional**: Only set if user explicitly states preference (cold/hot/sweet).

---

## When to Reference Code

- **Conversation flow confusion**: Read `getCurrentStep()` → `updateOrderFromInput()` sequence
- **Menu structure questions**: Check `menu_simplificado_CORRECTO.json` first 100 lines
- **Price logic**: `priceCalculator.js` + relevant price lookup patterns in `server.js`
- **LLM prompt engineering**: `promptGenerator.js` for system prompt templates
