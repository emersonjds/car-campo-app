# CLAUDE.md — CAR Campo (app de desenho georreferenciado)

> ⚠️ **Expo mudou.** Antes de escrever qualquer código com APIs do Expo, leia a doc da versão exata: https://docs.expo.dev/versions/v56.0.0/

Contexto para agentes de IA trabalhando neste repositório.

## O que é

App mobile que permite ao **produtor rural desenhar o perímetro do imóvel caminhando com o celular** (GPS), calcular a área e exportar/enviar como GeoJSON para a CAR Geo API.
haCARthon · **Desafio 2 · Solução 4** — "App de desenho georreferenciado pelo celular".

**Par natural**: a [`car-geo-api`](../car-geo-api) (Solução 7) é o backend que recebe/serve as geometrias.

## Stack

- **Expo SDK 56** · **React 19** · **React Native 0.85** · **TypeScript**
- GPS: `expo-location`
- Mapa: `react-native-maps` (mapa + renderização de polígono)
- Persistência: `@react-native-async-storage/async-storage`
- Documentos/foto: `expo-image-picker`, `expo-document-picker`, `expo-file-system`
- Exportação: `expo-print` (PDF), `expo-sharing`
- Animações: `react-native-reanimated` (avatar de simulação)
- Config: `expo-constants`
- Gerenciador: **bun** (ou yarn)
- ⚠️ Requer **development build**: maps, location, câmera e file picker não rodam 100% no Expo Go

## Comandos

```bash
bun install
# ou: yarn install

bun start               # Metro / Expo dev server
bun ios                 # simulador iOS (precisa de dev build)
bun android             # emulador Android (precisa de dev build)

# Com npx (sem gerenciador local)
npx expo run:ios
npx expo run:android
```

Para simular o GPS no emulador: Android (Extended Controls → Location → rota) / iOS (Features → Location).

Ou use o modo **Simular caminhada** dentro do app (offline, não precisa GPS real).

## Arquitetura (mapa rápido)

App multi-tela offline-first com fluxo de 4 passos por imóvel:

- `App.tsx` — ponto de entrada (AuthProvider + NavigationProvider + AppShell).
- `src/app/navigation.tsx` — contexto de estado; **perfil derivado da sessão** (login).
- `src/app/Router.tsx` — roteador baseado em estado (sem react-navigation); **gateia por sessão** (sem login → LoginScreen).
- `src/app/AppShell.tsx` + `src/app/TabBar.tsx` — barra de navegação inferior (abas por perfil).
- `src/screens/LoginScreen.tsx` — **login**: produtor via gov.br (mock), analista via matrícula+senha.
- `src/screens/HomeScreen.tsx` — "Meus imóveis" (lista offline) + FAB novo imóvel.
- `src/screens/CadastroScreen.tsx` — dados do imóvel e produtor (pré-preenche da sessão gov.br).
- `src/screens/DemarcacaoScreen.tsx` — mapa com GPS real ou simulação.
- `src/screens/DocumentosScreen.tsx` — anexar arquivos + foto georreferenciada.
- `src/screens/RevisaoScreen.tsx` — validação, exportação e envio.
- `src/screens/ValidacaoScreen.tsx` + `PainelScreen.tsx` — **analista**: validação geométrica e dashboard.
- `src/screens/ConfigScreen.tsx` — aba Perfil: identidade logada + Sair.

Autenticação (login):

- `src/auth/AuthContext.tsx` — `useAuth()` (sessão, login gov.br/matrícula, logout).
- `src/auth/AuthProvider.ts` + `mockAuthProvider.ts` — **seam**: mock agora; OIDC+PKCE real depois.
- `src/auth/secureSession.ts` — sessão sensível (token/CPF) em **expo-secure-store** (LGPD).

Camadas de negócio:

- `src/lib/store.ts` — AsyncStorage (persistência offline).
- `src/lib/geo.ts` — **área/perímetro geodésicos**, GeoJSON (RFC 7946), validação (anel fechado, auto-interseção, simplificação).
- `src/lib/api.ts` — envio para a CAR Geo API (offline-resiliente).
- `src/lib/documents.ts` — image/document picker, geotag.
- `src/lib/export.ts` — GeoJSON, PDF (expo-print), compartilhar.
- `src/lib/config.ts` — URL da API (`app.json > extra.apiBaseUrl` ou `EXPO_PUBLIC_API_BASE_URL`).

Simulação (modo demo):

- `src/sim/routes.ts` — rotas pré-definidas de demo (MT).
- `src/sim/useSimulatedWalk.ts` — hook: avatar 🚶 animado, marca vértices sem GPS.

Shared:

- `src/hooks/usePerimeterTracker.ts` — captura GPS real, vértices, cleanup.
- `src/ui/index.tsx` — componentes compartilhados (botões, cards, inputs).
- `src/types.ts` — modelos de domínio (Imovel, Documento, Perfil, etc.).
- `src/theme/colors.ts` — paleta ambiental.

## Regras (não quebrar)

- **Offline-first**: capturar, processar e armazenar 100% local (AsyncStorage); enviar à API quando houver rede; nunca bloquear a UI.
- **GPS**: `usePerimeterTracker` remove subscription no cleanup (bateria!); trata permissão negada; descarta fixes imprecisos (<= 10m accuracy).
- **Geometria**: área/perímetro **geodésicos** (nunca em graus); validação: anel fechado, mínimo 3 vértices, sem auto-interseção.
- **Simulação**: modo offline "Simular caminhada" marca vértices sem GPS real, ideal para demo/treino.
- **Segurança/privacidade**: CPF/CNPJ são PII (LGPD); sem log de coordenadas em produção; HTTPS fora de dev; arquivos no sandbox do app.
- **Documentos**: armazenar localmente (file system app); geotag é opcional mas recomendado para fotos de divisa.

## Agentes

`.claude/agents/`: **front** (RN/Expo/perf/offline), **pixel** (UX rural mobile), **geo** (geometria/GPS/GeoJSON), **bug** (quality gate), **qa** (E2E mobile/Maestro), **redteam** (segurança), **scribe** (docs/microcopy).

## MCP

`serena`, `context-mode`, `context7` — configurados em `.mcp.json`.
