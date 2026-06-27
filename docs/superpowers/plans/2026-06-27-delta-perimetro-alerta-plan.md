# Plano — Delta de Perímetro e Alerta de Re-demarcação

> Spec: [2026-06-27-delta-perimetro-alerta-design.md](../specs/2026-06-27-delta-perimetro-alerta-design.md)
> Execução orquestrada por agents (geo → front → bug/qa). Manter tsc 0 e cobertura ≥ 95% (meta 100%).

## Fase 1 — Modelo de dados + snapshot (agent geo)
- [ ] `src/types.ts`: `Imovel.geometryAnterior?: ImovelGeometry` e `Imovel.deltaRelatorio?: DeltaRelatorio`.
- [ ] `src/lib/store.ts`: em `updateImovel`, quando o patch traz `geometry`, snapshot da geometria atual em `geometryAnterior` antes de sobrescrever (só se diferente).
- [ ] Critério: `tsc` 0 erros; sem quebrar persistência existente.

## Fase 2 — Motor de delta (agent geo) — manter 100%
- [ ] Dependência: `@turf/difference`.
- [ ] `src/lib/delta.ts`: `compararPerimetros(anterior, novo, camadas, fonte?)` → `DeltaRelatorio | null`. Reusa `analisarSobreposicoes` (overlay) e `areaHectares` (geo). Trata slivers (limiar mínimo), divisão por zero, < 3 pontos.
- [ ] `src/lib/delta.ts`: classificação de `tipoAlteracao`, `severidade`, `requerVisita`, `recomendacao` conforme limiares do spec.
- [ ] `src/lib/refLayers.demo.ts` (ou novo fixture): baseline de demo `DEMO_PERIMETRO_ANTERIOR` que difere da rota SORRISO_SOJA (delta visível, tocando queimada/APP).
- [ ] `src/lib/delta.test.ts`: acrescido/suprimido, microajuste, toca camada crítica (visita), <3 pontos (null), divisão por zero, sliver ignorado. Atualizar `vitest.config.ts` include.

## Fase 3 — UI produtor (agent front)
- [ ] `DemarcacaoScreen.tsx`: render do perímetro anterior (branco tracejado) + áreas acrescida/suprimida (só quando pausado/concluído); card de divergência (ANTES×AGORA×DIFERENÇA + microcopy); banner crítico (pausa + confirmação) quando o acrescido toca TI/UC/embargo. Hook `useAlteracaoDelta` debounced (800 ms) sobre geometria RDP. Baseline de demo quando não há anterior real.
- [ ] `RevisaoScreen.tsx`: seção "Comparação com registro anterior".

## Fase 4 — UI analista (agent front)
- [ ] `ValidacaoScreen.tsx`: badge "Alteração detectada — requer visita" (cor por severidade) + botão "Ver detalhes da alteração".
- [ ] `PainelScreen.tsx`: métrica "Requer visita: N" + seção "Fila de visitas" priorizada.
- [ ] `AlteracaoDetalheScreen.tsx` (nova) + rota `alteracao-detalhe` em navigation/Router (acessível de Revisão, Validação e Painel).

## Fase 5 — Quality gate + entrega
- [ ] `bug` (correção geométrica do difference, offline, perf, lifecycle) + `qa` (fluxos: re-demarcação, primeira demarcação sem anterior, offline, fila do analista).
- [ ] Aplicar correções; `tsc` 0; cobertura ≥ 95% (meta 100%); micro commits sem rastro de LLM.

## Riscos
- [ ] `turf/difference` com polígonos degenerados/auto-interseção → tratar null e geometrias inválidas sem quebrar a UI.
- [ ] Demo precisa de baseline plausível para o delta aparecer offline.
- [ ] Não exagerar no mapa (delta só quando parado) para não criar jank a 30 fps.
