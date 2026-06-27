# Plano de Implementação — Sobreposição Ambiental + Crédito + Queimada + Testes

> Spec: [2026-06-26-sobreposicao-ambiental-design.md](../specs/2026-06-26-sobreposicao-ambiental-design.md)
> Execução orquestrada por agents (geo, microcredito, scribe, front, bug, qa) + workflow.

## Fase 1 — Motor de sobreposição  ✅
- [x] `src/lib/overlay.ts` — interseção (turf), área geodésica reusando `geo.ts`, severidade, mensagens pt-br.
- [x] `src/lib/refLayers.ts` — WFS oficiais por bbox, timeout 6s, fallback por-tipo, `CRS:84`.
- [x] `src/lib/refLayers.demo.ts` — fixtures cruzando SORRISO_SOJA (TI, embargo, PRODES, APP).
- Critério: `tsc` 0 erros; demo gera sobreposição real.

## Fase 2 — Aptidão a crédito  ✅
- [x] `src/lib/credito.ts` — Pronaf/Pronampe/custeio/investimento; bloqueio por severidade crítica; `disclaimer` obrigatório.

## Fase 3 — UI e integração  ✅
- [x] `AnaliseAmbientalScreen.tsx` (laudo + crédito) + rota `analise-ambiental`.
- [x] Resumo na `RevisaoScreen` (produtor) e triagem na `ValidacaoScreen` (analista).

## Fase 4 — Quality gate  ✅
- [x] `bug`: corrigidos B1 (falso-negativo WFS), furos de polígono, eixo bbox, guarda `<3`, lifecycle.
- [x] `qa`: corrigido bloqueante de Rules of Hooks na `RevisaoScreen`.

## Fase 5 — Camada de queimada  ✅
- [x] `overlay.ts`: `CamadaTipo` += `queimada`; severidade `alerta` com escala a crítico (`% > 20`).
- [x] `refLayers.ts`: WFS INPE Queimadas (`queimadas:aq1km_mensal`).
- [x] `refLayers.demo.ts`: fixture `QUEIMADA_AQ1KM` cruzando SORRISO_SOJA.
- [x] `credito.ts` + UI (`ValidacaoScreen.tipoLabel`, ícone 🔥 na `AnaliseAmbientalScreen`).

## Fase 6 — Testes e cobertura  ✅
- [x] Vitest + `@vitest/coverage-v8`, `vitest.config.ts` (gate 95%, meta 100%).
- [x] Suítes: `geo`, `overlay`, `refLayers` (fetch mockado), `refLayers.demo`, `credito`.
- [x] Loop até convergir: **100% de linhas**, 114 testes, `tsc` 0 erros.

## Fase 7 — Documentação  ✅
- [x] `README.md` com badges (cobertura, Expo 56, React 19, TS, Vitest), como rodar, APIs e porquê,
      demarcação, sobreposição, avisos (queimada/desmatamento/TI/UC/embargo) e limites.

## Pendências conhecidas (próximos passos)
- [ ] Confirmar `typeName` exato das camadas WFS via `GetCapabilities` ao vivo (INPE/IBAMA).
- [ ] DETER (alertas quase-tempo-real) além do PRODES anual.
- [ ] Cobertura de componentes (telas RN) — hoje a métrica cobre a lógica em `src/lib`.
