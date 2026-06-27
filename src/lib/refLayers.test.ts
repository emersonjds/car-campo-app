// Testes do fetch WFS por bbox e parsing (refLayers.ts).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { bboxOf, fetchCamadasPorBBox, type BBox } from './refLayers';

// Região das fixtures demo (Sorriso/MT)
const BBOX_DEMO: BBox = [-55.96, -12.43, -55.94, -12.41];
// Região longe de qualquer fixture demo → demoSemWfs vazio
const BBOX_LONGE: BBox = [10, 10, 10.01, 10.01];

function res(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

function fc(features: unknown[]) {
  return { type: 'FeatureCollection', features };
}

const POLY = (lon = -55.95, lat = -12.42) => ({
  type: 'Polygon',
  coordinates: [[
    [lon - 0.01, lat - 0.01],
    [lon + 0.01, lat - 0.01],
    [lon + 0.01, lat + 0.01],
    [lon - 0.01, lat + 0.01],
    [lon - 0.01, lat - 0.01],
  ]],
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('bboxOf', () => {
  it('calcula min/max de lon/lat', () => {
    const bbox = bboxOf([
      { longitude: -55.95, latitude: -12.42 },
      { longitude: -55.90, latitude: -12.40 },
      { longitude: -55.99, latitude: -12.45 },
    ]);
    expect(bbox).toEqual([-55.99, -12.45, -55.90, -12.40]);
  });

  it('ponto único → bbox degenerado', () => {
    const bbox = bboxOf([{ longitude: 1, latitude: 2 }]);
    expect(bbox).toEqual([1, 2, 1, 2]);
  });
});

describe('fetchCamadasPorBBox — todos online', () => {
  it('todos os WFS respondem → fonte = online', async () => {
    const fetchMock = vi.fn(() => res(fc([{
      type: 'Feature',
      properties: { no_ti: 'TI Teste' },
      geometry: POLY(),
    }])));
    vi.stubGlobal('fetch', fetchMock);

    const r = await fetchCamadasPorBBox(BBOX_LONGE);
    expect(r.fonte).toBe('online');
    // 6 tipos com WFS (terra_indigena, unidade_conservacao, embargo_ibama,
    // desmatamento, queimada, hidrografia), cada um devolve 1 feature
    expect(r.camadas.length).toBe(6);
    expect(r.camadas.every((c) => c.nome === 'TI Teste')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('parseia Polygon, MultiPolygon com holes e ignora geometrias inválidas', async () => {
    const richFC = fc([
      // Polygon com hole
      {
        type: 'Feature',
        properties: { nome_uc: 'UC com buraco' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[-55.96, -12.43], [-55.94, -12.43], [-55.94, -12.41], [-55.96, -12.41], [-55.96, -12.43]],
            [[-55.955, -12.425], [-55.945, -12.425], [-55.945, -12.415], [-55.955, -12.415], [-55.955, -12.425]],
          ],
        },
      },
      // MultiPolygon: 2 partes, a 2ª com hole
      {
        type: 'Feature',
        properties: { nome: 'Multi' },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [[[-55.96, -12.43], [-55.95, -12.43], [-55.95, -12.42], [-55.96, -12.43]]],
            [
              [[-55.94, -12.41], [-55.93, -12.41], [-55.93, -12.40], [-55.94, -12.41]],
              [[-55.938, -12.408], [-55.932, -12.408], [-55.932, -12.402], [-55.938, -12.408]],
            ],
          ],
        },
      },
      // Point — ignorado
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } },
      // geometry null — ignorado
      { type: 'Feature', properties: {}, geometry: null },
      // feature não-objeto — ignorado
      null,
      // Polygon de coordenadas vazias — ignorado
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } },
      // geometry sem coordinates → ignorado (guard _partsFromGeometry)
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon' } },
      // nomes via campos alternativos (exercita a cadeia de fallback ??)
      { type: 'Feature', properties: { name: 'PorName' }, geometry: POLY() },
      { type: 'Feature', properties: { nm_area: 'PorNmArea' }, geometry: POLY() },
      { type: 'Feature', properties: { num_ai: 'PorNumAi' }, geometry: POLY() },
      // sem nome → 'Sem nome'
      { type: 'Feature', properties: {}, geometry: POLY() },
    ]);

    const fetchMock = vi.fn(() => res(richFC));
    vi.stubGlobal('fetch', fetchMock);

    const r = await fetchCamadasPorBBox(BBOX_LONGE, ['terra_indigena']);
    expect(r.fonte).toBe('online');
    // 1 (polygon) + 2 (multipolygon partes) + name + nm_area + num_ai + sem nome = 7
    expect(r.camadas.length).toBe(7);
    expect(r.camadas.some((c) => c.nome === 'Sem nome')).toBe(true);
    expect(r.camadas.some((c) => c.nome === 'PorName')).toBe(true);
    expect(r.camadas.some((c) => c.nome === 'PorNmArea')).toBe(true);
    expect(r.camadas.some((c) => c.nome === 'PorNumAi')).toBe(true);
    // o Polygon com hole tem 2 anéis
    const comHole = r.camadas.find((c) => c.nome === 'UC com buraco');
    expect(comHole!.rings.length).toBe(2);
  });

  it('FeatureCollection vazia → camadas vazias mas online', async () => {
    vi.stubGlobal('fetch', vi.fn(() => res(fc([]))));
    const r = await fetchCamadasPorBBox(BBOX_LONGE, ['terra_indigena']);
    expect(r.fonte).toBe('online');
    expect(r.camadas).toHaveLength(0);
  });

  it('resposta não-FeatureCollection → parse vazio', async () => {
    vi.stubGlobal('fetch', vi.fn(() => res({ type: 'Outro', foo: 1 })));
    const r = await fetchCamadasPorBBox(BBOX_LONGE, ['terra_indigena']);
    expect(r.camadas).toHaveLength(0);
    expect(r.fonte).toBe('online');
  });

  it('resposta JSON nula → parse vazio', async () => {
    vi.stubGlobal('fetch', vi.fn(() => res(null)));
    const r = await fetchCamadasPorBBox(BBOX_LONGE, ['terra_indigena']);
    expect(r.camadas).toHaveLength(0);
  });
});

describe('fetchCamadasPorBBox — _buildWfsUrl por versão', () => {
  it('usa count/typeNames para 2.0.0 e maxFeatures/typeName para 1.1.0', async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn((url: string) => {
      urls.push(url);
      return res(fc([]));
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchCamadasPorBBox(BBOX_LONGE, ['terra_indigena', 'embargo_ibama']);

    const tiUrl = urls.find((u) => u.includes('ti_sirgas'))!;
    const embUrl = urls.find((u) => u.includes('vw_brasil_adm_embargo'))!;

    // FUNAI TI → WFS 2.0.0
    expect(tiUrl).toContain('version=2.0.0');
    expect(tiUrl).toContain('typeNames=');
    expect(tiUrl).toContain('count=200');

    // IBAMA embargo → WFS 1.1.0
    expect(embUrl).toContain('version=1.1.0');
    expect(embUrl).toContain('maxFeatures=500');
    // typeName (sem 's') presente; CRS:84 no bbox
    expect(embUrl).toContain('CRS%3A84');
  });
});

describe('fetchCamadasPorBBox — fallback offline', () => {
  it('um WFS rejeita → fallback por-tipo e fonte offline-demo', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('vw_brasil_adm_embargo')) {
        return Promise.reject(new Error('network down'));
      }
      return res(fc([]));
    });
    vi.stubGlobal('fetch', fetchMock);

    // bbox sobre as fixtures demo → fallback do embargo retorna a fixture
    const r = await fetchCamadasPorBBox(BBOX_DEMO, ['terra_indigena', 'embargo_ibama']);
    expect(r.fonte).toBe('offline-demo');
    expect(r.camadas.some((c) => c.tipo === 'embargo_ibama')).toBe(true);
  });

  it('HTTP não-OK conta como falha → offline-demo', async () => {
    vi.stubGlobal('fetch', vi.fn(() => res({}, false, 503)));
    const r = await fetchCamadasPorBBox(BBOX_DEMO, ['terra_indigena']);
    expect(r.fonte).toBe('offline-demo');
  });

  it('timeout (AbortController) dispara fallback offline', async () => {
    vi.useFakeTimers();
    // fetch que só rejeita quando o signal aborta
    const fetchMock = vi.fn((_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchCamadasPorBBox(BBOX_DEMO, ['embargo_ibama']);
    await vi.advanceTimersByTimeAsync(6_000);
    const r = await promise;
    expect(r.fonte).toBe('offline-demo');
    expect(r.camadas.some((c) => c.tipo === 'embargo_ibama')).toBe(true);
  });
});

describe('fetchCamadasPorBBox — tipos sem config WFS', () => {
  it('apenas tipos demo → offline-demo sem chamar fetch', async () => {
    const fetchMock = vi.fn(() => res(fc([])));
    vi.stubGlobal('fetch', fetchMock);

    const r = await fetchCamadasPorBBox(BBOX_DEMO, ['app_hidrografia', 'car_vizinho']);
    expect(r.fonte).toBe('offline-demo');
    expect(fetchMock).not.toHaveBeenCalled();
    // a fixture de APP cai dentro do bbox demo
    expect(r.camadas.some((c) => c.tipo === 'app_hidrografia')).toBe(true);
  });

  it('tipos demo não afetam fonte quando WFS online', async () => {
    vi.stubGlobal('fetch', vi.fn(() => res(fc([]))));
    // mistura: 1 tipo WFS (online) + tipos demo
    const r = await fetchCamadasPorBBox(BBOX_DEMO, ['terra_indigena', 'app_hidrografia']);
    expect(r.fonte).toBe('online');
    // demo de app_hidrografia presente
    expect(r.camadas.some((c) => c.tipo === 'app_hidrografia')).toBe(true);
  });
});
