// Fontes das camadas de referência ambiental e fetch WFS por bounding box.
//
// Arquitetura offline-first (mesma filosofia de api.ts):
//   1. Tenta buscar no WFS oficial com timeout curto (6 s).
//   2. Para cada tipo com config WFS cujo request falhar, faz fallback
//      individual para as fixtures demo daquele tipo.
//   3. Se QUALQUER WFS falhar, reporta fonteDados = 'offline-demo' — nunca
//      reportar 'online' quando há dado de camada crítica ausente (falso
//      negativo regulatório).
//   4. Nunca lança exceção que quebre a UI.
//
// Sistemas de referência:
//   - Todos os endpoints são consultados com srsName=CRS:84 (lon/lat WGS84
//     explícito, independente da versão WFS). CRS:84 é idêntico a EPSG:4326
//     com ordem de eixo lon/lat garantida, evitando a ambiguidade do WFS 1.1.0
//     que inverte a ordem para lat/lon com EPSG:4326 estrito.
//   - SIRGAS 2000 (EPSG:4674) e WGS84 são coincidentes a nível sub-métrico;
//     usamos as coordenadas recebidas diretamente como WGS84 lon/lat (RFC 7946).
//
// Fontes documentadas:
//   • FUNAI  — https://geoserver.funai.gov.br/geoserver/wfs
//              Camada: funai:ti_sirgas (limites homologados e declarados de TIs)
//              CRS servidor: SIRGAS 2000 (EPSG:4674). Atualização mensal.
//   • ICMBio — https://geoservicos.inde.gov.br/geoserver/ICMBio/ows
//              Camada: ICMBio:BCIM_Unidade_Conservacao_A_2021 (UCs federais)
//              CRS servidor: SIRGAS 2000 (EPSG:4674).
//   • IBAMA  — https://siscom.ibama.gov.br/geoserver/wfs
//              Camada: publica:vw_brasil_adm_embargo_a (embargos ativos SISCOM)
//              CRS servidor: WGS84 (EPSG:4326). Atualização diária.
//   • INPE TerraBrasilis — https://terrabrasilis.dpi.inpe.br/geoserver/ows
//              Camada: prodes-amazon-nb:yearly_deforestation_biome (Amazônia)
//              CRS servidor: SIRGAS 2000 (EPSG:4674).
//   • INPE Programa Queimadas — https://terrabrasilis.dpi.inpe.br/geoserver/ows
//              Produto AQ1km — Área Queimada mensal 1km (cicatriz de fogo).
//              Camada: queimadas:aq1km_mensal (workspace queimadas do GeoServer
//              TerraBrasilis; ver lista de camadas em
//              https://terrabrasilis.dpi.inpe.br/queimadas/aq1km/).
//              CRS servidor: SIRGAS 2000 (EPSG:4674); consultado via CRS:84.

import type { CamadaRef, CamadaTipo } from './overlay';
import { DEMO_CAMADAS } from './refLayers.demo';

// ---------------------------------------------------------------------------
// Tipos de bbox e configurações por camada
// ---------------------------------------------------------------------------

/** Bounding box WGS84: [minLon, minLat, maxLon, maxLat]. */
export type BBox = [number, number, number, number];

/** Configuração de acesso WFS para uma camada de referência. */
interface WfsConfig {
  tipo: CamadaTipo;
  /** URL base do GeoServer WFS. */
  baseUrl: string;
  /** Nome da camada (typeName) no GeoServer. */
  typeName: string;
  /** Versão WFS ('1.1.0' ou '2.0.0'). */
  version: '1.1.0' | '2.0.0';
  /** Rótulo legível para o campo `fonte` dos resultados. */
  fonteLabel: string;
  /**
   * Limite de features por requisição (evitar respostas gigantes).
   * WFS 1.1.0 → parâmetro `maxFeatures`; WFS 2.0.0 → parâmetro `count`.
   */
  maxFeatures: number;
}

/**
 * Registro de configurações WFS por tipo de camada.
 * Tipos sem config WFS (app_hidrografia, car_vizinho) são sempre servidos
 * por demo (sem WFS nacional consolidado disponível publicamente).
 */
const WFS_CONFIGS: WfsConfig[] = [
  // ---- Terras Indígenas — FUNAI ----
  // Ref: https://www.gov.br/funai/pt-br/atuacao/terras-indigenas/geoprocessamento-e-mapas/geoserver-funai
  {
    tipo: 'terra_indigena',
    baseUrl: 'https://geoserver.funai.gov.br/geoserver/wfs',
    typeName: 'funai:ti_sirgas',
    version: '2.0.0',
    fonteLabel: 'FUNAI WFS (geoserver.funai.gov.br)',
    maxFeatures: 200,
  },

  // ---- Unidades de Conservação — ICMBio / INDE ----
  // Ref: https://www.gov.br/icmbio/pt-br/assuntos/dados_geoespaciais
  {
    tipo: 'unidade_conservacao',
    baseUrl: 'https://geoservicos.inde.gov.br/geoserver/ICMBio/ows',
    typeName: 'ICMBio:BCIM_Unidade_Conservacao_A_2021',
    version: '2.0.0',
    fonteLabel: 'ICMBio / INDE WFS (geoservicos.inde.gov.br)',
    maxFeatures: 200,
  },

  // ---- Embargos IBAMA — SISCOM ----
  // Ref: https://siscom.ibama.gov.br (Sistema de Monitoramento e Controle)
  // Camada pública de embargos ativos; atualização diária.
  {
    tipo: 'embargo_ibama',
    baseUrl: 'https://siscom.ibama.gov.br/geoserver/wfs',
    typeName: 'publica:vw_brasil_adm_embargo_a',
    version: '1.1.0',
    fonteLabel: 'IBAMA SISCOM WFS (siscom.ibama.gov.br)',
    maxFeatures: 500,
  },

  // ---- Desmatamento — INPE TerraBrasilis (PRODES Amazônia) ----
  // Ref: https://terrabrasilis.dpi.inpe.br
  // Desmatamento anual consolidado (PRODES). Amazônia como padrão;
  // adicione prodes-cerrado-nb:yearly_deforestation para o Cerrado.
  {
    tipo: 'desmatamento',
    baseUrl: 'https://terrabrasilis.dpi.inpe.br/geoserver/ows',
    typeName: 'prodes-amazon-nb:yearly_deforestation_biome',
    version: '2.0.0',
    fonteLabel: 'INPE TerraBrasilis PRODES (terrabrasilis.dpi.inpe.br)',
    maxFeatures: 300,
  },

  // ---- Área queimada (cicatriz de fogo) — INPE Programa Queimadas ----
  // Ref: https://terrabrasilis.dpi.inpe.br/queimadas/aq1km/
  // Produto AQ1km — Área Queimada mensal (1km), polígonos de cicatriz de fogo
  // derivados de sensoriamento remoto. Servido pelo GeoServer TerraBrasilis,
  // workspace `queimadas`. Atualização mensal.
  {
    tipo: 'queimada',
    baseUrl: 'https://terrabrasilis.dpi.inpe.br/geoserver/ows',
    typeName: 'queimadas:aq1km_mensal',
    version: '2.0.0',
    fonteLabel: 'INPE Programa Queimadas AQ1km (terrabrasilis.dpi.inpe.br)',
    maxFeatures: 300,
  },
];

// ---------------------------------------------------------------------------
// Bbox helpers
// ---------------------------------------------------------------------------

/**
 * Calcula o bounding box WGS84 de um conjunto de pontos.
 * @returns [minLon, minLat, maxLon, maxLat]
 */
export function bboxOf(points: { longitude: number; latitude: number }[]): BBox {
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const p of points) {
    if (p.longitude < minLon) minLon = p.longitude;
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.longitude > maxLon) maxLon = p.longitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
  }
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Expande um bbox por `bufferDeg` graus em todas as direções.
 * 0.01° ≈ ~1 km de buffer — suficiente para capturar camadas adjacentes.
 */
function _expandBBox(bbox: BBox, bufferDeg = 0.01): BBox {
  return [
    bbox[0] - bufferDeg,
    bbox[1] - bufferDeg,
    bbox[2] + bufferDeg,
    bbox[3] + bufferDeg,
  ];
}

// ---------------------------------------------------------------------------
// Parse de GeoJSON WFS response → CamadaRef[]
// ---------------------------------------------------------------------------

/**
 * Extrai lista de "partes poligonais" de uma geometry GeoJSON.
 *
 * Cada parte retornada é um array de anéis no formato de CamadaRef.rings:
 *   parte[0] = anel exterior, parte[1..] = holes (buracos).
 *
 * Suporte:
 *   Polygon      → uma parte = [exteriorRing, ...holes]
 *   MultiPolygon → N partes, uma por polígono simples = [ext, ...holes]
 *
 * Buracos são preservados para evitar falso positivo em zonas de exclusão
 * (ex.: imóvel dentro de um buraco de uma UC de proteção integral).
 *
 * Retorna array vazio para geometrias não-poligonais ou inválidas.
 */
function _partsFromGeometry(geometry: {
  type: string;
  coordinates: unknown;
}): number[][][][] {
  if (!geometry || !geometry.coordinates) return [];

  if (geometry.type === 'Polygon') {
    // coordinates: [exteriorRing, hole1, hole2, ...]
    const coords = geometry.coordinates as number[][][];
    // Uma única parte com exterior + todos os holes
    return coords.length > 0 ? [coords] : [];
  }

  if (geometry.type === 'MultiPolygon') {
    // coordinates: [[exteriorRing, ...holes], [exteriorRing, ...holes], ...]
    // Cada entrada é uma parte independente com seus próprios rings.
    const coords = geometry.coordinates as number[][][][];
    return coords.filter((part) => part.length > 0);
  }

  return [];
}

/**
 * Parseia a resposta GeoJSON de um WFS GetFeature e converte para CamadaRef[].
 *
 * MultiPolygon com N partes gera N entradas CamadaRef (mesmos nome/tipo/fonte),
 * conforme a convenção de CamadaRef.rings (uma entrada = um polígono simples).
 *
 * Features sem geometry ou com geometry não-poligonal são ignoradas.
 */
function _parseWFSResponse(
  json: unknown,
  tipo: CamadaTipo,
  fonte: string,
): CamadaRef[] {
  if (!json || typeof json !== 'object') return [];
  const fc = json as Record<string, unknown>;

  if (fc['type'] !== 'FeatureCollection' || !Array.isArray(fc['features'])) {
    return [];
  }

  const result: CamadaRef[] = [];

  for (const feat of fc['features'] as unknown[]) {
    if (!feat || typeof feat !== 'object') continue;
    const f = feat as Record<string, unknown>;

    const geometry = f['geometry'] as { type: string; coordinates: unknown } | null;
    if (!geometry) continue;

    const parts = _partsFromGeometry(geometry);
    if (parts.length === 0) continue;

    const props = (f['properties'] ?? {}) as Record<string, unknown>;

    // Extrai nome: tenta campos comuns nos datasets brasileiros
    const nome =
      (props['no_ti'] as string) ??
      (props['nome_uc'] as string) ??
      (props['nome'] as string) ??
      (props['name'] as string) ??
      (props['nm_area'] as string) ??
      (props['num_ai'] as string) ?? // número do auto de infração (embargo)
      'Sem nome';

    // Cria uma CamadaRef por parte (exterior + holes de um polígono simples)
    for (const rings of parts) {
      result.push({ tipo, nome, fonte, rings });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fetch WFS com timeout e fallback offline
// ---------------------------------------------------------------------------

const WFS_TIMEOUT_MS = 6_000; // 6 s — não bloqueia a UI

/**
 * Monta a URL de GetFeature WFS parametrizada com bbox.
 *
 * Parâmetros de CRS:
 *   srsName = CRS:84 — ordem lon/lat garantida em qualquer versão WFS.
 *   Evita a inversão lat/lon que EPSG:4326 sofre no WFS 1.1.0 (I2).
 *
 * Parâmetro de limite de features:
 *   WFS 2.0.0 → `count` (padrão OGC 2.0.0)
 *   WFS 1.1.0 → `maxFeatures` (padrão OGC 1.1.0)
 */
function _buildWfsUrl(config: WfsConfig, bbox: BBox): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  // CRS:84 = lon/lat WGS84 explícito; insere o CRS no sufixo do bbox
  const srsName = 'CRS:84';
  const bboxStr = `${minLon},${minLat},${maxLon},${maxLat},${srsName}`;

  const params = new URLSearchParams({
    service: 'WFS',
    version: config.version,
    request: 'GetFeature',
    outputFormat: 'application/json',
    srsName,
    bbox: bboxStr,
  });

  // Parâmetro de limite correto por versão WFS
  if (config.version === '2.0.0') {
    params.set('typeNames', config.typeName);
    params.set('count', String(config.maxFeatures));
  } else {
    params.set('typeName', config.typeName);
    params.set('maxFeatures', String(config.maxFeatures));
  }

  return `${config.baseUrl}?${params.toString()}`;
}

/**
 * Faz uma requisição WFS com timeout. Lança erro em caso de falha de rede,
 * timeout (AbortError) ou status HTTP não-OK.
 */
async function _fetchWfs(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WFS_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`WFS HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export interface FetchCamadasResult {
  camadas: CamadaRef[];
  fonte: 'online' | 'offline-demo';
}

/**
 * Busca camadas de referência ambiental para o bbox do imóvel.
 *
 * Fluxo por tipo (B1 — fallback individual por tipo):
 *   1. Para cada tipo com config WFS, dispara fetch em paralelo.
 *   2. Tipo cujo WFS respondeu com sucesso → camadas reais adicionadas.
 *   3. Tipo cujo WFS FALHOU (timeout, rede, HTTP erro) → fallback demo para
 *      ESSE tipo específico (evita falso negativo: ex. embargo IBAMA offline
 *      não pode sumir silenciosamente do resultado).
 *   4. Se QUALQUER tipo com WFS falhou → fonte = 'offline-demo', mesmo que
 *      outros tipos tenham respondido online. Nunca reportar 'online' parcial.
 *   5. Tipos sem config WFS (app_hidrografia, car_vizinho) → sempre demo;
 *      não afetam o campo `fonte`.
 *
 * @param bbox   Bounding box WGS84 ([minLon, minLat, maxLon, maxLat]).
 * @param tipos  Tipos de camada a buscar (padrão: todos disponíveis).
 */
export async function fetchCamadasPorBBox(
  bbox: BBox,
  tipos: CamadaTipo[] = [
    'terra_indigena',
    'unidade_conservacao',
    'embargo_ibama',
    'desmatamento',
    'queimada',
    'app_hidrografia',
    'car_vizinho',
  ],
): Promise<FetchCamadasResult> {
  // Buffer de ~1 km ao redor do imóvel para capturar camadas adjacentes
  const bboxComBuffer = _expandBBox(bbox, 0.01);

  // Separa: tipos com config WFS vs tipos que sempre vão para demo
  const configsRelevantes = WFS_CONFIGS.filter((c) => tipos.includes(c.tipo));
  const tiposComWfs = new Set(configsRelevantes.map((c) => c.tipo));
  const tiposSemWfs = tipos.filter((t) => !tiposComWfs.has(t));

  // Tipos sem config WFS → sempre servidos por demo (app_hidrografia, car_vizinho)
  const demoSemWfs = _filtrarDemoPorBbox(bboxComBuffer).filter((c) =>
    tiposSemWfs.includes(c.tipo),
  );

  if (configsRelevantes.length === 0) {
    // Nenhum tipo pedido tem config WFS → tudo vem de demo
    return { camadas: demoSemWfs, fonte: 'offline-demo' };
  }

  // Fetch em paralelo para todos os tipos com WFS
  const resultados = await Promise.allSettled(
    configsRelevantes.map(async (config) => {
      const url = _buildWfsUrl(config, bboxComBuffer);
      const json = await _fetchWfs(url);
      return _parseWFSResponse(json, config.tipo, config.fonteLabel);
    }),
  );

  const camadas: CamadaRef[] = [...demoSemWfs];
  let algumWfsFalhou = false;

  for (let i = 0; i < resultados.length; i++) {
    const r = resultados[i]!;
    const config = configsRelevantes[i]!;

    if (r.status === 'fulfilled') {
      camadas.push(...r.value);
    } else {
      // WFS deste tipo falhou → fallback individual para demo deste tipo.
      // Garante que camadas críticas (TI, embargo) nunca somem do resultado.
      algumWfsFalhou = true;
      const demoDoTipo = _filtrarDemoPorBbox(bboxComBuffer).filter(
        (c) => c.tipo === config.tipo,
      );
      camadas.push(...demoDoTipo);
    }
  }

  // Qualquer falha WFS → 'offline-demo' (mais seguro regulatoriamente).
  // Nunca reportar 'online' quando parte dos dados veio de fixture demo.
  const fonte: FetchCamadasResult['fonte'] = algumWfsFalhou ? 'offline-demo' : 'online';

  return { camadas, fonte };
}

// ---------------------------------------------------------------------------
// Utilitário de filtro de demo por bbox
// ---------------------------------------------------------------------------

/**
 * Retorna as camadas demo cujo primeiro anel contém ao menos um ponto
 * dentro do bbox fornecido.
 * Filtro simples mas suficiente para as fixtures de demo offline.
 */
function _filtrarDemoPorBbox(bbox: BBox): CamadaRef[] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return DEMO_CAMADAS.filter((c) => {
    const ring = c.rings[0];
    if (!ring || ring.length === 0) return false;
    return ring.some(
      ([lon, lat]) =>
        lon !== undefined &&
        lat !== undefined &&
        lon >= minLon &&
        lon <= maxLon &&
        lat >= minLat &&
        lat <= maxLat,
    );
  });
}
