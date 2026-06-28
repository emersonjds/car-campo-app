// Camada de alteração de perímetro para as telas do ANALISTA.
//
// Une o snapshot de re-demarcação (Imovel.geometryAnterior) ao motor de delta
// (compararPerimetros) e expõe uma análise pronta para a triagem:
//   • baseline 'real'  → o imóvel foi de fato re-demarcado (tem geometryAnterior).
//   • baseline 'demo'  → sem histórico, mas o imóvel está na área de Sorriso/MT;
//     usa DEMO_PERIMETRO_ANTERIOR só para a demonstração offline ficar visível.
//   • null             → sem geometria válida ou sem baseline aplicável.
//
// Decisão sugerida (aceite) derivada da severidade do delta — o analista decide.
import { distanceM, type LngLat } from './geo';
import { compararPerimetros, type DeltaRelatorio, type SeveridadeDelta } from './delta';
import type { CamadaRef } from './overlay';
import { DEMO_PERIMETRO_ANTERIOR } from './refLayers.demo';
import type { Imovel } from '../types';

export type BaselineOrigem = 'real' | 'demo';

export interface AlteracaoImovel {
  relatorio: DeltaRelatorio;
  /** Origem do perímetro anterior usado na comparação. */
  baseline: BaselineOrigem;
  /** Pontos do perímetro anterior (declarado/registrado) usados na comparação. */
  anteriorPoints: LngLat[];
}

/** Raio (m) dentro do qual o baseline de demo é considerado aplicável. */
const DEMO_BASELINE_RAIO_M = 5000;

/** Centroide simples (média dos vértices) — suficiente para teste de proximidade. */
function centroide(points: LngLat[]): LngLat {
  const n = points.length || 1;
  let lon = 0;
  let lat = 0;
  for (const p of points) {
    lon += p.longitude;
    lat += p.latitude;
  }
  return { longitude: lon / n, latitude: lat / n };
}

const DEMO_BASELINE_CENTROIDE = centroide(DEMO_PERIMETRO_ANTERIOR);

/** Está a geometria `novo` dentro do raio do baseline de demo (área de Sorriso)? */
function pertoDoBaselineDemo(novo: LngLat[]): boolean {
  if (novo.length < 3) return false;
  return distanceM(centroide(novo), DEMO_BASELINE_CENTROIDE) <= DEMO_BASELINE_RAIO_M;
}

/**
 * Resolve o perímetro anterior (baseline) para a comparação ao vivo no fluxo do
 * PRODUTOR (re-demarcação). O baseline é a geometria REGISTRADA do imóvel; se ela
 * não existir e a nova caminhada estiver na área de demo, usa DEMO_PERIMETRO_ANTERIOR.
 *
 * @param registrado Pontos da geometria atual já salva do imóvel (imovel.geometry).
 * @param novo       Pontos da caminhada em andamento.
 * @returns baseline + origem, ou null quando não há comparação aplicável.
 */
export function resolverBaselineProdutor(
  registrado: LngLat[] | undefined,
  novo: LngLat[],
): { points: LngLat[]; origem: BaselineOrigem } | null {
  if (registrado && registrado.length >= 3) {
    return { points: registrado, origem: 'real' };
  }
  if (pertoDoBaselineDemo(novo)) {
    return { points: DEMO_PERIMETRO_ANTERIOR, origem: 'demo' };
  }
  return null;
}

/**
 * Calcula a alteração de perímetro de um imóvel para a triagem do analista.
 *
 * @param imovel   Imóvel a analisar.
 * @param camadas  Camadas de referência (TI/UC/embargo/desmate/queimada/APP/CAR vizinho).
 * @param fonte    Origem dos dados de camada.
 * @returns AlteracaoImovel ou null quando não há comparação possível.
 */
export function analisarAlteracaoImovel(
  imovel: Imovel,
  camadas: CamadaRef[],
  fonte: DeltaRelatorio['fonteDados'] = 'offline-demo',
): AlteracaoImovel | null {
  const novo = imovel.geometry?.points ?? [];
  if (novo.length < 3) return null;

  // 1) Caminho real: o imóvel foi re-demarcado (snapshot do store).
  const anteriorReal = imovel.geometryAnterior?.points;
  if (anteriorReal && anteriorReal.length >= 3) {
    const relatorio = compararPerimetros(anteriorReal, novo, camadas, fonte);
    return relatorio ? { relatorio, baseline: 'real', anteriorPoints: anteriorReal } : null;
  }

  // 2) Demo: sem histórico, mas próximo da área de Sorriso → usa baseline de demo.
  if (pertoDoBaselineDemo(novo)) {
    const relatorio = compararPerimetros(DEMO_PERIMETRO_ANTERIOR, novo, camadas, fonte);
    return relatorio
      ? { relatorio, baseline: 'demo', anteriorPoints: DEMO_PERIMETRO_ANTERIOR }
      : null;
  }

  // 3) Sem baseline aplicável.
  return null;
}

// ---------------------------------------------------------------------------
// Decisão / aceite sugerido a partir da severidade
// ---------------------------------------------------------------------------

export interface DecisaoSugerida {
  titulo: string;
  detalhe: string;
  /** Tom de UI: verde (ok) → âmbar (aviso) → vermelho (alerta). */
  tone: 'ok' | 'aviso' | 'alerta';
  /** Prazo sugerido para a visita, quando aplicável. */
  prazo: string | null;
}

const DECISAO_POR_SEVERIDADE: Record<SeveridadeDelta, DecisaoSugerida> = {
  critico: {
    titulo: 'Requer visita imediata',
    detalhe: 'Divergência sobre camada restritiva (TI/UC/embargo) ou alteração muito alta. Não aprovar sem vistoria.',
    tone: 'alerta',
    prazo: '5 dias',
  },
  alto: {
    titulo: 'Requer visita programada',
    detalhe: 'Alteração significativa de perímetro e/ou toque em desmate/queimada/APP. Agendar verificação em campo.',
    tone: 'aviso',
    prazo: '15 dias',
  },
  medio: {
    titulo: 'Revisão documental',
    detalhe: 'Ajuste de divisa ou supressão moderada. Conferir matrícula e georreferenciamento antes de aprovar.',
    tone: 'aviso',
    prazo: null,
  },
  baixo: {
    titulo: 'Sem visita — apenas registro',
    detalhe: 'Diferença mínima, provável ruído de GPS. Nenhuma ação obrigatória.',
    tone: 'ok',
    prazo: null,
  },
};

export function decisaoSugerida(severidade: SeveridadeDelta): DecisaoSugerida {
  return DECISAO_POR_SEVERIDADE[severidade];
}

/** Peso de ordenação por severidade (maior = mais urgente) — para a fila de visitas. */
export function pesoSeveridade(severidade: SeveridadeDelta): number {
  switch (severidade) {
    case 'critico': return 3;
    case 'alto':    return 2;
    case 'medio':   return 1;
    case 'baixo':   return 0;
  }
}
