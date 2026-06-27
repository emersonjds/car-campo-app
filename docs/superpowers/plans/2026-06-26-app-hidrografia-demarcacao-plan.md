# Plano — Camadas de APP/Hidrografia na Demarcação + PDFs do time

> Spec: [2026-06-26-app-hidrografia-demarcacao-design.md](../specs/2026-06-26-app-hidrografia-demarcacao-design.md)
> Briefing haCARthon (Desafio 2). Execução orquestrada por agents.

## Fase 1 — Lógica geoespacial (agent geo)
- [ ] `src/lib/refLayers.ts`: configs de `hidrografia` e `app` (FBDS/ANA), CRS:84, fallback demo.
- [ ] `src/lib/refLayers.demo.ts`: fixtures de hidrografia + APP cruzando SORRISO_SOJA.
- [ ] `src/lib/app.ts`: `derivarAPP` (buffer: margem por largura, nascente 50 m) e `appDentroDoImovel`.
- [ ] `src/lib/overlay.ts`: `app_hidrografia` como camada de 1ª classe (mensagem/severidade info).
- [ ] Dependência: `@turf/buffer`.
- [ ] Critério: `tsc` 0 erros.

## Fase 2 — Testes (agent geo) — manter 100%
- [ ] `src/lib/app.test.ts`: nascente (≈ π·50²), margem, APP fora (0 ha), interseção parcial.
- [ ] Atualizar `vitest.config.ts` include com `src/lib/app.ts`.

## Fase 3 — UI da demarcação (agent front)
- [ ] `DemarcacaoScreen.tsx`: render de hidrografia (linha azul) e APP (faixa) no `react-native-maps`.
- [ ] Indicador ao vivo "X ha de APP dentro do desenho" (debounced, sobre geometria simplificada).
- [ ] Rótulo "estimativa de campo" (não é APP homologada). Offline-first.

## Fase 4 — Documentos PDF para o time (agents scribe + ambiental)
- [ ] `docs/desafio2-car-campo.{html,pdf}` — como o app responde ao Desafio 2 + personas.
- [ ] `docs/ideias-por-persona-roadmap.{html,pdf}` — backlog priorizado (Raimundo/Luana).
- [ ] `docs/fontes-de-dados-e-integracao.{html,pdf}` — catálogo de fontes oficiais e ordem de integração.
- [ ] `docs/limites-e-conformidade.{html,pdf}` — o que dá/não dá afirmar, datum, LGPD.

## Fase 5 — Quality gate + entrega
- [ ] `bug` + `qa` revisam lógica e UI.
- [ ] Converter HTML → PDF (Chrome headless).
- [ ] `tsc` 0 erros + cobertura ≥ 95% (meta 100%).
- [ ] Micro commits sem rastro de LLM.

## Pendências / riscos
- [ ] Endpoint WFS aberto da FBDS pode não existir (distribuição é shapefile) — usar fallback demo e documentar.
- [ ] Largura do rio nem sempre disponível → buffer com largura padrão por classe, rotulado como estimativa.
