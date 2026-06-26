# Fluxo de Dados — CAR Campo

Diagrama de como os dados fluem pelo app, desde a captura até o envio.

## Fluxo Geral

```
ENTRADA                  PROCESSAMENTO LOCAL              PERSISTÊNCIA            ENVIO
═══════════════════════════════════════════════════════════════════════════════════════

Perfil                   navigation.tsx                   
  ↓
HomeScreen               (lista de imoveis)          
  ↓                                ↓
CadastroScreen           (dados do imovel)      → AsyncStorage (store.ts)
  ↓
DemarcacaoScreen         geo.ts (captura/validação)
  │  ├─ GPS real          → usePerimeterTracker.ts
  │  └─ Simulação         → useSimulatedWalk.ts
  ↓                            ↓
DocumentosScreen         documents.ts (picker)    → File System (app sandbox)
  │  ├─ Anexar arquivo    
  │  └─ Foto geotag       
  ↓
RevisaoScreen            geo.ts (export.ts)      
  │  ├─ Validação
  │  ├─ Exportar GeoJSON
  │  └─ Gerar PDF          → api.ts (envio)     → CAR Geo API
  ↓
Status: "enviado"
```

---

## Por Módulo

### 1. Entrada: Perfil & Home (`src/screens/`)

```
PerfilScreen
  └─> chooseProfile('produtor' | 'analista')
         └─> navigation.tsx (perfil context atualizado)

HomeScreen
  └─> listImoveis()
         └─> store.ts (AsyncStorage)
              └─> [lista de Imovel[]]
```

**Estado**: `{ perfil, imoveisList }`

---

### 2. Cadastro (`CadastroScreen.tsx` + `store.ts`)

```
Usuário preenche:
  ├─ Nome do imóvel
  ├─ Município / UF
  ├─ Matrícula
  └─ Dados do produtor (CPF/CNPJ)
       ↓
  types.ts: NovoImovel
       ↓
  store.ts: saveImovel(novoImovel)
       ↓
  AsyncStorage (device)
       ↓
  Retorna: Imovel { id, geometry: {}, documentos: [], status: 'rascunho' }
```

**Tipo**: `Imovel` (tipos.ts)

---

### 3. Demarcação (GPS ou Simulação)

#### 3A. GPS Real

```
DemarcacaoScreen (modo: 'real')
  └─> usePerimeterTracker.ts
       ├─ watchPositionAsync() [expo-location]
       │  └─ { lat, lng, accuracy, timestamp }
       ├─ Calcula distância do último ponto
       ├─ Se > threshold (~5–10m) → registra vértice
       └─ points: LngLat[] (acumulando)
            ↓
         geo.ts: validatePerimeter(points)
            ├─ Calcula área (geodésica)
            ├─ Calcula perímetro (geodésica)
            ├─ Valida: anel fechado? ≥ 3 vértices?
            ├─ Valida: auto-interseção?
            └─ Retorna: { valid, area_ha, perimetro_m, errors? }
            ↓
         Renderiza no mapa (react-native-maps)
         Mostra stats em tempo real
```

**Fluxo manual**: usuário toca "Marcar canto" → forcePoint(lat, lng)

#### 3B. Simulação

```
DemarcacaoScreen (modo: 'simulacao')
  └─> useSimulatedWalk.ts
       ├─ Escolhe rota em src/sim/routes.ts
       ├─ Anima avatar 🚶 by Reanimated
       └─ A cada ~5–10 metros:
            └─> marca vértice automaticamente
            ↓
         points: LngLat[] (acumulando, mesmo pipeline)
            ↓
         geo.ts: validatePerimeter(points) [idêntico a GPS real]
            ↓
         Renderiza no mapa
         Mostra stats (sem GPS real)
```

**Diferença**: fonte de dados é rota hardcoded, não GPS.

---

### 4. Documentos (`DocumentosScreen.tsx` + `documents.ts`)

```
Usuário escolhe:
  ├─ "Selecionar arquivo"
  │  └─> expo-document-picker
  │       └─> File → file:///...
  ├─ "Tirar foto"
  │  └─> expo-image-picker
  │       └─> File + geotag
  └─ Para cada item:
       └─> documents.ts
            ├─ Salva em app sandbox (expo-file-system)
            ├─ Extrai EXIF (lat/lng se disponível)
            └─ Cria Documento { id, tipo, uri, mime, lat?, lng? }
                 ↓
            store.ts: appendDocumento(imovelId, documento)
                 ↓
            AsyncStorage (atualiza imovel.documentos[])
```

**Tipo**: `Documento` (tipos.ts)

---

### 5. Revisão (`RevisaoScreen.tsx` + `export.ts`)

```
Mostra resumo:
  ├─ Dados do imóvel ✓
  ├─ Geometria (área, perímetro, vértices) ✓
  ├─ Documentos ✓
  └─ Validação:
      └─ geo.ts: validatePerimeter(points)
           ├─ selfIntersects? (auto-interseção)
           ├─ areaMinima? (módulos fiscais)
           └─ showErrors()

Exportar:
  ├─ GeoJSON
  │  └─ geo.ts: toGeoJSON(points, imovel.nome)
  │       └─ RFC 7946 format
  │            ↓
  │       export.ts: salva ou compartilha
  │
  ├─ PDF
  │  └─ export.ts: generatePDF(imovel)
  │       └─ expo-print → Print preview
  │
  └─ Compartilhar
     └─ expo-sharing: share(geoJSON | PDF)
          └─ Whatsapp, email, etc.

Enviar à API:
  └─> "Enviar imóvel"
       └─> api.ts: sendImovel(imovel)
            ├─ POST /geometrias
            ├─ Payload: { geometry: GeoJSON, produtor, imovel, documentos }
            ├─ Retry se falhar (sem rede)
            └─ store.ts: updateImovel({ ...imovel, status: 'enviado' })
                 ↓
            AsyncStorage (atualizado)
```

---

## Persistência: AsyncStorage

Toda a estrutura é salva continuamente:

```typescript
interface Imovel {
  id: string;
  perfil: 'produtor' | 'analista';
  produtor: { nome: string; cpfCnpj: string };
  imovel: { nome, municipio, uf, matricula?, modulosFiscais? };
  geometry: { points: LngLat[], area_ha, perimetro_m };
  documentos: Documento[];
  status: 'rascunho' | 'enviado';
  createdAt: number;
  updatedAt: number;
}
```

**Key em AsyncStorage**: `imovels` (array) ou `imovel:${id}` (individual).

---

## Envio à API: Offline-first

```
Usuário toca "Enviar"
  ├─ Tem internet?
  │  ├─ SIM → api.ts: POST /geometrias
  │  │        ├─ Sucesso? → store.ts: status = 'enviado'
  │  │        └─ Falha? → fica em 'rascunho', retry later
  │  │
  │  └─ NÃO → AsyncStorage guarda em fila
  │           └─ Quando volta internet → auto-retry
  │
  └─ UI nunca bloqueia (toast/alert não-blocking)
```

**Fila de sincronização** (implementar em futura versão):
- Manter `pending[]` em AsyncStorage
- A cada 30s (ou ao reconectar) tentar enviar

---

## Fluxo de Geometria em Detalhe

```
GPS/Simulação fornece pontos
  ↓
geo.ts: points LngLat[]
  ├─ calculateArea() → Haversine/Vincenty
  │  └─ metros² → hectares
  ├─ calculatePerimeter() → Haversine
  │  └─ metros
  ├─ validatePerimeter()
  │  ├─ isClosedRing(points) → first == last?
  │  ├─ hasMinVertices(points, 3)
  │  ├─ selfIntersects(points) → O(n²)
  │  └─ throwIfInvalid() ou return { valid: false, errors: [] }
  ├─ simplifyRDP(points, epsilon=0.0001) → reduz ruído
  └─ toGeoJSON(points, name)
     └─ RFC 7946: FeatureCollection
```

**Tipos**:
```typescript
type LngLat = { lng: number; lat: number };
type Geometry = { points: LngLat[], area_ha: number, perimetro_m: number };
```

---

## Diagrama Simplificado

```
┌─────────────────────────────────────────────────────────┐
│                   CAR CAMPO APP                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  PerfilScreen → CadastroScreen                         │
│       ↓             ↓                                   │
│  HomeScreen  (store.ts, AsyncStorage)                  │
│       ↓                                                 │
│  DemarcacaoScreen                                      │
│       ├─ GPS Real (usePerimeterTracker.ts)             │
│       └─ Simulação (useSimulatedWalk.ts)               │
│       ↓                                                 │
│  geo.ts (validação, cálculos geodésicos)               │
│       ↓                                                 │
│  DocumentosScreen (documents.ts, File System)          │
│       ↓                                                 │
│  RevisaoScreen                                         │
│       ├─ Validação                                     │
│       ├─ Exportar (GeoJSON, PDF)                       │
│       └─ Enviar (api.ts)                               │
│                ↓                                       │
│           CAR GEO API                                  │
│           (POST /geometrias)                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Checkpoints de Validação

| Ponto | O quê | Quem |
|-------|-------|------|
| Cadastro | CPF/CNPJ válido? | CadastroScreen / types.ts |
| Demarcação | ≥ 3 vértices, anel fechado | geo.ts: `validatePerimeter()` |
| Demarcação | Sem auto-interseção? | geo.ts: `selfIntersects()` |
| Documentos | Foto com geotag? | documents.ts |
| Revisão | Área dentro do módulo? | RevisaoScreen (opcional) |
| Envio | Tem internet? | api.ts (retry offline) |

---

## Notas para Devs

1. **Sempre chamar `saveImovel()` após cada etapa** para não perder dados
2. **Cleanup de GPS**: `usePerimeterTracker` remove subscription automaticamente
3. **Documentos sensíveis**: arquivo fica no sandbox; dados de produtor (PII) em AsyncStorage
4. **Falha de envio**: não deletar o imóvel, só marcar status como pendente
5. **Simplificação**: usar `simplifyRDP()` antes de enviar para reduzir payload

---

Para mais, veja [DEVELOPMENT.md](./DEVELOPMENT.md) e [geo.ts](../src/lib/geo.ts).
