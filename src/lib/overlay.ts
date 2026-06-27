// Motor de análise de sobreposição ambiental — CAR Campo.
//
// Cruza o perímetro do imóvel (capturado pelo produtor) com camadas oficiais
// de referência (TI, UC, Embargo IBAMA, Desmatamento INPE, APP/hidrografia,
// CAR vizinho) e calcula sobreposições geodésicas em hectares.
//
// Dependências externas:
//   @turf/area              — área geodésica em m² (WGS84 elipsoidal)
//   @turf/intersect         — polígono de interseção entre dois anéis
//   @turf/boolean-intersects — teste rápido de sobreposição antes de computar
//   @turf/helpers           — polygon(), featureCollection()
//
// Coordenadas: WGS84 lon/lat (GeoJSON RFC 7946). NUNCA reprojetar aqui.
// Área do imóvel: reutiliza areaHectares() de geo.ts (fórmula geodésica esférica).

import { polygon, featureCollection } from '@turf/helpers';
import turfArea from '@turf/area';
import { intersect } from '@turf/intersect';
import { booleanIntersects } from '@turf/boolean-intersects';

import { areaHectares, type LngLat } from './geo';

// ---------------------------------------------------------------------------
// Tipos públicos — contrato consumido por refLayers.ts e pelas telas do app
// ---------------------------------------------------------------------------

export type CamadaTipo =
  | 'terra_indigena'
  | 'unidade_conservacao'
  | 'embargo_ibama'
  | 'desmatamento'
  | 'app_hidrografia'
  | 'car_vizinho';

/** Uma camada de referência ambiental (TI, UC, embargo, etc.). */
export interface CamadaRef {
  tipo: CamadaTipo;
  /** Nome legível da feição. Ex.: "TI Marãiwatsédé". */
  nome: string;
  /** Origem dos dados. Ex.: "FUNAI WFS". */
  fonte: string;
  /**
   * Anéis de um polígono simples em [lon, lat] (GeoJSON, WGS84).
   *
   * Convenção (espelha RFC 7946 §3.1.6):
   *   rings[0]   = anel exterior (sentido anti-horário recomendado)
   *   rings[1..] = buracos/holes (sentido horário), se houver
   *
   * Cada anel deve estar fechado (primeiro === último ponto).
   *
   * Para geometrias MultiPolygon com N partes, represente como N entradas
   * CamadaRef separadas (uma por parte), cada uma com seus próprios rings.
   * Isso permite que o motor de interseção trate cada parte individualmente
   * e agregue a área total de sobreposição por nome/tipo na camada acima.
   */
  rings: number[][][]; // rings[i] = [[lon,lat], [lon,lat], ...]
}

export type Severidade = 'critico' | 'alerta' | 'info';

/** Resultado de sobreposição de um imóvel com uma camada específica. */
export interface Sobreposicao {
  tipo: CamadaTipo;
  nome: string;
  fonte: string;
  /** Área geodésica da interseção em hectares. */
  area_ha: number;
  /** Percentual da área do imóvel que se sobrepõe (0–100). */
  percentual: number;
  severidade: Severidade;
  /** Mensagem em pt-br para o produtor rural. */
  mensagem: string;
}

/** Resultado completo da análise ambiental de um imóvel. */
export interface AnaliseAmbiental {
  /** true quando NÃO há sobreposição de severidade 'critico'. */
  ok: boolean;
  sobreposicoes: Sobreposicao[];
  /** Área geodésica do imóvel em hectares. */
  areaImovel_ha: number;
  /** ISO 8601 de quando a análise foi gerada. */
  geradoEm: string;
  /** Origem dos dados de camada. */
  fonteDados: 'online' | 'offline-demo' | 'cache';
  /**
   * Pior accuracy (m) dos vértices do imóvel — indica incerteza posicional
   * que pode afetar o cálculo de sobreposição.
   */
  incertezaPosicional_m?: number;
}

// ---------------------------------------------------------------------------
// Severidade por tipo de camada
// ---------------------------------------------------------------------------

/**
 * Retorna a severidade base de um tipo de camada ambiental.
 *
 * Regras:
 *   - 'critico'  : terra_indigena, unidade_conservacao, embargo_ibama
 *   - 'alerta'   : desmatamento
 *   - 'info'     : app_hidrografia, car_vizinho
 *
 * Atenção: desmatamento e car_vizinho podem ter severidade elevada dinamicamente
 * pela função _severidadeDinamica() com base no percentual de sobreposição.
 */
export function severidadePorTipo(tipo: CamadaTipo): Severidade {
  switch (tipo) {
    case 'terra_indigena':
    case 'unidade_conservacao':
    case 'embargo_ibama':
      return 'critico';
    case 'desmatamento':
      return 'alerta';
    case 'app_hidrografia':
    case 'car_vizinho':
      return 'info';
  }
}

/**
 * Ajuste dinâmico de severidade: desmatamento com > 20% do imóvel → 'critico';
 * car_vizinho com > 50% do imóvel → 'alerta'.
 */
function _severidadeDinamica(tipo: CamadaTipo, percentual: number): Severidade {
  if (tipo === 'desmatamento' && percentual > 20) return 'critico';
  if (tipo === 'car_vizinho' && percentual > 50) return 'alerta';
  return severidadePorTipo(tipo);
}

// ---------------------------------------------------------------------------
// Geração de mensagens em pt-br
// ---------------------------------------------------------------------------

/** Formata número com até 1 casa decimal, sem zeros desnecessários. */
function _fmt(n: number): string {
  return n < 10 ? n.toFixed(1) : Math.round(n).toString();
}

function _mensagem(
  tipo: CamadaTipo,
  nome: string,
  area_ha: number,
  percentual: number,
  severidade: Severidade,
): string {
  const icone = severidade === 'critico' ? '⛔' : severidade === 'alerta' ? '⚠' : 'ℹ';
  const cobertura = `${_fmt(area_ha)} ha (${_fmt(percentual)}%)`;

  switch (tipo) {
    case 'terra_indigena':
      return (
        `${icone} Seu imóvel sobrepõe ${cobertura} da Terra Indígena ${nome}. ` +
        `Sobreposição com TI é impedimento legal ao registro no CAR. Procure a FUNAI ou o órgão ambiental antes de prosseguir.`
      );
    case 'unidade_conservacao':
      return (
        `${icone} Seu imóvel sobrepõe ${cobertura} da Unidade de Conservação ${nome}. ` +
        `Consulte o ICMBio — dependendo da categoria (PI/UI), o uso pode ser restrito ou proibido.`
      );
    case 'embargo_ibama':
      return (
        `${icone} Seu imóvel sobrepõe ${cobertura} de área com embargo ativo do IBAMA (${nome}). ` +
        `Imóveis em área embargada não obtêm crédito rural nem licenciamento. Regularize antes de enviar.`
      );
    case 'desmatamento':
      if (severidade === 'critico') {
        return (
          `${icone} Seu imóvel sobrepõe ${cobertura} de desmatamento detectado pelo INPE (${nome}). ` +
          `Percentual alto — pode inviabilizar o crédito rural. Comprove recomposição ou contate o órgão ambiental.`
        );
      }
      return (
        `${icone} Seu imóvel sobrepõe ${cobertura} de desmatamento detectado pelo INPE (${nome}). ` +
        `Verifique se a área foi desmatada legalmente (autorização de supressão) antes de enviar ao CAR.`
      );
    case 'app_hidrografia':
      return (
        `${icone} Seu imóvel inclui ${cobertura} de Área de Preservação Permanente (APP) de curso d'água ou nascente (${nome}). ` +
        `Confira se há obrigação de recomposição (Código Florestal, art. 61-A).`
      );
    case 'car_vizinho':
      if (severidade === 'alerta') {
        return (
          `${icone} Seu imóvel sobrepõe ${cobertura} de imóvel CAR vizinho (${nome}). ` +
          `Sobreposição expressiva — pode indicar conflito de limites. Confira a matrícula e acione o INCRA se necessário.`
        );
      }
      return (
        `${icone} Seu imóvel sobrepõe ${cobertura} do imóvel CAR vizinho ${nome}. ` +
        `Verifique se a divisa está correta e conforme o georreferenciamento do INCRA.`
      );
  }
}

// ---------------------------------------------------------------------------
// Conversão LngLat[] → anel GeoJSON fechado
// ---------------------------------------------------------------------------

/**
 * Converte LngLat[] para o formato de anel GeoJSON ([lon, lat][]).
 * Garante que o anel está fechado (RFC 7946 §3.1.6).
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
 * Garante que todos os anéis de uma CamadaRef estão fechados.
 * Retorna novo array de anéis, sem mutar o original.
 */
function _ensureClosedRings(rings: number[][][]): number[][][] {
  return rings.map((ring) => {
    const r = [...ring];
    const f = r[0];
    const l = r[r.length - 1];
    if (!f || !l) return r;
    if (f[0] !== l[0] || f[1] !== l[1]) {
      r.push([f[0]!, f[1]!]);
    }
    return r;
  });
}

// ---------------------------------------------------------------------------
// Interseção de polígono via Turf (WGS84, geodésica)
// ---------------------------------------------------------------------------

/**
 * Calcula a área de interseção (m²) entre o anel do imóvel e um polígono de
 * camada representado por todos os seus anéis (exterior + holes).
 *
 * @param imovelRing  Anel exterior do imóvel (fechado).
 * @param camadaRings Anéis da camada: [exteriorRing, ...holes]. Todos fechados.
 *
 * Retorna 0 se não houver sobreposição ou se a geometria da camada for inválida.
 *
 * O polígono da camada é construído como `polygon(camadaRings)` — turf interpreta
 * corretamente o primeiro anel como exterior e os demais como buracos, conforme
 * RFC 7946 §3.1.6. Isso evita falsos positivos quando o imóvel está dentro de um
 * buraco (zona de exclusão) de uma UC ou TI.
 */
function _intersectAreaM2(imovelRing: number[][], camadaRings: number[][][]): number {
  const polyImovel = polygon([imovelRing]);
  const polyCamada = polygon(camadaRings); // [exterior, hole1, hole2, ...]

  // Teste rápido de bbox antes do cálculo poligonal completo
  if (!booleanIntersects(polyImovel, polyCamada)) return 0;

  const fc = featureCollection([polyImovel, polyCamada]);
  const intersecao = intersect(fc);
  if (!intersecao) return 0;

  // turfArea retorna m² geodésico (WGS84 elipsoidal via Karney approach)
  return turfArea(intersecao);
}

// ---------------------------------------------------------------------------
// Função principal de análise
// ---------------------------------------------------------------------------

/**
 * Cruza o perímetro do imóvel com as camadas de referência e retorna a análise
 * ambiental completa.
 *
 * @param points     Vértices do perímetro capturado (WGS84, lon/lat). Mínimo 3.
 * @param camadas    Camadas de referência (TI, UC, embargo, etc.).
 * @param fonteDados Origem dos dados das camadas (default 'online').
 */
export function analisarSobreposicoes(
  points: LngLat[],
  camadas: CamadaRef[],
  fonteDados: AnaliseAmbiental['fonteDados'] = 'online',
): AnaliseAmbiental {
  const geradoEm = new Date().toISOString();

  // Guarda mínimo de vértices — polígono exige ao menos 3 pontos distintos.
  // Retorno imediato evita que _toClosedRing (fora do try/catch) lance e
  // produza um falso negativo silencioso culpando "camada de referência".
  if (points.length < 3) {
    return {
      ok: false,
      sobreposicoes: [],
      areaImovel_ha: 0,
      geradoEm,
      fonteDados,
      incertezaPosicional_m: undefined,
    };
  }

  // Área do imóvel — reutiliza a função geodésica de geo.ts
  const areaImovel_ha = areaHectares(points);

  // Incerteza posicional: max accuracy entre os vértices
  const accuracies = points
    .map((p) => p.accuracy)
    .filter((a): a is number => a != null && a > 0);
  const incertezaPosicional_m = accuracies.length > 0 ? Math.max(...accuracies) : undefined;

  // Anel exterior do imóvel, fechado, em formato GeoJSON
  const imovelRing = _toClosedRing(points);

  const sobreposicoes: Sobreposicao[] = [];

  for (const camada of camadas) {
    if (camada.rings.length === 0) continue;

    // Garante fechamento de todos os anéis (exterior + holes) sem mutar o input
    const ringsFechados = _ensureClosedRings(camada.rings);

    let totalIntersectM2 = 0;
    try {
      // Uma única chamada por CamadaRef: passa exterior + holes juntos.
      // O polígono com buracos é construído dentro de _intersectAreaM2 via
      // polygon(camadaRings), preservando a topologia dos buracos.
      totalIntersectM2 = _intersectAreaM2(imovelRing, ringsFechados);
    } catch {
      // Geometria malformada vinda do servidor — ignorar esta feição.
      // Offline-first: nunca quebrar a UI por dado de camada inválido.
    }

    if (totalIntersectM2 <= 0) continue;

    const area_ha = totalIntersectM2 / 10_000;
    const percentual =
      areaImovel_ha > 0 ? Math.min(100, (area_ha / areaImovel_ha) * 100) : 0;

    const severidade = _severidadeDinamica(camada.tipo, percentual);
    const mensagem = _mensagem(camada.tipo, camada.nome, area_ha, percentual, severidade);

    sobreposicoes.push({
      tipo: camada.tipo,
      nome: camada.nome,
      fonte: camada.fonte,
      area_ha: Number(area_ha.toFixed(4)),
      percentual: Number(percentual.toFixed(2)),
      severidade,
      mensagem,
    });
  }

  // Ordena: crítico primeiro, depois alerta, depois info
  const _ordem: Record<Severidade, number> = { critico: 0, alerta: 1, info: 2 };
  sobreposicoes.sort((a, b) => _ordem[a.severidade] - _ordem[b.severidade]);

  const temCritico = sobreposicoes.some((s) => s.severidade === 'critico');

  return {
    ok: !temCritico,
    sobreposicoes,
    areaImovel_ha: Number(areaImovel_ha.toFixed(4)),
    geradoEm,
    fonteDados,
    incertezaPosicional_m,
  };
}
