// Motor de comparação de perímetros (delta de re-demarcação) — CAR Campo.
//
// Calcula a diferença geométrica entre dois perímetros capturados pelo produtor
// (anterior e novo), classifica o tipo de alteração, analisa sobreposições das
// áreas acrescidas com camadas ambientais e emite um relatório de severidade.
//
// Dependências:
//   @turf/difference — polígono A − B (áreas acrescida e suprimida)
//   @turf/area       — área geodésica m² (WGS84 elipsoidal)
//   @turf/helpers    — polygon(), featureCollection()
//   overlay.ts       — analisarSobreposicoes() (reutiliza interseção existente)
//   geo.ts           — areaHectares()
//
// Coordenadas: WGS84 lon/lat (GeoJSON RFC 7946). Nunca reprojetar aqui.
// Offline-first: nunca lança exceção que quebre a UI.

import { difference } from '@turf/difference';
import turfArea from '@turf/area';
import { polygon as turfPolygon, featureCollection } from '@turf/helpers';

import { areaHectares, type LngLat } from './geo';
import { analisarSobreposicoes, type CamadaRef, type Sobreposicao } from './overlay';

// ---------------------------------------------------------------------------
// Tipos públicos — contrato consumido por types.ts e pelas telas do app
// ---------------------------------------------------------------------------

export type TipoAlteracao = 'acrescida' | 'suprimida' | 'deslocamento' | 'microajuste';
export type SeveridadeDelta = 'critico' | 'alto' | 'medio' | 'baixo';

export interface DeltaRelatorio {
  /** Área geodésica do perímetro anterior (ha). */
  areaAnterior_ha: number;
  /** Área geodésica do novo perímetro (ha). */
  areaNova_ha: number;
  /** Delta de área em hectares: positivo = acréscimo, negativo = supressão. */
  delta_ha: number;
  /** Delta percentual relativo ao anterior. Protegido contra divisão por zero. */
  delta_pct: number;
  /** Área geodésica da região acrescida (novo − anterior), em ha. 0 se sliver. */
  acrescido_ha: number;
  /** Área geodésica da região suprimida (anterior − novo), em ha. 0 se sliver. */
  suprimido_ha: number;
  /** Classificação do tipo de alteração de perímetro. */
  tipoAlteracao: TipoAlteracao;
  /** Sobreposições das áreas acrescidas com camadas ambientais. */
  sobreposicoesAcrescido: Sobreposicao[];
  /** Severidade calculada a partir das regras de visita. */
  severidade: SeveridadeDelta;
  /** true quando a severidade exige visita de campo (critico ou alto). */
  requerVisita: boolean;
  /** Recomendação em pt-br para o produtor ou analista. */
  recomendacao: string;
  /**
   * Pior accuracy (m) dos vértices de anterior + novo.
   * Indica que acréscimos menores que ~2× incertezaGPS_m podem ser ruído posicional.
   */
  incertezaGPS_m?: number;
  /** Origem dos dados de camadas: 'online' | 'offline-demo' | 'cache'. */
  fonteDados: 'online' | 'offline-demo' | 'cache';
  /** ISO 8601 de quando o relatório foi gerado. */
  geradoEm: string;
}

// ---------------------------------------------------------------------------
// Constantes internas
// ---------------------------------------------------------------------------

/** Área mínima para considerar um polígono de diferença como real (ha). Abaixo disso = sliver. */
const SLIVER_HA = 0.02;

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Converte LngLat[] para anel GeoJSON ([lon, lat][]) fechado.
 * Garante fechamento sem mutar o array de entrada (RFC 7946 §3.1.6).
 */
function _toClosedRing(points: LngLat[]): number[][] {
  const ring = points.map((p) => [p.longitude, p.latitude]);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0]!, first[1]!]);
  }
  return ring;
}

/**
 * Converte um anel GeoJSON ([lon, lat][]) para LngLat[].
 * Remove o ponto de fechamento (primeiro === último) para evitar vértice duplicado.
 */
function _ringToLngLat(ring: number[][]): LngLat[] {
  const pts = ring.map(([lon, lat]) => ({
    longitude: lon!,
    latitude: lat!,
  }));
  // Remove o ponto de fechamento se presente (evita duplicar o primeiro vértice)
  const n = pts.length;
  if (
    n >= 2 &&
    pts[0]!.longitude === pts[n - 1]!.longitude &&
    pts[0]!.latitude === pts[n - 1]!.latitude
  ) {
    return pts.slice(0, -1);
  }
  // Defensivo: anéis vindos de @turf são sempre fechados (RFC 7946 §3.1.6),
  // então este ramo (anel aberto) é inalcançável pela API pública.
  /* v8 ignore next */
  return pts;
}

// ---------------------------------------------------------------------------
// Classificação de tipo de alteração
// ---------------------------------------------------------------------------

function _tipoAlteracao(
  delta_ha: number,
  delta_pct: number,
  acrescido_ha: number,
  suprimido_ha: number,
  sobreposicoesAcrescido: Sobreposicao[],
): TipoAlteracao {
  const absDelta_pct = Math.abs(delta_pct);

  // Deslocamento: área similar (|Δ%| < 5%) com forma significativamente diferente.
  // Verificado ANTES do microajuste porque ambos têm |Δ%| < 5%, mas o deslocamento
  // apresenta acrescido E suprimido relevantes (forma mudou, área total não).
  if (absDelta_pct < 5 && acrescido_ha > SLIVER_HA && suprimido_ha > SLIVER_HA) {
    return 'deslocamento';
  }

  // Microajuste: mudança mínima sem sobreposições → provavelmente ruído de GPS.
  // Só alcançado quando acrescido e suprimido são negligenciáveis (≤ SLIVER_HA),
  // pois deslocamentos relevantes já foram capturados acima.
  const absDelta_ha = Math.abs(delta_ha);
  if (absDelta_ha < 2 && absDelta_pct < 5 && sobreposicoesAcrescido.length === 0) {
    return 'microajuste';
  }

  // Acrescida ou suprimida líquida
  return delta_ha >= 0 ? 'acrescida' : 'suprimida';
}

// ---------------------------------------------------------------------------
// Regras de severidade
// ---------------------------------------------------------------------------

function _computeSeveridade(
  delta_ha: number,
  delta_pct: number,
  sobreposicoesAcrescido: Sobreposicao[],
  sobreposicoesSuprimido: Sobreposicao[],
  suprimido_ha: number,
  areaAnterior_ha: number,
  tipoAlteracao: TipoAlteracao,
): SeveridadeDelta {
  // ── CRÍTICO ──────────────────────────────────────────────────────────────
  // 1. Acrescido toca TI, UC ou embargo (qualquer área)
  if (
    sobreposicoesAcrescido.some(
      (s) =>
        s.tipo === 'terra_indigena' ||
        s.tipo === 'unidade_conservacao' ||
        s.tipo === 'embargo_ibama',
    )
  ) {
    return 'critico';
  }

  // 1b. Suprimido (área declarada a mais que a medição oficial não confirma) toca
  //     TI, UC ou embargo — o produtor declarou terra restrita/embargada que a
  //     conferência não reconhece. Red flag de questionamento.
  if (
    sobreposicoesSuprimido.some(
      (s) =>
        s.tipo === 'terra_indigena' ||
        s.tipo === 'unidade_conservacao' ||
        s.tipo === 'embargo_ibama',
    )
  ) {
    return 'critico';
  }

  // 2. Crescimento acima de 50 ha
  if (delta_ha > 50) return 'critico';

  // 3. Suprimido > 30% do anterior, cobrindo desmate/queimada (red flag de ocultamento)
  const suprimidoPct = areaAnterior_ha > 0 ? (suprimido_ha / areaAnterior_ha) * 100 : 0;
  if (
    suprimidoPct > 30 &&
    sobreposicoesSuprimido.some(
      (s) => s.tipo === 'desmatamento' || s.tipo === 'queimada',
    )
  ) {
    return 'critico';
  }

  // ── ALTO ─────────────────────────────────────────────────────────────────
  // 1. Acrescido toca desmate ou queimada com área > 1 ha
  if (
    sobreposicoesAcrescido.some(
      (s) =>
        (s.tipo === 'desmatamento' || s.tipo === 'queimada') && s.area_ha > 1,
    )
  ) {
    return 'alto';
  }

  // 2. Acrescido toca APP > 0,5 ha
  if (
    sobreposicoesAcrescido.some(
      (s) => s.tipo === 'app_hidrografia' && s.area_ha > 0.5,
    )
  ) {
    return 'alto';
  }

  // 3. Delta positivo entre 5% e 50% do anterior (sem camada restritiva já identificada)
  if (delta_ha > 0 && delta_pct >= 5 && delta_pct <= 50) return 'alto';

  // 4. Delta positivo > 10 ha junto de car_vizinho
  if (
    delta_ha > 10 &&
    sobreposicoesAcrescido.some((s) => s.tipo === 'car_vizinho')
  ) {
    return 'alto';
  }

  // ── MÉDIO ─────────────────────────────────────────────────────────────────
  // 1. Deslocamento de divisa (área similar, forma diferente)
  if (tipoAlteracao === 'deslocamento') return 'medio';

  // 2. Somente car_vizinho nas sobreposições (nenhuma camada mais restritiva)
  if (
    sobreposicoesAcrescido.length > 0 &&
    sobreposicoesAcrescido.every((s) => s.tipo === 'car_vizinho')
  ) {
    return 'medio';
  }

  // 3. Redução menor que 10% do anterior (supressão moderada sem camadas)
  if (delta_ha < 0 && Math.abs(delta_pct) < 10) return 'medio';

  // ── BAIXO ─────────────────────────────────────────────────────────────────
  // Microajuste: variação mínima, sem camadas → provável ruído de GPS
  if (tipoAlteracao === 'microajuste') return 'baixo';

  // ── FALLBACK ──────────────────────────────────────────────────────────────
  return 'medio';
}

// ---------------------------------------------------------------------------
// Recomendação em pt-br
// ---------------------------------------------------------------------------

function _recomendacao(
  severidade: SeveridadeDelta,
  tipoAlteracao: TipoAlteracao,
  sobreposicoesAcrescido: Sobreposicao[],
): string {
  if (severidade === 'critico') {
    const temTI = sobreposicoesAcrescido.some(
      (s) => s.tipo === 'terra_indigena' || s.tipo === 'unidade_conservacao',
    );
    const temEmbargo = sobreposicoesAcrescido.some((s) => s.tipo === 'embargo_ibama');
    if (temTI) {
      return (
        'Área acrescida sobrepõe Terra Indígena ou Unidade de Conservação. ' +
        'Envie para análise imediata do órgão ambiental (prazo: 5 dias). ' +
        'Dados de camada offline podem estar desatualizados — valide com dados oficiais quando houver rede.'
      );
    }
    if (temEmbargo) {
      return (
        'Área acrescida sobrepõe embargo ativo do IBAMA. ' +
        'Regularize a situação antes de enviar ao CAR (prazo: 5 dias). ' +
        'Valide com dados oficiais quando houver rede.'
      );
    }
    return (
      'Alteração crítica detectada. Envie para revisão imediata do órgão ambiental (prazo: 5 dias). ' +
      'Não conclua o envio ao CAR sem parecer técnico.'
    );
  }

  if (severidade === 'alto') {
    return (
      'Crescimento ou alteração significativa de perímetro detectada. ' +
      'Agende vistoria de campo para confirmar a alteração (prazo sugerido: 15 dias). ' +
      'Verifique se a mudança reflete uma alteração real de posse ou se foi ruído de GPS.'
    );
  }

  if (severidade === 'medio') {
    if (tipoAlteracao === 'deslocamento') {
      return (
        'Deslocamento de divisa detectado (área similar, forma diferente). ' +
        'Revisão documental recomendada: verifique a matrícula e o georreferenciamento INCRA.'
      );
    }
    return (
      'Alteração moderada detectada. Revisão documental recomendada. ' +
      'Verifique a matrícula e o georreferenciamento INCRA antes de enviar ao CAR.'
    );
  }

  // baixo / microajuste
  return (
    'Diferença mínima detectada — provavelmente ruído de GPS ou ajuste fino de divisa. ' +
    'Nenhuma ação obrigatória. Valide visualmente o contorno no mapa antes de enviar.'
  );
}

// ---------------------------------------------------------------------------
// Extração de pontos de um polígono de diferença (Polygon ou MultiPolygon)
// ---------------------------------------------------------------------------

/**
 * Extrai sobreposições ambientais de um resultado de `@turf/difference`.
 * Para MultiPolygon, cada parte é analisada separadamente e as sobreposições
 * são agregadas (sem deduplicação — a mesma camada pode aparecer por parte).
 */
function _analisarDifference(
  diffResult: ReturnType<typeof difference>,
  camadas: CamadaRef[],
  fonteDados: DeltaRelatorio['fonteDados'],
): Sobreposicao[] {
  if (!diffResult) return [];

  const geom = diffResult.geometry;
  const sobreposicoes: Sobreposicao[] = [];

  const aneis: number[][][] =
    geom.type === 'Polygon'
      ? [geom.coordinates[0]! as number[][]]
      : (geom.coordinates as number[][][][]).map((p) => p[0]! as number[][]);

  for (const anel of aneis) {
    const pts = _ringToLngLat(anel);
    if (pts.length < 3) continue;
    const analise = analisarSobreposicoes(pts, camadas, fonteDados);
    sobreposicoes.push(...analise.sobreposicoes);
  }

  return sobreposicoes;
}

// ---------------------------------------------------------------------------
// Função pública principal
// ---------------------------------------------------------------------------

/**
 * Compara dois perímetros e retorna o relatório de delta de re-demarcação.
 *
 * @param anterior   Vértices do perímetro anterior (WGS84 lon/lat). Mínimo 3.
 * @param novo       Vértices do novo perímetro capturado. Mínimo 3.
 * @param camadas    Camadas de referência ambiental (TI, UC, embargo, etc.).
 * @param fonteDados Origem dos dados de camadas (default 'online').
 *
 * @returns DeltaRelatorio com métricas de área, tipo de alteração e severidade;
 *          ou `null` quando qualquer perímetro tem menos de 3 pontos (sem comparação).
 *
 * Garantias offline-first:
 *   - Nunca lança exceção que quebre a UI.
 *   - Slivers (diferença < 0,02 ha) são ignorados (GPS ruído).
 *   - Divisão por zero protegida (anterior área = 0 → delta_pct = 0).
 */
export function compararPerimetros(
  anterior: LngLat[],
  novo: LngLat[],
  camadas: CamadaRef[],
  fonteDados: DeltaRelatorio['fonteDados'] = 'online',
): DeltaRelatorio | null {
  // Sem geometria válida — não há o que comparar
  if (anterior.length < 3 || novo.length < 3) return null;

  const geradoEm = new Date().toISOString();

  // Áreas geodésicas (fórmula esférica geo.ts)
  const areaAnterior_ha = areaHectares(anterior);
  const areaNova_ha = areaHectares(novo);
  const delta_ha = areaNova_ha - areaAnterior_ha;
  // Proteção contra divisão por zero: anterior de área zero
  const delta_pct = areaAnterior_ha > 0 ? (delta_ha / areaAnterior_ha) * 100 : 0;

  // Incerteza GPS: pior accuracy entre todos os vértices de ambos os anéis
  const allAccuracies = [...anterior, ...novo]
    .map((p) => p.accuracy)
    .filter((a): a is number => a != null && a > 0);
  const incertezaGPS_m = allAccuracies.length > 0 ? Math.max(...allAccuracies) : undefined;

  // Inicializa valores de diferença
  let acrescido_ha = 0;
  let suprimido_ha = 0;
  let sobreposicoesAcrescido: Sobreposicao[] = [];
  let sobreposicoesSuprimido: Sobreposicao[] = [];

  try {
    // Constrói Features<Polygon> com anéis fechados
    const ringAnterior = _toClosedRing(anterior);
    const ringNovo = _toClosedRing(novo);
    const polyAnterior = turfPolygon([ringAnterior]);
    const polyNovo = turfPolygon([ringNovo]);

    // ── Área acrescida: novo − anterior ──────────────────────────────────────
    const diffAcrescido = difference(featureCollection([polyNovo, polyAnterior]));
    if (diffAcrescido) {
      const areaM2 = turfArea(diffAcrescido);
      const haRaw = areaM2 / 10_000;
      if (haRaw >= SLIVER_HA) {
        acrescido_ha = haRaw;
        sobreposicoesAcrescido = _analisarDifference(diffAcrescido, camadas, fonteDados);
      }
      // Se < SLIVER_HA: acrescido_ha permanece 0 (sliver ignorado)
    }

    // ── Área suprimida: anterior − novo ──────────────────────────────────────
    const diffSuprimido = difference(featureCollection([polyAnterior, polyNovo]));
    if (diffSuprimido) {
      const areaM2 = turfArea(diffSuprimido);
      const haRaw = areaM2 / 10_000;
      if (haRaw >= SLIVER_HA) {
        suprimido_ha = haRaw;
        // Análise interna para detectar ocultamento de desmate/queimada (regra critico)
        sobreposicoesSuprimido = _analisarDifference(diffSuprimido, camadas, fonteDados);
      }
    }
  } catch {
    // Geometria degenerada ou auto-interseção — segue com valores padrão.
    // Offline-first: nunca quebrar a UI por dado de geometria inválido.
  }

  const tipoAlteracao = _tipoAlteracao(
    delta_ha,
    delta_pct,
    acrescido_ha,
    suprimido_ha,
    sobreposicoesAcrescido,
  );

  const severidade = _computeSeveridade(
    delta_ha,
    delta_pct,
    sobreposicoesAcrescido,
    sobreposicoesSuprimido,
    suprimido_ha,
    areaAnterior_ha,
    tipoAlteracao,
  );

  const requerVisita = severidade === 'critico' || severidade === 'alto';
  const recomendacao = _recomendacao(severidade, tipoAlteracao, sobreposicoesAcrescido);

  return {
    areaAnterior_ha: Number(areaAnterior_ha.toFixed(4)),
    areaNova_ha: Number(areaNova_ha.toFixed(4)),
    delta_ha: Number(delta_ha.toFixed(4)),
    delta_pct: Number(delta_pct.toFixed(4)),
    acrescido_ha: Number(acrescido_ha.toFixed(4)),
    suprimido_ha: Number(suprimido_ha.toFixed(4)),
    tipoAlteracao,
    sobreposicoesAcrescido,
    severidade,
    requerVisita,
    recomendacao,
    incertezaGPS_m,
    fonteDados,
    geradoEm,
  };
}
