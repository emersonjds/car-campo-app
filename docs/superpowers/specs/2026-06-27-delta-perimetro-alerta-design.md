# Design — Delta de Perímetro e Alerta de Re-demarcação

> Status: planejado · Data: 2026-06-27 · haCARthon **Desafio 2** (alteração de posse) + tangencia **Desafio 1** (cortar o ciclo de retificações)
> Análise por agents: `ambiental` (domínio/analista) + `pixel` (UX). Personas: Seu Raimundo (produtor) e Luana (analista).

## Problema

Quando o produtor re-demarca o imóvel, o app hoje **sobrescreve** a geometria anterior sem rastro. Ninguém vê o que mudou. A ideia: mostrar o **perímetro registrado anterior** no mapa; a nova caminhada gera o **novo polígono**; o app calcula o **delta** e, se a mudança for relevante (cresceu/encolheu/tocou camada restritiva), **avisa o produtor na hora** e **gera alerta de "requer visita" para o analista**.

## Taxonomia de mudança

1. **Área acrescida** — `novo − anterior`. Pode ser compra de terra, ocupação indevida ou ruído de GPS.
2. **Área suprimida** — `anterior − novo`. Venda, cessão, ou correção.
3. **Deslocamento de divisa** — área ~igual (|Δ%| < 5%), forma diferente.
4. **Acrescida que toca camada restritiva** (sub-tipo crítico) — o delta intersecta TI/UC/embargo/desmate/queimada/APP.
5. **Suprimida sobre uso problemático** — a área que saiu cobria desmate/queimada (red flag de ocultamento).
6. **Microajuste** — Δ < 2 ha **e** < 5% **e** nenhuma camada tocada → ruído de GPS.

## Cálculo do delta

| Métrica | Como | Confiança |
|---|---|---|
| `delta_ha`, `delta_pct` | área geodésica (geo.ts) | Alta |
| `poligonoAcrescido` | `@turf/difference(novo, anterior)` | Média (GPS ~5–10 m) |
| `poligonoSuprimido` | `@turf/difference(anterior, novo)` | Média |
| sobreposições do acrescido | `analisarSobreposicoes(pontosDoAcrescido, camadas)` (motor existente) | depende da fonte das camadas |

Slivers (< limiar de área) **não** geram alerta sozinhos — são ruído de GPS. Reusa `analisarSobreposicoes` e `appDentroDoImovel` sem reescrever o motor.

## Contrato (novo módulo `src/lib/delta.ts`)

```ts
export type TipoAlteracao = 'acrescida' | 'suprimida' | 'deslocamento' | 'microajuste';
export type SeveridadeDelta = 'critico' | 'alto' | 'medio' | 'baixo';

export interface DeltaRelatorio {
  areaAnterior_ha: number;
  areaNova_ha: number;
  delta_ha: number;            // + acrescido, − suprimido
  delta_pct: number;
  acrescido_ha: number;
  suprimido_ha: number;
  tipoAlteracao: TipoAlteracao;
  sobreposicoesAcrescido: Sobreposicao[]; // camadas tocadas pela área nova
  severidade: SeveridadeDelta;
  requerVisita: boolean;
  recomendacao: string;        // pt-br
  incertezaGPS_m?: number;
  fonteDados: 'online' | 'offline-demo' | 'cache';
  geradoEm: string;
}

export function compararPerimetros(
  anterior: LngLat[], novo: LngLat[], camadas: CamadaRef[],
  fonteDados?: DeltaRelatorio['fonteDados'],
): DeltaRelatorio | null; // null quando não há anterior (< 3 pontos)
```

## Regras de "requer visita" (limiares)

- **Crítico (visita imediata, prazo 5d):** acrescido toca TI/UC (qualquer área) ou embargo; Δ+ > 50 ha; suprimido > 30% cobrindo desmate/queimada.
- **Alto (visita programada, 15d):** acrescido toca desmate ou queimada > 1 ha; acrescido toca APP > 0,5 ha; Δ+ entre 5% e 50% sem restrição; Δ+ > 10 ha junto de `car_vizinho`.
- **Médio (revisão documental):** microajuste de divisa; só `car_vizinho`; suprimido < 10%.
- **Baixo (sem visita, só registro):** Δ < 2 ha e < 5% e nenhuma camada.

## UX (resumo; detalhe nos wireframes do agent pixel)

- **Mapa da Demarcação:** perímetro anterior = **linha branca tracejada** (visível no satélite); área **acrescida** = polígono âmbar, **suprimida** = azul pálido — só renderizados quando o usuário **pausa/conclui** (menos jank). Chip de legenda flutuante. Banner **crítico** quando o acrescido toca TI/UC/embargo (pausa a simulação, exige confirmação para salvar; nunca bloqueia de forma irrecuperável — camada offline pode estar desatualizada).
- **Card de divergência** no painel inferior (abaixo do card de APP): ANTES × AGORA × DIFERENÇA + microcopy do Raimundo ("seu desenho ficou +12,4 ha maior… confirme se comprou ou se foi erro de GPS"). Microajuste → card verde "praticamente igual".
- **RevisaoScreen:** seção "Comparação com registro anterior".
- **ValidacaoScreen:** badge "Alteração detectada — requer visita" (cor por severidade) + botão "Ver detalhes da alteração".
- **PainelScreen:** métrica "Requer visita: N" + seção "Fila de visitas" priorizada (severidade, depois data).
- **AlteracaoDetalheScreen (nova):** mini-mapa antes×depois, "o que mudou" (camadas tocadas), recomendação, ações (analista: Reprovar / Agendar visita / Aprovar; produtor: Voltar / Continuar e enviar).

## Origem do "perímetro anterior" (offline-first)

- Campo novo `Imovel.geometryAnterior?: ImovelGeometry`. No `store.updateImovel`, ao gravar uma `geometry` nova, **fazer snapshot** da atual para `geometryAnterior` antes de sobrescrever.
- MVP guarda **uma versão** (não histórico completo — v2).
- **Demo:** baseline de demonstração próximo à rota SORRISO_SOJA (versão levemente menor/deslocada) para a comparação aparecer offline.
- CAR Geo API como baseline autoritativo = v2 (não bloquear offline).

## Limites (honestidade — exibir junto dos alertas)

- Acréscimo **não prova** compra; supressão **não prova** venda; sobreposição com TI/UC/embargo **não prova** invasão (só INCRA/FUNAI/Justiça).
- Δ menor que ~2× a incerteza do GPS em qualquer borda **não é** mudança real (mostrar `incertezaGPS_m`).
- Camadas offline (`offline-demo`) = rotular "valide com dados oficiais quando houver rede".

## Escopo MVP

Inclui: `geometryAnterior` + snapshot no store; `delta.ts` + testes (100%); render anterior + delta + card na Demarcação; badge na Validação; métrica + fila no Painel; `AlteracaoDetalheScreen` + rota; baseline de demo. Fora (v2): histórico completo de versões; baseline via CAR Geo API; agendamento de visita sincronizado no backend.

## Dependência

`@turf/difference` (mesma família do turf já instalado).
