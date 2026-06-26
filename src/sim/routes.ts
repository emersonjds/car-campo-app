// Rotas de demonstração para o Modo Simulação de Caminhada.
// Perímetros plausíveis de imóveis rurais em Mato Grosso (WGS84, lon/lat).
import { distanceM, type LngLat } from '../lib/geo';

/** Interpola linearmente entre dois pontos (lon/lat). */
function interpolate(a: LngLat, b: LngLat, t: number): LngLat {
  return {
    longitude: a.longitude + (b.longitude - a.longitude) * t,
    latitude: a.latitude + (b.latitude - a.latitude) * t,
  };
}

export interface DemoRoute {
  id: string;
  nome: string;
  /** Vértices do polígono — anel aberto (sem repetir o primeiro ao final). */
  vertices: LngLat[];
}

/**
 * Sorriso-MT: área ~5 ha, formato irregular com 5 vértices.
 * Centroide: -12.5491°S  -55.7109°W
 */
const SORRISO_BELA_VISTA: DemoRoute = {
  id: 'sorriso-bela-vista',
  nome: 'Sítio Bela Vista – Sorriso/MT (~5 ha)',
  vertices: [
    { longitude: -55.7125, latitude: -12.5478 },
    { longitude: -55.7101, latitude: -12.5476 },
    { longitude: -55.7094, latitude: -12.5492 },
    { longitude: -55.7103, latitude: -12.5506 },
    { longitude: -55.7125, latitude: -12.5503 },
  ],
};

/**
 * Rondonópolis-MT: área ~12 ha, contorno levemente trapezoidal com 6 vértices.
 * Centroide: -16.4686°S  -54.6405°W
 */
const RONDONOPOLIS_SAO_JOSE: DemoRoute = {
  id: 'rondonopolis-sao-jose',
  nome: 'Fazenda São José – Rondonópolis/MT (~12 ha)',
  vertices: [
    { longitude: -54.6430, latitude: -16.4669 },
    { longitude: -54.6390, latitude: -16.4664 },
    { longitude: -54.6375, latitude: -16.4679 },
    { longitude: -54.6382, latitude: -16.4700 },
    { longitude: -54.6408, latitude: -16.4706 },
    { longitude: -54.6433, latitude: -16.4693 },
  ],
};

/**
 * Primavera do Leste-MT: área ~18 ha, polígono irregular com 7 vértices.
 * Centroide: -15.5589°S  -54.2843°W
 */
const PRIMAVERA_CERRADO: DemoRoute = {
  id: 'primavera-cerrado',
  nome: 'Estância Cerrado – Primavera do Leste/MT (~18 ha)',
  vertices: [
    { longitude: -54.2868, latitude: -15.5572 },
    { longitude: -54.2828, latitude: -15.5566 },
    { longitude: -54.2812, latitude: -15.5581 },
    { longitude: -54.2818, latitude: -15.5601 },
    { longitude: -54.2845, latitude: -15.5612 },
    { longitude: -54.2869, latitude: -15.5605 },
    { longitude: -54.2877, latitude: -15.5589 },
  ],
};

export const DEMO_ROUTES: DemoRoute[] = [
  SORRISO_BELA_VISTA,
  RONDONOPOLIS_SAO_JOSE,
  PRIMAVERA_CERRADO,
];

/**
 * Retorna o caminho de caminhada densificado: pontos intermediários a cada ~stepM
 * metros ao longo de cada aresta, fechando o anel (volta ao primeiro vértice).
 */
export function densifyRoute(vertices: LngLat[], stepM = 8): LngLat[] {
  if (vertices.length < 2) return [...vertices];
  const path: LngLat[] = [];
  const ring = [...vertices, vertices[0]!]; // fecha o anel

  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    const d = distanceM(a, b);
    const numSteps = Math.max(1, Math.floor(d / stepM));
    for (let s = 0; s < numSteps; s++) {
      path.push(interpolate(a, b, s / numSteps));
    }
  }
  // ponto de fechamento explícito
  path.push({ longitude: vertices[0]!.longitude, latitude: vertices[0]!.latitude });
  return path;
}
