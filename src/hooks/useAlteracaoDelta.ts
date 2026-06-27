// Hook de delta de re-demarcação para o fluxo do PRODUTOR (Demarcação ao vivo).
//
// Compara o perímetro registrado (anterior) com a caminhada em andamento (novo),
// com debounce de 800 ms sobre a geometria simplificada (RDP) para não recalcular
// a cada vértice. Além do relatório (compararPerimetros), devolve os ANÉIS das
// áreas acrescida/suprimida para render no mapa (âmbar/azul).
//
// Offline-first: nunca lança; em qualquer erro de geometria retorna nulo/vazio.
import { useEffect, useRef, useState } from 'react';
import { difference } from '@turf/difference';
import { polygon as turfPolygon, featureCollection } from '@turf/helpers';

import { simplifyRDP, type LngLat } from '../lib/geo';
import { compararPerimetros, type DeltaRelatorio } from '../lib/delta';
import type { CamadaRef } from '../lib/overlay';

export interface AlteracaoDeltaResultado {
  relatorio: DeltaRelatorio | null;
  /** Anéis da área acrescida (novo − anterior) em LngLat, para Polygon. */
  acrescidoRings: LngLat[][];
  /** Anéis da área suprimida (anterior − novo) em LngLat, para Polygon. */
  suprimidoRings: LngLat[][];
}

const VAZIO: AlteracaoDeltaResultado = { relatorio: null, acrescidoRings: [], suprimidoRings: [] };
const DEBOUNCE_MS = 800;

/** Fecha o anel (repete o primeiro ponto) no formato [lon,lat] exigido pelo turf. */
function toClosedRing(points: LngLat[]): number[][] {
  const ring = points.map((p) => [p.longitude, p.latitude]);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0]!, first[1]!]);
  return ring;
}

/** Anéis exteriores de (a − b) como LngLat[][] (trata Polygon e MultiPolygon). */
function ringsDiferenca(a: LngLat[], b: LngLat[]): LngLat[][] {
  if (a.length < 3 || b.length < 3) return [];
  try {
    const diff = difference(
      featureCollection([turfPolygon([toClosedRing(a)]), turfPolygon([toClosedRing(b)])]),
    );
    if (!diff) return [];
    const geom = diff.geometry;
    const aneis: number[][][] =
      geom.type === 'Polygon'
        ? [geom.coordinates[0]! as number[][]]
        : (geom.coordinates as number[][][][]).map((p) => p[0]! as number[][]);
    return aneis.map((anel) =>
      anel.map((c) => ({ longitude: c[0] ?? 0, latitude: c[1] ?? 0 })),
    );
  } catch {
    return [];
  }
}

/**
 * @param anterior Perímetro registrado (baseline). >= 3 pontos.
 * @param novo     Caminhada em andamento. >= 3 pontos.
 * @param camadas  Camadas ambientais de referência.
 * @param fonte    Origem dos dados de camada.
 * @param enabled  Quando false, zera o resultado (ex.: modo sem comparação).
 */
export function useAlteracaoDelta(
  anterior: LngLat[],
  novo: LngLat[],
  camadas: CamadaRef[],
  fonte: DeltaRelatorio['fonteDados'] = 'offline-demo',
  enabled = true,
): AlteracaoDeltaResultado {
  const [resultado, setResultado] = useState<AlteracaoDeltaResultado>(VAZIO);
  // Refs para o timer ler sempre os valores atuais sem reanexar o efeito.
  const anteriorRef = useRef(anterior);
  const novoRef = useRef(novo);
  anteriorRef.current = anterior;
  novoRef.current = novo;

  useEffect(() => {
    if (!enabled || anterior.length < 3 || novo.length < 3) {
      setResultado(VAZIO);
      return;
    }
    const timer = setTimeout(() => {
      const a = anteriorRef.current;
      const nRaw = novoRef.current;
      const simplificado = simplifyRDP(nRaw, 3);
      const n = simplificado.length >= 3 ? simplificado : nRaw;
      const relatorio = compararPerimetros(a, n, camadas, fonte);
      setResultado({
        relatorio,
        acrescidoRings: ringsDiferenca(n, a),
        suprimidoRings: ringsDiferenca(a, n),
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // Recalcula quando o nº de vértices muda (proxy barato de "geometria mudou").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, anterior.length, novo.length, fonte]);

  return resultado;
}
