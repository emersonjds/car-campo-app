// Rotas de demonstração para o Modo Simulação de Caminhada.
//
// As coordenadas estão ancoradas em REGIÕES RURAIS/FLORESTAIS REAIS do Brasil
// (fazendas de soja, áreas de Reserva Legal/floresta amazônica e pivôs de cerrado),
// para que a imagem de satélite mostre lavoura/mata — não cidade.
//
// Os perímetros aqui são REPRESENTATIVOS (ilustrativos) sobre esses locais reais;
// a área/perímetro exibidos são calculados pelo app a partir dos vértices.
//
// Bases de inferência reais (perímetros oficiais de imóveis rurais podem ser
// importados destas fontes públicas):
//   • SICAR / CAR — Cadastro Ambiental Rural ....... https://consultapublica.car.gov.br
//   • INCRA SIGEF — perímetros georreferenciados .... https://sigef.incra.gov.br
//   • MapBiomas — uso e cobertura do solo/floresta .. https://mapbiomas.org
//   • INPE PRODES/DETER — desmatamento/floresta ..... http://terrabrasilis.dpi.inpe.br
//   • IBGE — malhas territoriais ..................... https://www.ibge.gov.br
//   • ICMBio / FUNAI — Unidades de Conservação e Terras Indígenas
//
// WGS84 (lon/lat), como exige o GeoJSON (RFC 7946).
import { interpolate, type LngLat } from '../lib/geo';
import { distanceM } from '../lib/geo';

export interface DemoRoute {
  id: string;
  nome: string;
  /** Bioma/uso predominante visível no satélite. */
  bioma: string;
  /** Fonte de inferência real associada à região. */
  fonte: string;
  /** Vértices do polígono — anel aberto (sem repetir o primeiro ao final). */
  vertices: LngLat[];
}

/**
 * Fazenda de soja — zona rural de Sorriso/MT (a "capital do agronegócio").
 * Lavoura mecanizada; satélite mostra talhões retangulares.
 * Centro aprox.: -12.420°S  -55.950°W
 */
const SORRISO_SOJA: DemoRoute = {
  id: 'sorriso-soja',
  nome: 'Fazenda Soja – Sorriso/MT',
  bioma: 'Lavoura (Amazônia/Cerrado)',
  fonte: 'Região agrícola — base SICAR/INCRA SIGEF',
  vertices: [
    { longitude: -55.9530, latitude: -12.4180 },
    { longitude: -55.9470, latitude: -12.4176 },
    { longitude: -55.9455, latitude: -12.4200 },
    { longitude: -55.9472, latitude: -12.4228 },
    { longitude: -55.9512, latitude: -12.4230 },
    { longitude: -55.9532, latitude: -12.4208 },
  ],
};

/**
 * Área de Reserva Legal / floresta — Feliz Natal/MT (transição amazônica).
 * Satélite mostra mata nativa contígua a áreas abertas.
 * Centro aprox.: -12.300°S  -54.850°W
 */
const FELIZ_NATAL_FLORESTA: DemoRoute = {
  id: 'feliz-natal-floresta',
  nome: 'Reserva Legal – Feliz Natal/MT (floresta)',
  bioma: 'Floresta Amazônica',
  fonte: 'Região florestal — base MapBiomas / INPE PRODES',
  vertices: [
    { longitude: -54.8525, latitude: -12.2985 },
    { longitude: -54.8478, latitude: -12.2982 },
    { longitude: -54.8466, latitude: -12.3002 },
    { longitude: -54.8480, latitude: -12.3024 },
    { longitude: -54.8514, latitude: -12.3025 },
  ],
};

/**
 * Pivôs de cerrado — Oeste da Bahia (São Desidério / Luís Eduardo Magalhães).
 * Satélite mostra agricultura irrigada e remanescentes de cerrado.
 * Centro aprox.: -12.400°S  -45.950°W
 */
const OESTE_BAHIA_CERRADO: DemoRoute = {
  id: 'oeste-bahia-cerrado',
  nome: 'Sítio Cerrado – Oeste da Bahia',
  bioma: 'Cerrado (agricultura irrigada)',
  fonte: 'Região de pivôs — base SICAR/CAR',
  vertices: [
    { longitude: -45.9535, latitude: -12.3978 },
    { longitude: -45.9468, latitude: -12.3974 },
    { longitude: -45.9452, latitude: -12.4000 },
    { longitude: -45.9470, latitude: -12.4032 },
    { longitude: -45.9512, latitude: -12.4035 },
    { longitude: -45.9535, latitude: -12.4010 },
  ],
};

export const DEMO_ROUTES: DemoRoute[] = [
  SORRISO_SOJA,
  FELIZ_NATAL_FLORESTA,
  OESTE_BAHIA_CERRADO,
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
