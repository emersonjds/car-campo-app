<div align="center">

<img src="assets/brand-mark.png" alt="CAR Campo" width="96" />

# CAR Campo

### Desenhe o perímetro do seu imóvel rural **caminhando com o celular** 🚶📍

O produtor anda a divisa, o app captura os vértices por GPS, calcula **área e perímetro geodésicos**, cruza com **camadas ambientais oficiais** (Terra Indígena, UC, embargo IBAMA, desmatamento, queimada, APP), estima a **aptidão a crédito rural** e exporta tudo como **GeoJSON** para a CAR Geo API. **100% offline-first.**

[![Expo SDK 56](https://img.shields.io/badge/Expo_SDK-56-000020?logo=expo&logoColor=white)](https://docs.expo.dev/versions/v56.0.0/)
[![React Native 0.85](https://img.shields.io/badge/React_Native-0.85-20232A?logo=react&logoColor=61DAFB)](https://reactnative.dev/)
[![React 19](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript 6](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Turf.js](https://img.shields.io/badge/Geo-Turf.js-2C8C3C?logo=turbo&logoColor=white)](https://turfjs.org/)
[![Offline-first](https://img.shields.io/badge/Offline-first-2D5A27)](#-como-funciona-a-demarcação)
[![Licença](https://img.shields.io/badge/Licença-UNLICENSED-lightgrey)](#-licença)

> 🌱 **haCARthon · Desafio 2 · Solução 4** — "App de desenho georreferenciado pelo celular".
> Par natural: a `car-geo-api` (Solução 7) é o backend que recebe/serve as geometrias.

</div>

## ✨ O que ele faz

- 🚶 **Demarcação caminhando** — captura um vértice a cada 5 m, descarta fixes imprecisos (>20 m), simplifica o ruído com Ramer–Douglas–Peucker.
- 📐 **Área e perímetro geodésicos** — nunca em graus: shoelace esférico (raio WGS84) + Haversine, resultado em hectares e metros.
- 🛰️ **Sobreposição ambiental** — cruza o perímetro com WFS oficiais (FUNAI, ICMBio, IBAMA, INPE) e classifica severidade crítico/alerta/info.
- 💳 **Aptidão a crédito** — deriva score 0–100 e linhas Pronaf/Pronampe a partir da análise (informativo, não é oferta).
- 📤 **Exporta GeoJSON / PDF** — geometria RFC 7946 pronta para a CAR Geo API; croqui em PDF para levar à visita técnica.
- 📡 **Offline-first** — capturar, calcular e armazenar funcionam sem rede; sincroniza quando há conexão.
- 🎮 **Modo "Simular caminhada"** — avatar 🚶 percorre rotas de MT marcando vértices, sem GPS real — ideal para demo.

---

## 🚀 Rodar localmente

> ⚠️ Este app usa **mapa, GPS, câmera e secure store** — recursos nativos que **não rodam 100% no Expo Go**. É preciso um **development build** (`expo run:ios` / `expo run:android`).

### 1. O que instalar

| Ferramenta | Para quê | Como |
|---|---|---|
| **Node.js 20 LTS+** | runtime do Metro/Expo | [nodejs.org](https://nodejs.org) ou `nvm install --lts` |
| **bun** | gerenciador de pacotes (recomendado) | `curl -fsSL https://bun.sh/install \| bash` — ou use `yarn`/`npm` |
| **Watchman** *(macOS)* | file watching estável | `brew install watchman` |
| **Xcode 16+** *(iOS, só macOS)* | simulador + build iOS | App Store → depois `xcode-select --install` e abrir o Xcode 1x p/ aceitar a licença |
| **CocoaPods** *(iOS)* | dependências nativas iOS | `brew install cocoapods` |
| **Android Studio + JDK 17** *(Android)* | SDK, emulador e build | [developer.android.com/studio](https://developer.android.com/studio) → instalar um AVD |

### 2. Instalar e rodar

```bash
bun install            # ou: yarn install / npm install

bun ios                # build + simulador iOS   (precisa de dev build)
bun android            # build + emulador Android (precisa de dev build)
bun start              # Metro / Expo dev server (após o 1º dev build)
```

Sem gerenciador local: `npx expo run:ios` / `npx expo run:android`.

### 3. Ver o GPS funcionando

- **Sem GPS real:** use o modo **"Simular caminhada"** dentro do app — percorre rotas pré-definidas de MT (`src/sim/routes.ts`) e marca vértices automaticamente.
- **GPS simulado no emulador:** Android → *Extended Controls → Location → Routes*; iOS → *Features → Location*.

### 4. Configuração (opcional)

A URL da CAR Geo API vem de `app.json > extra.apiBaseUrl` ou da env `EXPO_PUBLIC_API_BASE_URL` (default `http://localhost:3000`). Fora de `localhost`, HTTP dispara aviso de LGPD — use HTTPS.

```bash
EXPO_PUBLIC_API_BASE_URL=https://sua-car-geo-api bun start
```

---

## 🧱 Stack

**Expo SDK 56 · React 19 · React Native 0.85 · TypeScript 6** — roteamento baseado em estado (sem react-navigation), gateado por sessão.

| Domínio | Bibliotecas |
|---|---|
| GPS / localização | `expo-location` |
| Mapa + polígono | `react-native-maps` |
| Geometria | `@turf/*` (area, intersect, difference, union, buffer, boolean-intersects) |
| Persistência offline | `@react-native-async-storage/async-storage` |
| Sessão sensível (LGPD) | `expo-secure-store` |
| Documentos / foto | `expo-image-picker`, `expo-document-picker`, `expo-file-system` |
| Exportação | `expo-print` (PDF), `expo-sharing` |
| Animação | `react-native-reanimated` (avatar de simulação) |

---

## 🛰️ APIs e camadas integradas — e por quê

A análise de sobreposição busca cada camada via **WFS oficial** dentro do bounding box do imóvel (com ~1 km de buffer), timeout curto (6 s) e **fallback individual por tipo** para fixtures de demo offline (`src/lib/refLayers.demo.ts`). Se **qualquer** WFS falhar, o resultado é marcado como `offline-demo` — nunca reporta `online` parcial, para não esconder uma camada crítica ausente (falso negativo regulatório). Endpoints reais em `src/lib/refLayers.ts`:

| Camada | Fonte (WFS / endpoint) | O que detecta | Por que importa |
|---|---|---|---|
| **Terra Indígena** | FUNAI — `geoserver.funai.gov.br/geoserver/wfs` · `funai:ti_sirgas` | Limites homologados/declarados de TIs | Sobreposição é impedimento legal ao registro no CAR e bloqueio de crédito (CF art. 231) |
| **Unidade de Conservação** | ICMBio / INDE — `geoservicos.inde.gov.br/geoserver/ICMBio/ows` · `ICMBio:BCIM_Unidade_Conservacao_A_2021` | UCs federais | Em UC de Proteção Integral a agropecuária é vedada (Lei 9.985/2000) |
| **Embargo IBAMA** | IBAMA SISCOM — `siscom.ibama.gov.br/geoserver/wfs` · `publica:vw_brasil_adm_embargo_a` | Embargo ambiental ativo | Imóvel embargado não obtém crédito rural nem licenciamento (MCR Seção 2) |
| **Desmatamento (PRODES)** | INPE TerraBrasilis — `terrabrasilis.dpi.inpe.br/geoserver/ows` · `prodes-amazon-nb:yearly_deforestation_biome` | Desmatamento anual consolidado (Amazônia) | Passivo florestal não regularizado pode suspender crédito (Lei 12.651/2012, PRA) |
| **Área queimada** | INPE Queimadas — `terrabrasilis.dpi.inpe.br/geoserver/ows` · `queimadas:aq1km_mensal` | Cicatriz de fogo mensal (1 km) | Fogo extenso indica risco à Reserva Legal e pode inviabilizar crédito |
| **APP / hidrografia** | sem WFS nacional → fixture demo | Faixa de APP de curso d'água/nascente | Pode haver obrigação de recomposição (Código Florestal, art. 61-A) |
| **CAR vizinho** | sem WFS nacional → fixture demo | Sobreposição de divisa com CAR adjacente | Indica possível conflito de limites (acionar INCRA) |

Todos os WFS são consultados com `srsName=CRS:84` (lon/lat WGS84 explícito, evitando a inversão de eixo do WFS 1.1.0). SIRGAS 2000 (EPSG:4674) e WGS84 são coincidentes a nível sub-métrico.

**Envio do GeoJSON — CAR Geo API** (`src/lib/api.ts`, `src/lib/config.ts`): o perímetro validado é serializado como `Feature`/`Polygon` (RFC 7946) e enviado via `POST {API_BASE_URL}/collections/imovel/items` (`application/geo+json`). A API atual da Solução 7 é somente-leitura (OGC API Features), então `404/405` são tratados com graça — o GeoJSON é sempre gerado localmente, pronto para envio quando o endpoint de escrita existir.

---

## 📐 Como funciona a demarcação

1. **Caminhar a divisa** — o produtor percorre o perímetro com o celular.
2. **Captura GPS** (`src/hooks/usePerimeterTracker.ts`) — novo vértice a cada `MIN_VERTEX_DISTANCE_M` (5 m); descarta fixes com `accuracy` acima de `MAX_ACCEPTABLE_ACCURACY_M` (20 m); remove a subscription no cleanup (bateria) e trata permissão negada.
3. **Simplificação RDP** (`simplifyRDP`, Ramer–Douglas–Peucker, tolerância 3 m) — reduz ruído preservando primeiro e último ponto.
4. **Polígono** — os vértices fecham o anel automaticamente (`toGeoJSONFeature`).
5. **Área e perímetro geodésicos** (`src/lib/geo.ts`) — shoelace geodésico (raio WGS84) + Haversine, **nunca em graus**.
6. **Validação topológica** (`validatePerimeter`) — bloqueia o envio com menos de 3 vértices, anel auto-intersectante (`selfIntersects`) ou área ~0; emite avisos não-bloqueantes para casos suspeitos.

---

## 🔎 Como funciona a sobreposição

O motor (`src/lib/overlay.ts`) cruza o anel com cada camada via **Turf**: `booleanIntersects` (bbox) → `intersect` (polígono de interseção, preservando holes) → `@turf/area` (m² geodésico). Para cada sobreposição calcula **hectares + percentual** e atribui **severidade** com mensagem em pt-br.

| Camada | Severidade base | Escalonamento dinâmico |
|---|---|---|
| Terra Indígena · UC · Embargo IBAMA | **crítico** ⛔ | — |
| Desmatamento (PRODES) | **alerta** ⚠ | → crítico se sobrepõe **> 20%** |
| Área queimada (AQ1km) | **alerta** ⚠ | → crítico se sobrepõe **> 20%** |
| APP / hidrografia | **info** ℹ | — |
| CAR vizinho | **info** ℹ | → alerta se sobrepõe **> 50%** |

A análise é `ok` quando **não** há sobreposição crítica. A partir dela, `src/lib/credito.ts` deriva a **aptidão a crédito** (score 0–100; sobreposição crítica zera elegibilidade e limita o score a 30). **É informativo** — não constitui oferta de crédito nem diagnóstico jurídico.

### O que **não** dá para afirmar

- **Titularidade da terra** — só INCRA/Justiça/Cartório determinam o dono; o app não substitui matrícula.
- **Legalidade definitiva de desmatamento** — sobreposição com PRODES aponta o fato, mas área consolidada (anterior a 22/07/2008) ou supressão autorizada podem ser legais; quem decide é IBAMA/Justiça.
- **Precisão sub-métrica** — GPS de celular tem ±5–10 m; *slivers* menores que ~10–20 m² podem ser ruído.

Detalhamento completo: [`docs/sobreposicao-validacao-car.md`](docs/sobreposicao-validacao-car.md).

---

## 🗂️ Estrutura de pastas

```
App.tsx                      AuthProvider + NavigationProvider + AppShell
src/app/                     navigation, Router (gateia por login), AppShell, TabBar
src/auth/                    AuthContext + AuthProvider (mock; OIDC+PKCE depois) + secureSession (LGPD)
src/screens/                 Login, Home, Cadastro, Demarcacao, Documentos, Revisao,
                             Validacao + Painel (analista), Config (perfil)
src/lib/
  geo.ts                     área/perímetro geodésicos, GeoJSON (RFC 7946), validação, RDP
  overlay.ts                 motor de sobreposição (Turf): interseção, severidade, mensagens
  refLayers.ts               fontes WFS oficiais + fetch por bbox + fallback offline
  refLayers.demo.ts          fixtures de demo (camadas fictícias sobre rotas de MT)
  credito.ts                 aptidão de crédito (Pronaf/Pronampe/Custeio/Investimento)
  api.ts / config.ts         envio do GeoJSON à CAR Geo API + configuração de URL
  store.ts                   persistência offline (AsyncStorage)
  documents.ts / export.ts   anexos/geotag · exportação GeoJSON/PDF/compartilhar
src/hooks/usePerimeterTracker.ts   captura GPS real (vértices, descarte, cleanup)
src/sim/                     rotas de demo (routes.ts) + useSimulatedWalk (avatar 🚶)
src/ui/  src/theme/  src/types.ts   componentes, paleta, modelos de domínio
```

Contexto técnico completo para agentes de IA: [`CLAUDE.md`](CLAUDE.md). Guia do produtor: [`docs/guia-do-produtor.md`](docs/guia-do-produtor.md).

---

## 📄 Licença

O `package.json` declara `"private": true` e **não define `license`** — o projeto é tratado como **UNLICENSED** (uso restrito ao haCARthon). O arquivo `LICENSE` é o template MIT do scaffold Expo e não reflete, por si só, uma licença de distribuição.
