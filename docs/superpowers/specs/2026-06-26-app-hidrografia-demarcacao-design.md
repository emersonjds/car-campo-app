# Design — Camadas de APP/Hidrografia durante a Demarcação

> Status: planejado · Data: 2026-06-26 · haCARthon **Desafio 2** (acesso a dados geoespaciais)
> Persona-alvo: Seu Raimundo (desenhar sem invadir APP) e Luana (validar APP/uso restrito).

## Problema (do briefing)

O Desafio 2 pede mapeamento acurado de **feições naturais (rios, nascentes), APP e áreas de
uso restrito** para delimitar corretamente as áreas internas do imóvel. Hoje o produtor desenha
o perímetro "às cegas": não vê onde passa um rio nem qual faixa vira **Área de Preservação
Permanente (APP)** — e a APP mal declarada é uma das maiores causas do "ciclo de retificações
infinitas" que sobrecarrega a Luana.

## Objetivo

Durante a demarcação, sobrepor **hidrografia** e **APP** ao desenho e informar, ao vivo,
quanta APP cai dentro do imóvel — usando bases oficiais (FBDS/ANA) com fallback offline.

## Fonte de dados

- **FBDS** — camadas vetorizadas por estado (hidrografia, APP, uso e cobertura). Referência
  explícita do briefing ("Mapas gerados pela FBDS para os estados utilizarem no CAR").
- **Hidrografia oficial** (ANA/SNIRH ou base FBDS) como linha-d'água para derivar APP quando
  não houver polígono de APP pronto.
- Offline-first: fixtures de demo na região da rota SORRISO_SOJA, como nas demais camadas.

## Regra de APP (Código Florestal, Lei 12.651/2012)

A APP é derivada da hidrografia por **buffer**:
- Margem de curso d'água: faixa por largura do rio (30 m até 500 m).
- Nascente / olho d'água: raio de **50 m**.
- (Lago/reservatório e topo de morro ficam fora do MVP.)

Quando houver polígono de APP pronto (FBDS), usa-se direto; senão, deriva-se por buffer da
linha-d'água com `@turf/buffer`.

## Arquitetura

| Unidade | Arquivo | Responsabilidade |
|---|---|---|
| Fonte | `src/lib/refLayers.ts` | configs WFS de `hidrografia` e `app` + fetch por bbox |
| Derivação de APP | `src/lib/app.ts` (novo) | `derivarAPP(hidrografia)` → polígonos de APP via buffer; `appDentroDoImovel(points, appCamadas)` → ha de APP no imóvel |
| Motor | `src/lib/overlay.ts` | `app_hidrografia` passa a ser camada de 1ª classe (já existe o tipo) |
| Fixtures | `src/lib/refLayers.demo.ts` | hidrografia + APP cruzando SORRISO_SOJA |
| UI demarcação | `src/screens/DemarcacaoScreen.tsx` | render de hidrografia/APP no mapa + "X ha de APP no desenho" ao vivo |

### Contrato (novo módulo)

```ts
// src/lib/app.ts
export interface AppResultado {
  app_ha: number;          // APP total dentro do imóvel
  porcentagem: number;     // % do imóvel em APP
  feicoes: { tipo: 'margem_rio' | 'nascente'; descricao: string; ha: number }[];
}
export function derivarAPP(hidrografia: CamadaRef[]): CamadaRef[];
export function appDentroDoImovel(points: LngLat[], appCamadas: CamadaRef[]): AppResultado;
```

## Offline-first e desempenho

- `fetchCamadasPorBBox` ganha `hidrografia`/`app`; em falha cai para demo (`offline-demo`).
- Buffer e interseção rodam client-side (turf, puro JS) — sem rede em tempo de cálculo.
- O cálculo ao vivo na demarcação é **debounced** e roda sobre a geometria simplificada (RDP).

## Limites (honestidade)

- APP derivada por buffer é **estimativa** (depende da largura do rio, nem sempre conhecida) —
  rotular como "estimativa de campo", não como APP oficial homologada.
- Datum SIRGAS 2000 (EPSG:4674) ≈ WGS84 (sub-métrico) — usar lon/lat direto (CRS:84).
- Precisão do GPS (~5–10 m) limita APPs estreitas.

## Testes

- `app.test.ts`: nascente (raio 50 m → área ≈ π·50²), margem de rio (faixa), APP fora do imóvel
  (0 ha), interseção parcial. Manter **100% de linhas** nos módulos-alvo (+ `app.ts`).
