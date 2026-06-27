// Testes unitários de src/lib/app.ts — derivação de APP e cálculo de sobreposição.
//
// Regras testadas (Código Florestal, Lei 12.651/2012):
//   • Art. 4°, IV — nascente: raio 50 m → área ≈ π · 50² m² ≈ 0,785 ha
//   • Art. 4°, I, a — margem de rio < 10 m: faixa 30 m
//   • Art. 4°, I, b–e — faixas por largura do rio (via convenção de nome)
//
// Convenção de nome (src/lib/app.ts):
//   nome.toLowerCase().includes('nascente') → nascente (raio 50 m)
//   caso contrário                          → margem de rio (faixa padrão 30 m)
//
// Cobertura de linhas alvo: 100% de src/lib/app.ts (gate 95%)

import { describe, it, expect, vi } from 'vitest';
import { derivarAPP, appDentroDoImovel } from './app';
import { DEMO_HIDROGRAFIA } from './refLayers.demo';
import type { CamadaRef } from './overlay';
import type { LngLat } from './geo';

// vi.mock é içado (hoisted) pelo Vitest antes de qualquer import de runtime.
// Usamos a factory com importActual para que todos os outros testes usem a
// implementação real de @turf/buffer; apenas o teste do ramo MultiPolygon
// usa mockReturnValueOnce para retornar um Feature<MultiPolygon> sintético.
vi.mock('@turf/buffer', async (importActual) => {
  const real = await importActual<typeof import('@turf/buffer')>();
  return { default: vi.fn(real.default) };
});

// Import do buffer mockado (após o vi.mock acima)
import buffer from '@turf/buffer';

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

/** Quadrado de ~200 m × 200 m centrado em lon/lat (≈ 4 ha em lat -12°). */
function _imovelQuadrado(lon: number, lat: number, halfDeg = 0.0009): LngLat[] {
  return [
    { longitude: lon - halfDeg, latitude: lat - halfDeg },
    { longitude: lon + halfDeg, latitude: lat - halfDeg },
    { longitude: lon + halfDeg, latitude: lat + halfDeg },
    { longitude: lon - halfDeg, latitude: lat + halfDeg },
  ];
}

/**
 * CamadaRef de hidrografia: nascente (polígono mínimo ~11 m × 11 m).
 * Por convenção, nome contém 'nascente' → derivarAPP aplica raio 50 m.
 */
function _hidro_nascente(lon: number, lat: number): CamadaRef {
  const d = 0.00005; // ≈ 5,6 m de halfSide
  return {
    tipo: 'hidrografia',
    nome: 'Nascente – olho d\'água (teste)',
    fonte: 'fixture',
    rings: [[
      [lon - d, lat + d],
      [lon + d, lat + d],
      [lon + d, lat - d],
      [lon - d, lat - d],
      [lon - d, lat + d], // fechado
    ]],
  };
}

/**
 * CamadaRef de hidrografia: faixa E-W fina (~11 m de altura) simulando córrego.
 * Nome NÃO contém 'nascente' → derivarAPP aplica faixa 30 m.
 */
function _hidro_rio(
  lonMin: number, lonMax: number, lat: number, nome = 'Córrego sem nome (teste)',
): CamadaRef {
  const h = 0.0001; // ≈ 11 m de altura
  return {
    tipo: 'hidrografia',
    nome,
    fonte: 'fixture',
    rings: [[
      [lonMin, lat + h],
      [lonMax, lat + h],
      [lonMax, lat],
      [lonMin, lat],
      [lonMin, lat + h], // fechado
    ]],
  };
}

/** CamadaRef de APP (já derivada) — quadrado simples. */
function _app_camada(lon: number, lat: number, halfDeg: number): CamadaRef {
  return {
    tipo: 'app_hidrografia',
    nome: 'APP Margem de rio – faixa 30 m (estimativa de campo) [demo]',
    fonte: 'fixture',
    rings: [[
      [lon - halfDeg, lat - halfDeg],
      [lon + halfDeg, lat - halfDeg],
      [lon + halfDeg, lat + halfDeg],
      [lon - halfDeg, lat + halfDeg],
      [lon - halfDeg, lat - halfDeg],
    ]],
  };
}

// ---------------------------------------------------------------------------
// derivarAPP
// ---------------------------------------------------------------------------

describe('derivarAPP — nascente (raio 50 m)', () => {
  it('produz 1 polígono de APP com área ≈ π·50² m² ≈ 0,785 ha (±15%)', () => {
    // Nascente centrada em (-55.95, -12.42) — dentro de uma fazenda hipotética
    const hidro = [_hidro_nascente(-55.95, -12.42)];
    const app = derivarAPP(hidro);

    expect(app).toHaveLength(1);
    const camada = app[0]!;
    expect(camada.tipo).toBe('app_hidrografia');
    expect(camada.nome).toContain('Nascente');
    expect(camada.nome).toContain('50 m');

    // Área esperada: π × 50² ≈ 7 854 m² ≈ 0,785 ha (turf usa buffer elipsoidal)
    // Tolerância de 15% para variações da discretização em polígonos
    const areaEsperadaM2 = Math.PI * 50 * 50;
    const areaEsperadaHa = areaEsperadaM2 / 10_000; // ≈ 0,785

    // Verificamos a área usando ringAreaM2 sobre o anel externo do resultado
    // (o turf buffer retorna um polígono; a área geodésica deve ser ≈ πr²)
    // Como não temos acesso direto à área do turf, verificamos indiretamente
    // via o número de vértices (buffer de ponto produz anel aproximando círculo)
    expect(camada.rings.length).toBeGreaterThan(0);
    // O anel exterior deve ter bastante vértices (padrão turf: 64 segmentos)
    expect(camada.rings[0]!.length).toBeGreaterThan(10);

    // Verificação de área via appDentroDoImovel: imóvel maior que a APP.
    // Um imóvel de half=0.001° (~222 m lado) contém a nascente inteiramente.
    const imovelGrande = _imovelQuadrado(-55.95, -12.42, 0.001);
    const resultado = appDentroDoImovel(imovelGrande, app);
    // APP totalmente dentro do imóvel grande → area_ha ≈ 0,785 (±15%)
    expect(resultado.app_ha).toBeGreaterThan(areaEsperadaHa * 0.85);
    expect(resultado.app_ha).toBeLessThan(areaEsperadaHa * 1.15);
  });

  it('nome da feição de APP indica "Nascente" para tipo nascente', () => {
    const app = derivarAPP([_hidro_nascente(-55.95, -12.42)]);
    expect(app[0]!.nome.toLowerCase()).toContain('nascente');
  });

  it('fonte indica buffer @turf/buffer', () => {
    const app = derivarAPP([_hidro_nascente(-55.95, -12.42)]);
    expect(app[0]!.fonte).toContain('@turf/buffer');
  });
});

describe('derivarAPP — margem de rio (faixa 30 m padrão)', () => {
  it('produz APP para um córrego (sem nascente no nome)', () => {
    const hidro = [_hidro_rio(-55.96, -55.94, -12.42)];
    const app = derivarAPP(hidro);

    expect(app).toHaveLength(1);
    expect(app[0]!.tipo).toBe('app_hidrografia');
    expect(app[0]!.nome).toContain('Margem de rio');
    expect(app[0]!.nome).toContain('30 m');
  });

  it('faixa de 50 m quando nome contém "largura_20m"', () => {
    const hidro: CamadaRef[] = [{
      tipo: 'hidrografia',
      nome: 'Rio Xyzinho – largura_20m (teste)',
      fonte: 'fixture',
      rings: [[
        [-55.96, -12.421],
        [-55.94, -12.421],
        [-55.94, -12.420],
        [-55.96, -12.420],
        [-55.96, -12.421],
      ]],
    }];
    const app = derivarAPP(hidro);
    expect(app[0]!.nome).toContain('50 m');
  });

  it('faixa de 100 m quando nome contém "largura_100m"', () => {
    const hidro: CamadaRef[] = [{
      tipo: 'hidrografia',
      nome: 'Rio Grande – largura_100m (teste)',
      fonte: 'fixture',
      rings: [[
        [-55.96, -12.421],
        [-55.94, -12.421],
        [-55.94, -12.420],
        [-55.96, -12.420],
        [-55.96, -12.421],
      ]],
    }];
    const app = derivarAPP(hidro);
    expect(app[0]!.nome).toContain('100 m');
  });

  it('faixa de 200 m quando nome contém "largura_300m"', () => {
    const hidro: CamadaRef[] = [{
      tipo: 'hidrografia',
      nome: 'Rio Caudaloso – largura_300m (teste)',
      fonte: 'fixture',
      rings: [[
        [-55.96, -12.421],
        [-55.94, -12.421],
        [-55.94, -12.420],
        [-55.96, -12.420],
        [-55.96, -12.421],
      ]],
    }];
    const app = derivarAPP(hidro);
    expect(app[0]!.nome).toContain('200 m');
  });

  it('faixa de 500 m quando nome contém "largura_700m"', () => {
    const hidro: CamadaRef[] = [{
      tipo: 'hidrografia',
      nome: 'Rio Amazonas – largura_700m (teste)',
      fonte: 'fixture',
      rings: [[
        [-55.96, -12.421],
        [-55.94, -12.421],
        [-55.94, -12.420],
        [-55.96, -12.420],
        [-55.96, -12.421],
      ]],
    }];
    const app = derivarAPP(hidro);
    expect(app[0]!.nome).toContain('500 m');
  });

  it('largura < 10 m explícita retorna faixa de 30 m', () => {
    const hidro: CamadaRef[] = [{
      tipo: 'hidrografia',
      nome: 'Córrego – largura_5m (teste)',
      fonte: 'fixture',
      rings: [[
        [-55.96, -12.421],
        [-55.94, -12.421],
        [-55.94, -12.420],
        [-55.96, -12.420],
        [-55.96, -12.421],
      ]],
    }];
    const app = derivarAPP(hidro);
    expect(app[0]!.nome).toContain('30 m');
  });
});

describe('derivarAPP — edge cases (geometria inválida / vazia)', () => {
  it('lista vazia → resultado vazio', () => {
    expect(derivarAPP([])).toHaveLength(0);
  });

  it('feição com rings vazio → ignorada', () => {
    const hidro: CamadaRef[] = [{ tipo: 'hidrografia', nome: 'X', fonte: 'f', rings: [] }];
    expect(derivarAPP(hidro)).toHaveLength(0);
  });

  it('feição com anel vazio (rings[0]=[]) → ignorada', () => {
    const hidro: CamadaRef[] = [{ tipo: 'hidrografia', nome: 'X', fonte: 'f', rings: [[]] }];
    expect(derivarAPP(hidro)).toHaveLength(0);
  });

  it('feição com coordenadas inválidas (NaN) → ignorada silenciosamente', () => {
    const hidro: CamadaRef[] = [{
      tipo: 'hidrografia',
      nome: 'inválida',
      fonte: 'f',
      rings: [[[NaN, NaN], [NaN, NaN], [NaN, NaN], [NaN, NaN]]],
    }];
    // Não deve lançar exceção
    expect(() => derivarAPP(hidro)).not.toThrow();
    // Pode retornar 0 ou 1 camada dependendo de como turf trata NaN
    // O importante é não quebrar
  });

  it('múltiplas feições → múltiplos APP', () => {
    const hidro = [
      _hidro_nascente(-55.95, -12.42),
      _hidro_rio(-55.96, -55.94, -12.43),
    ];
    const app = derivarAPP(hidro);
    expect(app.length).toBe(2);
    expect(app[0]!.nome).toContain('Nascente');
    expect(app[1]!.nome).toContain('Margem');
  });

  it('quando @turf/buffer retorna MultiPolygon → múltiplas CamadaRef (uma por parte)', () => {
    // Simula um buffer que retorna MultiPolygon (ex.: geometria muito ampla
    // que turf divide em partes). Cobre o ramo geom.type === 'MultiPolygon'.
    const multiPolyFeature = {
      type: 'Feature' as const,
      geometry: {
        type: 'MultiPolygon' as const,
        coordinates: [
          [[[-55.96, -12.43], [-55.94, -12.43], [-55.94, -12.41], [-55.96, -12.41], [-55.96, -12.43]]],
          [[[-55.93, -12.43], [-55.91, -12.43], [-55.91, -12.41], [-55.93, -12.41], [-55.93, -12.43]]],
        ],
      },
      properties: {},
    };

    // Configura o mock para retornar MultiPolygon apenas nesta chamada.
    // Para as demais chamadas (outros testes), o vi.fn wraps a implementação real.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(buffer).mockReturnValueOnce(multiPolyFeature as any);

    const hidro = [_hidro_rio(-55.96, -55.94, -12.42)];
    const app = derivarAPP(hidro);
    // 2 partes do MultiPolygon → 2 entradas CamadaRef
    expect(app.length).toBe(2);
    expect(app[0]!.tipo).toBe('app_hidrografia');
    expect(app[1]!.tipo).toBe('app_hidrografia');
  });
});

// ---------------------------------------------------------------------------
// appDentroDoImovel
// ---------------------------------------------------------------------------

describe('appDentroDoImovel — APP totalmente fora do imóvel (0 ha)', () => {
  it('APP longe do imóvel → app_ha=0, porcentagem=0, feicoes=[]', () => {
    const imovel = _imovelQuadrado(-55.95, -12.42, 0.005);
    // APP no Rio de Janeiro, longe da fazenda
    const appFora = _app_camada(-43.17, -22.90, 0.001);
    const resultado = appDentroDoImovel(imovel, [appFora]);
    expect(resultado.app_ha).toBe(0);
    expect(resultado.porcentagem).toBe(0);
    expect(resultado.feicoes).toHaveLength(0);
  });
});

describe('appDentroDoImovel — interseção parcial', () => {
  it('APP cruza parcialmente o imóvel → 0 < app_ha < total_app', () => {
    // Imóvel: quadrado ~1° × 1° centrado em (-55.95, -12.42)
    const imovel = _imovelQuadrado(-55.95, -12.42, 0.005);
    // APP: quadrado que cruza o canto nordeste do imóvel
    const appParcial: CamadaRef = {
      tipo: 'app_hidrografia',
      nome: 'APP Margem de rio – faixa 30 m (estimativa de campo) [parcial]',
      fonte: 'fixture',
      rings: [[
        [-55.948, -12.419], // dentro do imóvel
        [-55.940, -12.419], // fora (a leste)
        [-55.940, -12.425], // fora (a leste)
        [-55.948, -12.425], // dentro do imóvel
        [-55.948, -12.419],
      ]],
    };
    const resultado = appDentroDoImovel(imovel, [appParcial]);
    expect(resultado.app_ha).toBeGreaterThan(0);
    // Não é 100% do imóvel (só cruza uma parte)
    expect(resultado.porcentagem).toBeGreaterThan(0);
    expect(resultado.porcentagem).toBeLessThan(100);
    expect(resultado.feicoes).toHaveLength(1);
    expect(resultado.feicoes[0]!.tipo).toBe('margem_rio');
  });

  it('APP de nascente cruza imóvel → feicoes[0].tipo = nascente', () => {
    const imovel = _imovelQuadrado(-55.95, -12.42, 0.005);
    const appNascente: CamadaRef = {
      tipo: 'app_hidrografia',
      nome: 'APP Nascente – raio 50 m (estimativa de campo) [dentro]',
      fonte: 'fixture',
      rings: [[
        [-55.952, -12.421],
        [-55.948, -12.421],
        [-55.948, -12.418],
        [-55.952, -12.418],
        [-55.952, -12.421],
      ]],
    };
    const resultado = appDentroDoImovel(imovel, [appNascente]);
    expect(resultado.app_ha).toBeGreaterThan(0);
    expect(resultado.feicoes[0]!.tipo).toBe('nascente');
  });

  it('mistura nascente + margem rio → 2 feicoes', () => {
    const imovel = _imovelQuadrado(-55.95, -12.42, 0.01);
    const appMargem = _app_camada(-55.955, -12.42, 0.003);
    const appNascente: CamadaRef = {
      tipo: 'app_hidrografia',
      nome: 'APP Nascente – raio 50 m (estimativa de campo) [misto]',
      fonte: 'fixture',
      rings: [[
        [-55.948, -12.418],
        [-55.945, -12.418],
        [-55.945, -12.415],
        [-55.948, -12.415],
        [-55.948, -12.418],
      ]],
    };
    const resultado = appDentroDoImovel(imovel, [appMargem, appNascente]);
    expect(resultado.feicoes.length).toBeGreaterThanOrEqual(1);
    const tipos = resultado.feicoes.map((f) => f.tipo);
    expect(tipos).toContain('margem_rio');
    expect(tipos).toContain('nascente');
  });
});

describe('appDentroDoImovel — imóvel com menos de 3 pontos', () => {
  it('0 pontos → retorno seguro (0 ha, 0%, feicoes=[])', () => {
    const resultado = appDentroDoImovel([], []);
    expect(resultado.app_ha).toBe(0);
    expect(resultado.porcentagem).toBe(0);
    expect(resultado.feicoes).toHaveLength(0);
  });

  it('2 pontos → retorno seguro (0 ha, 0%, feicoes=[])', () => {
    const pts: LngLat[] = [
      { longitude: -55.95, latitude: -12.42 },
      { longitude: -55.94, latitude: -12.42 },
    ];
    const resultado = appDentroDoImovel(pts, []);
    expect(resultado.app_ha).toBe(0);
    expect(resultado.porcentagem).toBe(0);
    expect(resultado.feicoes).toHaveLength(0);
  });
});

describe('appDentroDoImovel — proteção contra divisão por zero', () => {
  it('imóvel com área ≈ 0 (colinear) → porcentagem = 0, sem NaN/Infinity', () => {
    // Três pontos colineares → área geodésica ≈ 0
    const colinear: LngLat[] = [
      { longitude: -55.95, latitude: -12.42 },
      { longitude: -55.94, latitude: -12.42 },
      { longitude: -55.93, latitude: -12.42 },
    ];
    // APP que cobre a mesma região
    const app = _app_camada(-55.94, -12.42, 0.02);
    const resultado = appDentroDoImovel(colinear, [app]);
    expect(Number.isFinite(resultado.porcentagem)).toBe(true);
    expect(Number.isNaN(resultado.porcentagem)).toBe(false);
    expect(resultado.porcentagem).toBe(0);
  });
});

describe('appDentroDoImovel — camadas não-APP são ignoradas', () => {
  it('camadas com tipo diferente de app_hidrografia não entram no cálculo', () => {
    const imovel = _imovelQuadrado(-55.95, -12.42, 0.005);
    const hidrografia: CamadaRef = {
      tipo: 'hidrografia', // tipo bruto, não APP derivada
      nome: 'Córrego bruto (não APP)',
      fonte: 'fixture',
      rings: [[
        [-55.952, -12.421],
        [-55.948, -12.421],
        [-55.948, -12.418],
        [-55.952, -12.418],
        [-55.952, -12.421],
      ]],
    };
    const resultado = appDentroDoImovel(imovel, [hidrografia]);
    // Camada hidrografia é filtrada; APP = 0
    expect(resultado.app_ha).toBe(0);
    expect(resultado.feicoes).toHaveLength(0);
  });
});

describe('appDentroDoImovel — porcentagem não excede 100', () => {
  it('APP muito maior que o imóvel → porcentagem ≤ 100', () => {
    const imovel = _imovelQuadrado(-55.95, -12.42, 0.001);
    // APP enorme que envolve todo o imóvel
    const appEnorme = _app_camada(-55.95, -12.42, 0.1);
    const resultado = appDentroDoImovel(imovel, [appEnorme]);
    expect(resultado.porcentagem).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Integração: derivarAPP + appDentroDoImovel com fixtures SORRISO_SOJA
// ---------------------------------------------------------------------------

describe('integração com fixtures DEMO_HIDROGRAFIA (SORRISO_SOJA)', () => {
  it('appDentroDoImovel retorna APP > 0 quando usa fixtures SORRISO_SOJA', () => {
    const SORRISO_SOJA: LngLat[] = [
      { longitude: -55.9530, latitude: -12.4180 },
      { longitude: -55.9470, latitude: -12.4176 },
      { longitude: -55.9455, latitude: -12.4200 },
      { longitude: -55.9472, latitude: -12.4228 },
      { longitude: -55.9512, latitude: -12.4230 },
      { longitude: -55.9532, latitude: -12.4208 },
    ];

    const appCamadas = derivarAPP(DEMO_HIDROGRAFIA);
    expect(appCamadas.length).toBeGreaterThan(0);

    const resultado = appDentroDoImovel(SORRISO_SOJA, appCamadas);
    // Deve haver APP > 0 dentro do imóvel (rio + nascente)
    expect(resultado.app_ha).toBeGreaterThan(0);
    expect(resultado.porcentagem).toBeGreaterThan(0);
    // Deve haver pelo menos 2 feições (rio + nascente)
    expect(resultado.feicoes.length).toBeGreaterThanOrEqual(2);
    // Deve conter os dois tipos
    const tipos = resultado.feicoes.map((f) => f.tipo);
    expect(tipos).toContain('margem_rio');
    expect(tipos).toContain('nascente');
  });
});

// ---------------------------------------------------------------------------
// appDentroDoImovel — união evita dupla contagem (correção I-3)
// ---------------------------------------------------------------------------

describe('appDentroDoImovel — APP sobrepostas não duplicam área', () => {
  it('dois buffers de APP que se sobrepõem → app_ha < soma das áreas individuais', () => {
    const imovel = _imovelQuadrado(-55.95, -12.42, 0.01); // grande: contém ambos
    const appA = _app_camada(-55.9500, -12.4200, 0.002);
    const appB = _app_camada(-55.9510, -12.4200, 0.002); // sobrepõe appA (desloc. 0,001°)

    const soma =
      appDentroDoImovel(imovel, [appA]).app_ha + appDentroDoImovel(imovel, [appB]).app_ha;
    const combinado = appDentroDoImovel(imovel, [appA, appB]).app_ha;

    // Sem união o combinado seria igual à soma; com união é estritamente menor.
    expect(combinado).toBeGreaterThan(0);
    expect(combinado).toBeLessThan(soma);
    // E não menor que a maior parcela individual (a união cobre pelo menos uma delas).
    expect(combinado).toBeGreaterThanOrEqual(appDentroDoImovel(imovel, [appA]).app_ha - 1e-6);
  });

  it('dois buffers de APP disjuntos → união MultiPolygon, app_ha ≈ soma', () => {
    const imovel = _imovelQuadrado(-55.95, -12.42, 0.02); // bem grande: contém ambos
    const appA = _app_camada(-55.945, -12.415, 0.001);
    const appC = _app_camada(-55.955, -12.425, 0.001); // longe de appA → disjunto

    const soma =
      appDentroDoImovel(imovel, [appA]).app_ha + appDentroDoImovel(imovel, [appC]).app_ha;
    const combinado = appDentroDoImovel(imovel, [appA, appC]).app_ha;

    // Disjuntos: a união (MultiPolygon) tem área = soma (sem sobreposição a descontar).
    expect(combinado).toBeGreaterThan(0);
    expect(Math.abs(combinado - soma)).toBeLessThan(soma * 0.02);
  });
});

// ---------------------------------------------------------------------------
// derivarAPP — tipo_feicao tem prioridade sobre o nome (correção I-2)
// ---------------------------------------------------------------------------

describe('derivarAPP — tipo_feicao prioriza sobre heurística de nome', () => {
  it('tipo_feicao="nascente" força APP de nascente mesmo sem "nascente" no nome', () => {
    const hidro: CamadaRef[] = [{
      tipo: 'hidrografia',
      tipo_feicao: 'nascente',
      nome: 'Córrego da Cabeceira (teste)', // nome NÃO contém "nascente"
      fonte: 'fixture',
      rings: [[
        [-55.9500500, -12.4208500],
        [-55.9499500, -12.4208500],
        [-55.9499500, -12.4207500],
        [-55.9500500, -12.4207500],
        [-55.9500500, -12.4208500],
      ]],
    }];
    const app = derivarAPP(hidro);
    expect(app[0]!.nome).toContain('Nascente'); // tratado como nascente (raio 50 m)
    expect(app[0]!.tipo_feicao).toBe('nascente');
  });

  it('tipo_feicao="curso_dagua" força margem mesmo com "nascente" no nome', () => {
    const hidro: CamadaRef[] = [{
      tipo: 'hidrografia',
      tipo_feicao: 'curso_dagua',
      nome: 'Rio da Nascente do Sul (teste)', // nome CONTÉM "nascente"
      fonte: 'fixture',
      rings: [[
        [-55.96, -12.421],
        [-55.94, -12.421],
        [-55.94, -12.420],
        [-55.96, -12.420],
        [-55.96, -12.421],
      ]],
    }];
    const app = derivarAPP(hidro);
    expect(app[0]!.nome).toContain('Margem de rio'); // tratado como curso d'água
    expect(app[0]!.tipo_feicao).toBe('curso_dagua');
  });
});
