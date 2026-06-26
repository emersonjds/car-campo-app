# Guia de Desenvolvimento — CAR Campo

Instruções técnicas para configurar o ambiente e entender a arquitetura do app.

## Pré-requisitos

- **Node.js** ≥ 18 (ou similar)
- **Bun** ou **Yarn** (gerenciador de pacotes)
- **Expo CLI** (`npm install -g expo-cli` ou via `npx`)
- **Xcode** (macOS) ou **Android Studio** (Windows/Linux/Mac)

## Setup

### 1. Clonar e instalar dependências

```bash
git clone <repo>
cd car-campo-app

# Com bun
bun install

# Ou com yarn
yarn install
```

### 2. Expo Development Build

Este app **requer** um development build (não roda 100% no Expo Go). As razões:

- `react-native-maps` — renderização de mapas não é suportada no Go
- `expo-location` — acesso a GPS tem limitações
- `expo-image-picker` — acesso à câmera/galeria depende de configuração nativa

#### Criar o development build local

```bash
# iOS (macOS)
eas build --platform ios --local

# Android
eas build --platform android --local

# Ambas
eas build --local
```

Se o `eas` estiver lento, você pode usar `expo prebuild + run`:

```bash
# iOS
npx expo prebuild --clean
npx expo run:ios

# Android
npx expo prebuild --clean
npx expo run:android
```

#### Instalar em device/emulador

Depois de buildar, o app será instalado automaticamente. Se não:

```bash
# iOS
open ios/CarCampoApp.xcworkspace/
# Depois, no Xcode: Product → Run ou Cmd+R

# Android
npx expo run:android
```

### 3. Iniciar o dev server

```bash
bun start
# ou: yarn start
```

Escolha a plataforma:
- Pressione `i` para iOS
- Pressione `a` para Android
- Pressione `w` para web (não suportado neste app)

## Variáveis de Ambiente

### `EXPO_PUBLIC_API_BASE_URL`

URL da CAR Geo API. Por padrão é `http://localhost:3000` (vide `app.json`).

Para mudar:

```bash
export EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:3000
bun start
```

Ou edite `app.json`:
```json
"extra": {
  "apiBaseUrl": "http://192.168.0.10:3000"
}
```

## Simular GPS

### Android Emulator

1. Abra **Extended Controls** (⋯ no canto do emulador).
2. Vá para **Location**.
3. Defina um ponto ou rota (em **Routes** você cria uma sequência de pontos).
4. Dê play (▶️).

O emulador enviará posições em tempo real ao app.

### iOS Simulator

1. No Xcode/Simulator, vá para **Features → Location**.
2. Escolha:
   - **None** — desativa GPS
   - **Custom Location** — define lat/lng manualmente
   - **City Run** / **City Bicycle** — rotas pré-definidas
3. O app receberá atualizações de localização.

### Usar o modo Simular caminhada

Não precisa de GPS real. Use o modo **Simular caminhada** dentro do app:
- Escolha uma rota demo (em `src/sim/routes.ts`).
- O avatar 🚶 caminha e marca vértices.
- Perfeito para teste offline.

## Estrutura do Projeto

```
src/
├── app/                          # Navegação e roteamento
│   ├── navigation.tsx            # Context de estado (perfil, tela, etc.)
│   ├── Router.tsx                # Roteador baseado em estado
│   ├── Screen.tsx                # Componente-base (header + layout)
│   └── WizardSteps.tsx           # Controle do wizard
│
├── screens/                      # Telas do app
│   ├── PerfilScreen.tsx          # Escolha de perfil (1ª abertura)
│   ├── HomeScreen.tsx            # Lista de imóveis
│   ├── CadastroScreen.tsx        # Dados do imóvel e produtor
│   ├── DemarcacaoScreen.tsx      # Mapa + captura GPS + simulação
│   ├── DocumentosScreen.tsx      # Anexar arquivos + foto
│   └── RevisaoScreen.tsx         # Validação e envio
│
├── hooks/
│   └── usePerimeterTracker.ts    # Captura de GPS, gestão de vértices
│
├── lib/                          # Lógica de negócio
│   ├── store.ts                  # AsyncStorage (persistência)
│   ├── geo.ts                    # Geodesia, GeoJSON, validação
│   ├── api.ts                    # Envio à CAR Geo API
│   ├── config.ts                 # Configuração (URL, limiares)
│   ├── documents.ts              # Image/document picker, geotag
│   └── export.ts                 # GeoJSON, PDF, compartilhar
│
├── sim/                          # Simulação de caminhada
│   ├── routes.ts                 # Rotas de demo
│   └── useSimulatedWalk.ts       # Hook do avatar animado
│
├── ui/                           # Componentes compartilhados
│   └── index.tsx                 # Botões, cards, inputs, etc.
│
├── theme/
│   └── colors.ts                 # Paleta de cores
│
├── types.ts                      # Modelos de domínio (TypeScript)
│
└── App.tsx                       # Ponto de entrada
```

## Conceitos Principais

### Offline-first (`src/lib/store.ts`)

O app usa **AsyncStorage** para armazenar imóveis localmente:

```typescript
// Criar imóvel
await saveImovel(novoImovel);

// Listar
const imoveis = await listImoveis();

// Recuperar um
const imovel = await getImovel(id);

// Deletar
await deleteImovel(id);
```

Quando o usuário toca em "Enviar", o app tenta enviar à API. Se falhar (sem rede), o imóvel fica em rascunho e é re-tentado quando houver conexão.

### Geometria Geodésica (`src/lib/geo.ts`)

Fornece funções para:
- **Calcular área geodésica** (Haversine/Vincenty) — em hectares.
- **Calcular perímetro** — em metros.
- **Gerar GeoJSON** (RFC 7946) — formato padrão para geometrias.
- **Validação**: anel fechado, mínimo 3 vértices, sem auto-interseção.
- **Simplificação** (Douglas–Peucker): reduz ruído de GPS.

Exemplo:

```typescript
import { calculateArea, calculatePerimeter, toGeoJSON } from '@/lib/geo';

const points = [
  { lng: -55.123, lat: -15.456 },
  { lng: -55.124, lat: -15.457 },
  { lng: -55.125, lat: -15.456 },
];

const area = calculateArea(points); // hectares
const perimeter = calculatePerimeter(points); // metros
const geojson = toGeoJSON(points, 'Imovel 1');
```

### Captura de GPS (`src/hooks/usePerimeterTracker.ts`)

Hook que gerencia:
- **Permissão de localização**.
- **Atualizações de GPS** via `expo-location`.
- **Registro de vértices** por distância (~5–10 m).
- **Marcação manual** ("Marcar canto").
- **Limpeza**: remove subscription para não drenar bateria.

Uso:

```typescript
const { points, isTracking, start, stop, markCorner } = usePerimeterTracker();

// start() — começa a rastrear
// stop() — para
// markCorner() — marca um vértice manual
// points — array atual de pontos
```

### Envio à API (`src/lib/api.ts`)

Função para enviar imóvel:

```typescript
await sendImovel({
  id: imovel.id,
  geometry: imovel.geometry,
  // ... outros dados
});
```

Se falhar (sem rede, timeout, etc.), retorna erro mas **não perde os dados** — o imóvel fica em AsyncStorage para re-tentativa posterior.

### Modo Simular Caminhada (`src/sim/useSimulatedWalk.ts`)

Hook que anima um avatar por uma rota:

```typescript
const { position, isWalking, start } = useSimulatedWalk(routeIndex);

// position — { lat, lng } atual
// start() — começa a animação
// isWalking — boolean
```

A rota é definida em `src/sim/routes.ts`. Útil para demo e teste offline.

## Build para Produção

```bash
# Criar um production build
eas build --platform ios --auto-submit
eas build --platform android --auto-submit
```

Antes de buildar, verifique:
- ✅ `app.json` → `version` e `extra.apiBaseUrl` corretos
- ✅ Sem variáveis de debug em `src/lib/config.ts`
- ✅ HTTPS ativado para produção (se houver rede)

## Testes Locais

### Testar offline-first

1. Vá para airplane mode (avião) no celular.
2. Crie um imóvel no app.
3. Faça a demarcação (simulada está ok).
4. Toque em "Enviar" — deve falhar graciosamente.
5. Imóvel fica em rascunho.
6. Desligue airplane mode.
7. O app deve re-tentar envio automaticamente.

### Testar GPS com rota customizada

**Android**: Extended Controls → Location → defina pontos:

```
Ponto 1: -15.456, -55.123 (início)
Ponto 2: -15.457, -55.124
Ponto 3: -15.458, -55.125
Ponto 4: -15.457, -55.126
Ponto 5: -15.456, -55.123 (volta)
```

Dê play. O app receberá GPS em tempo real.

### Testar documentos

1. Vá para **Documentos**.
2. Toque em **Selecionar arquivo** ou **Tirar foto**.
3. Escolha uma imagem da galeria ou tire uma foto.
4. Confirme que aparece na lista.
5. Deslize para deletar, se quiser.

## Debugging

### React Native Debugger

```bash
npm install -g react-native-debugger
react-native-debugger
```

Depois, no emulador, pressione `Cmd+M` (Android) e escolha "Debug remote JS".

### Logs

```typescript
console.log('debug info');
console.warn('aviso');
console.error('erro');
```

Aparecem no Metro terminal e no debugger.

### Expo Inspect

```bash
npx expo-dev-client
```

Abre uma UI de debug no app (só em dev).

## Permissões

### iOS

Vide `app.json` → `expo.ios.infoPlist`:

```json
"NSLocationWhenInUseUsageDescription": "Usamos sua localização (GPS)...",
"NSCameraUsageDescription": "Usamos a câmera para fotografar...",
"NSPhotoLibraryUsageDescription": "Permite anexar fotos..."
```

Aparecem automaticamente quando o usuário primeiro acessa a feature.

### Android

Vide `app.json` → `expo.android.permissions`:

```json
"ACCESS_FINE_LOCATION",
"ACCESS_COARSE_LOCATION",
"CAMERA"
```

Também solicitadas na primeira use.

## Resolvendo Problemas Comuns

### "Cannot connect to localhost:3000"

A API não está rodando. Inicie-a:

```bash
cd ../car-geo-api
npm start
```

Ou mude `app.json` → `extra.apiBaseUrl` para a URL correta.

### "Maps view should be mounted under Mapview..."

`react-native-maps` não está sendo renderizado dentro de um `MapView`. Verifique `DemarcacaoScreen.tsx`.

### "Permissão negada" para GPS

O usuário não concedeu acesso. Peça novamente ou resetar no celular:
- **Android**: Configurações → Aplicativos → CAR Campo → Permissões
- **iOS**: Configurações → Privacidade → Localização

### App congela ao anexar arquivo grande

Arquivos muito grandes (>50 MB) podem causar lag. Considere redimensionar imagens antes de anexar, ou usar compressão.

## Próximos Passos para Devs

- Revisar `src/lib/geo.ts` para otimizar cálculos de geodesia.
- Implementar simplificação de rota (Douglas–Peucker).
- Adicionar suporte a múltiplos idiomas (i18n).
- Integrar com analytics (sem rastrear coordenadas).
- Testes unitários para `geo.ts` e `store.ts`.

---

Dúvidas? Veja [CLAUDE.md](../CLAUDE.md) para contexto geral e `.claude/agents/` para especialistas de cada área.
