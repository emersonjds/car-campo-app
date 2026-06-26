# 📍 CAR Campo

App mobile para o **produtor rural desenhar o perímetro do imóvel caminhando com o celular** — sem equipamento caro. Calcula a área, gera **GeoJSON** e envia para a [CAR Geo API](../car-geo-api).

> **haCARthon** · Desafio 2 (*Melhorar o acesso a dados geoespaciais do CAR*) · **Solução 4** — App de desenho georreferenciado pelo celular.

## Por que existe

A captura oficial do CAR hoje depende de módulo desktop ou de técnico com GPS. Para o pequeno produtor, falta uma ferramenta simples: **abrir o app, caminhar a divisa do imóvel, e ter o polígono pronto**. É isso que o CAR Campo faz, com a tecnologia que o produtor já tem no bolso.

## Features

O app é um **fluxo offline-first de 4 passos** por imóvel:

1. **Seleção de perfil** — Produtor rural (guiado) ou Analista de campo (detalhado) na primeira abertura.
2. **Home "Meus imóveis"** — Lista de imóveis (rascunhos/enviados) com opções de criar, abrir ou deletar.
3. **Wizard de demarcação** (4 passos):
   - **Cadastro**: dados do imóvel (nome, município/UF, matrícula, módulos fiscais) e do produtor (CPF/CNPJ, protegido por LGPD).
   - **Demarcação**: mapa com dois modos de captura:
     - 🚶 **GPS real** — produtor caminha a divisa e o app marca vértices por distância + manual ("Marcar canto").
     - 🚶 **Simular caminhada** — modo demo offline: um avatar caminha por uma rota pré-definida, marcando vértices em tempo real. Ideal para treinar, demonstrar ou fazer apresentações sem GPS real.
   - **Documentos**: anexar matrícula, CCIR, RG, recibo CAR (foto/galeria/PDF) e tirar **foto georreferenciada** da divisa.
   - **Revisão**: resumo, validação geométrica (auto-interseção, anel fechado, área mínima), opções de **Exportar GeoJSON**, **Gerar PDF/croqui**, **Compartilhar**, e **Enviar** à CAR Geo API.

4. **Persistência offline** — tudo salvo no aparelho até que houver rede; fila de sincronização automática.

## Stack

**Expo SDK 56** · **React 19** · **React Native 0.85** · **TypeScript**

Libs principais:
- `expo-location` — GPS com tratamento de permissões
- `react-native-maps` — mapa + renderização de polígono
- `@react-native-async-storage/async-storage` — persistência offline
- `expo-image-picker`, `expo-document-picker`, `expo-file-system` — documentos e fotos
- `expo-print`, `expo-sharing` — exportação (PDF, compartilhar)
- `react-native-reanimated` — animações (avatar de simulação)
- `expo-constants` — configuração via `app.json`

Gerenciador: **bun** (ou yarn).

## Como rodar

> ⚠️ Precisa de **development build**: o `react-native-maps`, `expo-location` e as APIs de câmera/arquivo não rodam 100% no Expo Go.

### Setup

```bash
bun install
# ou: yarn install

bun start
# ou: yarn start
```

### Rodar no device/emulador

```bash
# iOS (com Xcode + dev build instalado)
npx expo run:ios

# Android (com Android Studio + dev build instalado)
npx expo run:android
```

Se o dev build já está instalado, você pode usar `expo-cli` diretamente:
```bash
bun ios     # ou: yarn ios
bun android # ou: yarn android
```

### Simular o GPS (sem ir a campo)

- **Android Emulator**: Extended Controls (•••) → Location → defina uma rota/pontos e dê play.
- **iOS Simulator**: Features → Location → Custom Location / City Run.

**Dica**: use o modo **Simular caminhada** no app para não depender de GPS. É perfeito para treinar ou apresentar.

### Configurar a CAR Geo API

Por padrão o app aponta para `http://localhost:3000` (a `car-geo-api` local).

Para mudar, edite `app.json`:
```json
"expo": {
  "extra": {
    "apiBaseUrl": "http://192.168.0.10:3000"  // IP da sua máquina na rede
  }
}
```

Ou defina a env var:
```bash
export EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:3000
bun start
```

## Arquitetura

```
App.tsx                           Ponto de entrada (NavigationProvider + Router)

src/app/
  navigation.tsx                  Contexto de estado/navegação (offline-first)
  Router.tsx                       Roteador simples baseado em estado
  Screen.tsx                       Componente-base (header + layout)
  WizardSteps.tsx                 Lógica do wizard de 4 passos

src/screens/
  PerfilScreen.tsx                Escolha de perfil (Produtor / Analista)
  HomeScreen.tsx                  "Meus imóveis" — lista, criar, abrir
  CadastroScreen.tsx              Dados do imóvel e produtor
  DemarcacaoScreen.tsx            Mapa + captura GPS + simulação
  DocumentosScreen.tsx            Anexar arquivos + foto georreferenciada
  RevisaoScreen.tsx               Resumo, validação, exportação + envio

src/lib/
  store.ts                        AsyncStorage (persistência offline)
  geo.ts                          Área/perímetro geodésicos, GeoJSON (RFC 7946), validação
  api.ts                          Envio para CAR Geo API (offline-resiliente)
  config.ts                       URL da API, limiares GPS
  documents.ts                    Image/document picker, geotag
  export.ts                       GeoJSON, PDF (expo-print), compartilhar

src/sim/
  routes.ts                       Rotas de demo (MT)
  useSimulatedWalk.ts             Hook: avatar animado em rota

src/hooks/
  usePerimeterTracker.ts          Captura GPS, vértices, tracking

src/theme/
  colors.ts                       Paleta ambiental

src/ui/
  index.tsx                       Componentes compartilhados (botões, cards, etc.)

src/types.ts                      Modelos de domínio (Imovel, Documento, Perfil, etc.)
```

## Conceitos-chave (devs)

### Offline-first
- Tudo é capturado e processado localmente (AsyncStorage).
- GeoJSON é gerado sem rede.
- Envio à API acontece quando houver conexão; se falhar, a fila persiste.
- Nunca bloqueamos a UI por falta de rede.

### Geometria
- Área e perímetro são **geodésicos** (com `geolib` ou Haversine), nunca em graus.
- Validação: anel fechado, mínimo 3 vértices, sem auto-interseção.
- Simplificação opcional (Douglas–Peucker) para reduzir ruído de GPS.

### Modo Simular caminhada
- Hook `useSimulatedWalk` anima um avatar 🚶 por uma rota pré-definida (`src/sim/routes.ts`).
- Útil para demo, teste, ou treinar sem GPS real.
- Marca vértices em tempo real, sem rede.

### Documentos e LGPD
- Dados do produtor (CPF/CNPJ) são **PII**: tratar com cuidado (secure-store, HTTPS fora de dev).
- Fotos podem ter geotag (lat/lng) — armazena junto com o documento.
- Tudo fica no sandbox do app até que o usuário exporte/envie.

## Documentação

- **[docs/guia-do-produtor.md](docs/guia-do-produtor.md)** — Como usar o app (passo a passo prático).
- **[docs/QUICK_START.md](docs/QUICK_START.md)** — Começo rápido para devs (5 minutos).
- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** — Setup, debugging, testes, troubleshooting.
- **[docs/BUILDING.md](docs/BUILDING.md)** — Build local e para produção.
- **[docs/FLUXO_DADOS.md](docs/FLUXO_DADOS.md)** — Arquitetura e fluxo de dados (diagramas).
- **[docs/INDEX.md](docs/INDEX.md)** — Índice e navegação de toda a documentação.
- **[CLAUDE.md](CLAUDE.md)** — Contexto técnico para agentes de IA.

## Roadmap (próximos passos)

- [ ] Sobrepor camadas da CAR Geo API (APP, hidrografia) durante a demarcação
- [ ] Integração com "Solução foto de campo" (anexar prova visual automática)
- [ ] Suporte a múltiplos idiomas
- [ ] Modo offline-only (sem envio automático)
- [ ] Analytics (sem rastrear coordenadas) para validar captura

## Licença

A definir (recomendado: MIT, por ser Bem Público Digital).
