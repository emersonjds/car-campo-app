# CAR Campo — desenho georreferenciado pelo celular

[![Expo SDK 56](https://img.shields.io/badge/Expo_SDK-56-000020)](https://docs.expo.dev/versions/v56.0.0/)
[![React 19.2](https://img.shields.io/badge/React-19.2-61DAFB)](https://react.dev/)
[![React Native 0.85](https://img.shields.io/badge/React_Native-0.85-20232A)](https://reactnative.dev/)
[![TypeScript 6.0](https://img.shields.io/badge/TypeScript-6.0-3178C6)](https://www.typescriptlang.org/)
[![Testes: Vitest](https://img.shields.io/badge/Testes-Vitest-6E9F18)](https://vitest.dev/)
[![Cobertura 100%](https://img.shields.io/badge/Cobertura-100%25-brightgreen)](#testes)
[![Licença UNLICENSED](https://img.shields.io/badge/Licen%C3%A7a-UNLICENSED-lightgrey)](#licença)

App mobile que permite ao **produtor rural desenhar o perímetro do imóvel caminhando com o celular** (GPS): captura os vértices ao longo da divisa, calcula **área e perímetro geodésicos**, **valida a sobreposição com camadas ambientais oficiais** (Terra Indígena, Unidade de Conservação, embargo IBAMA, desmatamento, queimada, APP), estima a **aptidão a crédito rural** e exporta/envia o resultado como **GeoJSON** para a CAR Geo API. Tudo **offline-first**: capturar, calcular e armazenar funcionam sem rede; a sincronização acontece quando há conexão.

> haCARthon · **Desafio 2 · Solução 4** — "App de desenho georreferenciado pelo celular".
> Par natural: a `car-geo-api` (Solução 7) é o backend que recebe/serve as geometrias.

---

## Como rodar

### Pré-requisitos

- **bun** (gerenciador recomendado) ou yarn.
- **Development build** do Expo: mapa, GPS, câmera e file picker **não rodam 100% no Expo Go** — use `expo run:ios`/`expo run:android` ou um dev client.
- Stack: **Expo SDK 56 · React 19 · React Native 0.85 · TypeScript**.

### Instalação e execução

```bash
bun install

bun start        # Metro / Expo dev server
bun ios          # simulador iOS  (precisa de dev build)
bun android      # emulador Android (precisa de dev build)
```

Sem gerenciador local: `npx expo run:ios` / `npx expo run:android`.

Para simular GPS no emulador: Android (Extended Controls → Location → rota) / iOS (Features → Location).
Ou, sem nenhum GPS real, use o modo **"Simular caminhada"** dentro do app: um avatar 🚶 percorre rotas pré-definidas de MT (`src/sim/routes.ts`) marcando vértices automaticamente — ideal para demo e treino offline.

### Testes

Testes unitários com **Vitest** (cobertura medida em **100%**):

```bash
bun run test       # vitest run
bun run coverage   # vitest run --coverage  (@vitest/coverage-v8)
```

---

## APIs e camadas integradas — e por quê

A análise de sobreposição busca cada camada via **WFS oficial** dentro do bounding box do imóvel (com ~1 km de buffer), com timeout curto (6 s) e **fallback individual por tipo** para fixtures de demo offline (`src/lib/refLayers.demo.ts`). Se **qualquer** WFS falhar, o resultado é marcado como `offline-demo` — nunca reporta `online` parcial, para não esconder uma camada crítica ausente (falso negativo regulatório). Endpoints reais conforme `src/lib/refLayers.ts`:

| Camada | Fonte (WFS / endpoint) | O que detecta | Por que importa |
|---|---|---|---|
| **Terra Indígena** | FUNAI — `geoserver.funai.gov.br/geoserver/wfs` · `funai:ti_sirgas` | Limites homologados/declarados de TIs | Sobreposição é impedimento legal ao registro no CAR e bloqueio definitivo de crédito (CF art. 231) |
| **Unidade de Conservação** | ICMBio / INDE — `geoservicos.inde.gov.br/geoserver/ICMBio/ows` · `ICMBio:BCIM_Unidade_Conservacao_A_2021` | UCs federais | Em UC de Proteção Integral a atividade agropecuária é vedada (Lei 9.985/2000); risco legal e de crédito |
| **Embargo IBAMA** | IBAMA SISCOM — `siscom.ibama.gov.br/geoserver/wfs` · `publica:vw_brasil_adm_embargo_a` | Áreas com embargo ambiental ativo | Imóvel embargado não obtém crédito rural nem licenciamento (MCR Seção 2) |
| **Desmatamento (PRODES)** | INPE TerraBrasilis — `terrabrasilis.dpi.inpe.br/geoserver/ows` · `prodes-amazon-nb:yearly_deforestation_biome` | Desmatamento anual consolidado (Amazônia) | Passivo florestal não regularizado pode suspender o crédito (Lei 12.651/2012, PRA) |
| **Área queimada** | INPE Programa Queimadas — `terrabrasilis.dpi.inpe.br/geoserver/ows` · `queimadas:aq1km_mensal` (AQ1km) | Cicatriz de fogo mensal (1 km) | Fogo extenso indica risco de dano à vegetação/Reserva Legal e pode inviabilizar o crédito |
| **APP / hidrografia** | sem WFS nacional consolidado → servida via fixture demo | Faixa de Área de Preservação Permanente de curso d'água/nascente | Pode haver obrigação de recomposição (Código Florestal, art. 61-A) |
| **CAR vizinho** | sem WFS nacional consolidado → servida via fixture demo | Sobreposição de divisa com imóvel CAR adjacente | Indica possível conflito de limites (acionar INCRA) |

> O DETER (alertas INPE em tempo real) é citado na documentação como evolução possível; a camada de desmatamento atualmente integrada é o **PRODES anual**.

Todos os WFS são consultados com `srsName=CRS:84` (lon/lat WGS84 explícito, evitando a inversão de eixo do WFS 1.1.0). SIRGAS 2000 (EPSG:4674) e WGS84 são coincidentes a nível sub-métrico.

**Envio do GeoJSON — CAR Geo API** (`src/lib/api.ts`, `src/lib/config.ts`): o perímetro validado é serializado como `Feature`/`Polygon` (RFC 7946) e enviado via `POST {API_BASE_URL}/collections/imovel/items` (`application/geo+json`). A API atual da Solução 7 é somente-leitura (OGC API Features), então `404/405` são tratados com graça — o GeoJSON é sempre gerado localmente, pronto para envio quando o endpoint de escrita existir. A URL vem de `app.json > extra.apiBaseUrl` ou `EXPO_PUBLIC_API_BASE_URL` (default `http://localhost:3000`); fora de localhost, HTTP dispara aviso de LGPD (use HTTPS).

---

## Como funciona a demarcação

1. **Caminhar a divisa** — o produtor percorre o perímetro com o celular.
2. **Captura GPS** (`src/hooks/usePerimeterTracker.ts`) — registra um novo vértice a cada `MIN_VERTEX_DISTANCE_M` (5 m); descarta fixes imprecisos (`accuracy` acima de `MAX_ACCEPTABLE_ACCURACY_M` = 20 m); remove a subscription no cleanup (bateria) e trata permissão negada.
3. **Simplificação RDP** (`simplifyRDP`, Ramer–Douglas–Peucker, tolerância padrão 3 m) — reduz ruído de GPS preservando primeiro e último ponto.
4. **Polígono** — os vértices fecham o anel automaticamente (`toGeoJSONFeature`).
5. **Área e perímetro geodésicos** (`src/lib/geo.ts`) — área via fórmula esférica (shoelace geodésico, raio WGS84) e perímetro via Haversine, **nunca em graus**. Resultado em hectares e metros.
6. **Validação topológica** (`validatePerimeter`) — bloqueia o envio em: menos de 3 vértices, anel que se auto-intersecta (`selfIntersects`, teste de orientação por pares de segmentos) ou área ~0. Emite avisos não-bloqueantes para área/perímetro suspeitos e pontos com GPS impreciso.

---

## Como funciona a sobreposição

O motor (`src/lib/overlay.ts`) cruza o anel do imóvel com cada camada usando **Turf**: `booleanIntersects` (teste rápido de bbox) → `intersect` (polígono de interseção, preservando buracos/holes de zonas de exclusão) → `@turf/area` (área geodésica em m²). Para cada sobreposição calcula **hectares + percentual** do imóvel e atribui **severidade**, com mensagem em pt-br para o produtor.

| Camada | Severidade base | Escalonamento dinâmico |
|---|---|---|
| Terra Indígena | **crítico** ⛔ | — |
| Unidade de Conservação | **crítico** ⛔ | — |
| Embargo IBAMA | **crítico** ⛔ | — |
| Desmatamento (PRODES) | **alerta** ⚠ | → crítico se sobrepõe **> 20%** do imóvel |
| Área queimada (AQ1km) | **alerta** ⚠ | → crítico se sobrepõe **> 20%** do imóvel |
| APP / hidrografia | **info** ℹ | — |
| CAR vizinho | **info** ℹ | → alerta se sobrepõe **> 50%** do imóvel |

A análise é `ok` quando **não** há nenhuma sobreposição crítica; as sobreposições são ordenadas crítico → alerta → info. Geometria de camada malformada é ignorada sem quebrar a UI.

**Exemplo numérico** (fixtures de demo sobre a rota `SORRISO_SOJA`, MT — todos os dados são fictícios):

```
Imóvel: ~50 ha
  ⛔ TI Xavante Sorriso ......... ~15–20% → crítico  (impedimento ao CAR)
  ⛔ Embargo IBAMA AI 1234567 ... ~10%    → crítico  (bloqueia crédito)
  ⚠ Desmatamento PRODES 2023 ... ~12%    → alerta   (regularizar via PRA)
  ⚠ Queimada AQ1km set/2023 .... ~5–15%  → alerta   (averiguar origem do fogo)
  ℹ APP Riacho (faixa 30 m) ..... ~5%     → info     (verificar recomposição)
  → análise: NÃO ok (há sobreposição crítica)
```

A partir da análise, `src/lib/credito.ts` deriva a **aptidão a crédito** (score 0–100, bloqueios e linhas Pronaf / Pronampe Rural / Custeio / Investimento). Sobreposição crítica zera a elegibilidade e limita o score a 30. **É informativo** — não constitui oferta de crédito nem diagnóstico jurídico.

---

## O que isso destrava — e o que não dá para afirmar

**Destrava** (resumo de [`docs/sobreposicao-validacao-car.md`](docs/sobreposicao-validacao-car.md)): um imóvel com **CAR ativo e sem embargo IBAMA** remove um obstáculo crítico ao **crédito rural** (Pronaf para agricultura familiar; Pronampe para micro/pequenas empresas rurais), além de viabilizar regularização ambiental (PRA/Termo de Compromisso) e gerar laudo/croqui que aceleram a triagem do analista.

**Não dá para afirmar:**
- **Titularidade da terra** — só INCRA/Justiça/Cartório determinam o dono; o app não substitui matrícula.
- **Legalidade definitiva de desmatamento** — sobreposição com PRODES aponta o fato, mas área consolidada (anterior a 22/07/2008) ou supressão autorizada podem ser legais; quem decide é IBAMA/Justiça.
- **Precisão sub-métrica** — GPS de celular tem ±5–10 m; *slivers* menores que ~10–20 m² podem ser ruído, não sobreposição real.

Detalhamento completo (camadas, limites, roadmap, glossário): [`docs/sobreposicao-validacao-car.md`](docs/sobreposicao-validacao-car.md) · versão PDF em [`docs/sobreposicao-validacao-car.pdf`](docs/sobreposicao-validacao-car.pdf).

---

## Estrutura de pastas

App multi-tela offline-first, roteamento baseado em estado (sem react-navigation), gateado por sessão.

```
App.tsx                      AuthProvider + NavigationProvider + AppShell
src/app/                     navigation, Router (gateia por login), AppShell, TabBar
src/auth/                    AuthContext + AuthProvider (mock; OIDC+PKCE depois) + secureSession (expo-secure-store, LGPD)
src/screens/                 Login, Home, Cadastro, Demarcacao, Documentos, Revisao,
                             Validacao + Painel (analista), Config (perfil)
src/lib/
  geo.ts                     área/perímetro geodésicos, GeoJSON (RFC 7946), validação topológica, RDP
  overlay.ts                 motor de sobreposição (Turf): interseção, severidade, mensagens
  refLayers.ts               fontes WFS oficiais + fetch por bbox + fallback offline
  refLayers.demo.ts          fixtures de demo (camadas fictícias sobre rotas de MT)
  credito.ts                 aptidão de crédito (Pronaf/Pronampe/Custeio/Investimento)
  api.ts / config.ts         envio do GeoJSON à CAR Geo API + configuração de URL
  store.ts                   persistência offline (AsyncStorage)
  documents.ts / export.ts   anexos/geotag · exportação GeoJSON/PDF/compartilhar
src/hooks/usePerimeterTracker.ts   captura GPS real (vértices, descarte, cleanup)
src/sim/                     rotas de demo (routes.ts) + useSimulatedWalk (avatar 🚶)
src/ui/  src/theme/  src/types.ts   componentes compartilhados, paleta, modelos de domínio
```

Contexto técnico completo para agentes: [`CLAUDE.md`](CLAUDE.md).

---

## Licença

O `package.json` declara `"private": true` e **não define campo `license`** — o projeto é tratado como **UNLICENSED** (uso restrito ao haCARthon). O arquivo `LICENSE` presente é o template MIT padrão do scaffold Expo e não reflete, por si só, uma licença de distribuição do projeto.
