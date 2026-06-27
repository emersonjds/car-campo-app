# Design — Análise de Sobreposição Ambiental + Aptidão a Crédito

> Status: implementado · Data: 2026-06-26 · Solução 4 (haCARthon · Desafio 2)
> Documento de referência: [sobreposicao-validacao-car.md](../../sobreposicao-validacao-car.md)

## Problema

Depois que o produtor desenha o perímetro do imóvel caminhando com GPS, é preciso responder
duas perguntas que o desenho sozinho não resolve:

1. **A metragem confere?** Área geodésica calculada × área declarada (módulos fiscais).
2. **O desenho invade ou cobre algo restritivo?** Terra Indígena, Unidade de Conservação,
   área embargada (IBAMA), desmatamento (INPE PRODES) ou cicatriz de queimada (INPE Queimadas).

A validação real é **interseção de polígonos** entre o imóvel e camadas oficiais — não os
painéis públicos (Qlik/Power BI), que são apenas visualização estatística.

## Objetivos

- Calcular sobreposição (hectares + % do imóvel) contra camadas oficiais, com severidade.
- Funcionar **offline-first**: nunca travar a UI; cair para camada de demonstração sem rede.
- Derivar um sinal de **aptidão a crédito rural** (Pronaf/Pronampe) a partir da conformidade.
- Ser honesto sobre os **limites legais** (o app sinaliza, não condena).

## Não-objetivos (YAGNI)

- Decidir titularidade da terra (compete a INCRA/FUNAI/Justiça).
- Atestar legalidade definitiva de desmatamento (depende de autorização e data de corte 22/07/2008).
- Precisão sub-métrica (GPS de celular ~5–10 m).

## Arquitetura (unidades isoladas)

| Unidade | Arquivo | Responsabilidade | Depende de |
|---|---|---|---|
| Motor de interseção | `src/lib/overlay.ts` | `analisarSobreposicoes(points, camadas, fonte)` → ha, %, severidade, mensagem | `geo.ts` (área geodésica), turf |
| Fontes de camadas | `src/lib/refLayers.ts` | `fetchCamadasPorBBox(bbox, tipos)` via WFS oficiais, offline-resiliente | global `fetch` |
| Fixtures de demo | `src/lib/refLayers.demo.ts` | `DEMO_CAMADAS` que cruzam a rota SORRISO_SOJA | — |
| Crédito | `src/lib/credito.ts` | `avaliarCredito(analise, imovel)` → score, linhas, bloqueios | `overlay.ts` (tipo), `geo.ts` |
| Tela | `src/screens/AnaliseAmbientalScreen.tsx` | laudo + crédito | os 4 acima |
| Integração | `RevisaoScreen` / `ValidacaoScreen` | resumo (produtor) e triagem (analista) | `overlay.ts`, `refLayers.demo.ts` |

### Contratos públicos (estáveis)

```ts
type CamadaTipo = 'terra_indigena' | 'unidade_conservacao' | 'embargo_ibama'
                | 'desmatamento' | 'queimada' | 'app_hidrografia' | 'car_vizinho';
type Severidade = 'critico' | 'alerta' | 'info';

interface Sobreposicao { tipo: CamadaTipo; nome: string; fonte: string;
  area_ha: number; percentual: number; severidade: Severidade; mensagem: string; }

interface AnaliseAmbiental { ok: boolean; sobreposicoes: Sobreposicao[];
  areaImovel_ha: number; geradoEm: string;
  fonteDados: 'online' | 'offline-demo' | 'cache'; incertezaPosicional_m?: number; }

function analisarSobreposicoes(points, camadas, fonteDados?): AnaliseAmbiental;
function avaliarCredito(analise, imovel): AptidaoCredito;
```

### Camadas oficiais (CRS:84 em todas)

| Tipo | Fonte | WFS / typeName |
|---|---|---|
| Terra Indígena | FUNAI | `funai:ti_sirgas` |
| Unidade de Conservação | ICMBio/INDE | `ICMBio:BCIM_Unidade_Conservacao_A_2021` |
| Embargo | IBAMA SISCOM | `publica:vw_brasil_adm_embargo_a` |
| Desmatamento | INPE PRODES | `prodes-amazon-nb:yearly_deforestation_biome` |
| Queimada | INPE Programa Queimadas | `queimadas:aq1km_mensal` (AQ1km) |
| APP / CAR vizinho | fixtures de demo | — |

## Regras de severidade

- **Crítico** (bloqueia crédito): `terra_indigena`, `unidade_conservacao`, `embargo_ibama`.
- **Alerta** (penaliza): `desmatamento`, `queimada` — escalam para crítico quando `% > 20`.
- **Info**: `app_hidrografia`, `car_vizinho` (`car_vizinho` sobe a alerta quando `% > 50`).

## Decisões-chave (e correções pós-revisão)

- **Interseção com furos**: o polígono da camada é montado como `polygon([exterior, ...holes])`
  para não gerar falso-positivo quando o imóvel está numa zona de exclusão de UC.
- **Falha parcial de WFS**: se qualquer camada com WFS falha, a fonte vira `offline-demo`
  (nunca `online` "limpo") — evita falso-negativo regulatório.
- **Eixo de coordenadas**: `CRS:84` (lon/lat explícito) em vez de `EPSG:4326` (lat/lon no WFS 1.1.0).
- **Guarda `< 3 pontos`**: `analisarSobreposicoes` retorna `ok:false` sem acusar a camada.
- **Crédito**: bloqueio crítico ⇒ `elegivelGeral:false` e score teto 30; `disclaimer` sempre presente.

## Testes e cobertura

- Runner: **Vitest** (`vitest.config.ts`, provider v8, gate 95%, meta 100%).
- Alvos: `geo.ts`, `overlay.ts`, `refLayers.ts`, `refLayers.demo.ts`, `credito.ts`.
- Estado: **100% de linhas**, 114 testes, `tsc --noEmit` sem erros.
- `refLayers.ts` testado com `fetch` mockado (sucesso, vazio, falha parcial, Polygon/MultiPolygon com furos).
