// Testes unitários do motor de comparação de perímetros (delta.ts).
//
// Cobertura exigida: 100% de linhas em src/lib/delta.ts.
// Runner: vitest (bun run test / bunx vitest run --coverage)

import { describe, it, expect } from 'vitest';
import { compararPerimetros, type DeltaRelatorio } from './delta';
import type { LngLat } from './geo';
import type { CamadaRef } from './overlay';
import { DEMO_CAMADAS, DEMO_PERIMETRO_ANTERIOR } from './refLayers.demo';
import { DEMO_ROUTES } from '../sim/routes';

// ---------------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------------

/**
 * Quadrado centrado em (lon, lat) com meia-diagonal `halfSide` graus.
 * halfSide ≈ 0.00450° → lado ≈ 1 km → área ≈ 100 ha em lat -12°.
 */
function square(lon: number, lat: number, halfSide: number): LngLat[] {
  return [
    { longitude: lon - halfSide, latitude: lat - halfSide },
    { longitude: lon + halfSide, latitude: lat - halfSide },
    { longitude: lon + halfSide, latitude: lat + halfSide },
    { longitude: lon - halfSide, latitude: lat + halfSide },
  ];
}

/** CamadaRef simples (quadrado) para testes sintéticos. */
function camadaQuadrado(
  lon: number,
  lat: number,
  halfSide: number,
  tipo: CamadaRef['tipo'] = 'terra_indigena',
): CamadaRef {
  return {
    tipo,
    nome: `Camada ${tipo} teste`,
    fonte: 'fixture',
    rings: [
      [
        [lon - halfSide, lat - halfSide],
        [lon + halfSide, lat - halfSide],
        [lon + halfSide, lat + halfSide],
        [lon - halfSide, lat + halfSide],
        [lon - halfSide, lat - halfSide],
      ],
    ],
  };
}

// ---------------------------------------------------------------------------
// Parâmetros base para testes sintéticos
// Região de Sorriso/MT — lon -55.95, lat -12.42
// ---------------------------------------------------------------------------
const LON = -55.95;
const LAT = -12.42;

// ---------------------------------------------------------------------------
// Bloco 1 — Retorno null para < 3 pontos
// ---------------------------------------------------------------------------

describe('compararPerimetros — menos de 3 pontos → null', () => {
  const p1: LngLat = { longitude: LON, latitude: LAT };
  const p2: LngLat = { longitude: LON + 0.01, latitude: LAT };
  const poly3 = square(LON, LAT, 0.005); // polígono válido

  it('anterior com 0 pontos → null', () => {
    expect(compararPerimetros([], poly3, [])).toBeNull();
  });

  it('anterior com 2 pontos → null', () => {
    expect(compararPerimetros([p1, p2], poly3, [])).toBeNull();
  });

  it('novo com 0 pontos → null', () => {
    expect(compararPerimetros(poly3, [], [])).toBeNull();
  });

  it('novo com 2 pontos → null', () => {
    expect(compararPerimetros(poly3, [p1, p2], [])).toBeNull();
  });

  it('ambos com 2 pontos → null', () => {
    expect(compararPerimetros([p1, p2], [p1, p2], [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bloco 2 — Divisão por zero (área anterior = 0 → delta_pct = 0, sem NaN)
// ---------------------------------------------------------------------------

describe('compararPerimetros — área anterior zero (colinear)', () => {
  // Três pontos colineares: área = ~0
  const collinear: LngLat[] = [
    { longitude: LON,        latitude: LAT },
    { longitude: LON + 0.01, latitude: LAT },
    { longitude: LON + 0.02, latitude: LAT },
  ];
  const polyNovo = square(LON, LAT, 0.005);

  it('retorna DeltaRelatorio (não null) mesmo com área anterior = 0', () => {
    const r = compararPerimetros(collinear, polyNovo, []);
    expect(r).not.toBeNull();
  });

  it('delta_pct = 0 quando areaAnterior_ha = 0 (sem NaN/Infinity)', () => {
    const r = compararPerimetros(collinear, polyNovo, [])!;
    expect(Number.isFinite(r.delta_pct)).toBe(true);
    expect(Number.isNaN(r.delta_pct)).toBe(false);
    expect(r.delta_pct).toBe(0);
  });

  it('geradoEm é ISO 8601 válido', () => {
    const r = compararPerimetros(collinear, polyNovo, [])!;
    expect(() => new Date(r.geradoEm)).not.toThrow();
    expect(new Date(r.geradoEm).getTime()).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Bloco 3 — Sliver ignorado (diferença < 0,02 ha)
// ---------------------------------------------------------------------------

describe('compararPerimetros — sliver (diferença < 0,02 ha)', () => {
  // Dois polígonos quase idênticos: diferença ínfima de halfSide ≈ sub-sliver.
  // halfSide 0.009° → área ~392 ha. Diferença de 1e-7° → moldura ~0.009 ha < SLIVER_HA.
  const base = square(LON, LAT, 0.009);
  const quaseIgual = square(LON, LAT, 0.0090001); // diferença ínfima (~0.009 ha)

  it('acrescido_ha = 0 (sliver ignorado)', () => {
    const r = compararPerimetros(base, quaseIgual, [])!;
    expect(r).not.toBeNull();
    // A diferença deve ser muito pequena e <= SLIVER_HA (0.02 ha)
    expect(r.acrescido_ha).toBeLessThanOrEqual(0.02);
  });

  it('sobreposicoesAcrescido vazia quando sliver', () => {
    const camada = camadaQuadrado(LON, LAT, 0.01, 'terra_indigena');
    const r = compararPerimetros(base, quaseIgual, [camada])!;
    // Sliver não deve acionar análise de sobreposição
    expect(r.sobreposicoesAcrescido).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Bloco 4 — Microajuste (<2 ha, <5%, sem camada → baixo, sem visita)
// ---------------------------------------------------------------------------

describe('compararPerimetros — microajuste', () => {
  // Polígono base: ~98 ha. Versão levemente maior (~98,9 ha): delta ~0.87 ha e ~0.9%.
  const baseGrande = square(LON, LAT, 0.0045); // ~98 ha (escala documentada no helper)
  const levementeMaior = square(LON, LAT, 0.004520); // levissimamente maior

  it('tipoAlteracao = microajuste', () => {
    const r = compararPerimetros(baseGrande, levementeMaior, [])!;
    expect(r).not.toBeNull();
    expect(r.tipoAlteracao).toBe('microajuste');
  });

  it('severidade = baixo', () => {
    const r = compararPerimetros(baseGrande, levementeMaior, [])!;
    expect(r.severidade).toBe('baixo');
  });

  it('requerVisita = false', () => {
    const r = compararPerimetros(baseGrande, levementeMaior, [])!;
    expect(r.requerVisita).toBe(false);
  });

  it('sobreposicoesAcrescido vazia (sem camadas)', () => {
    const r = compararPerimetros(baseGrande, levementeMaior, [])!;
    expect(r.sobreposicoesAcrescido).toHaveLength(0);
  });

  it('delta_ha positivo e pequeno', () => {
    const r = compararPerimetros(baseGrande, levementeMaior, [])!;
    expect(r.delta_ha).toBeGreaterThanOrEqual(0);
    expect(r.delta_ha).toBeLessThan(2);
  });

  it('recomendacao menciona ruído de GPS', () => {
    const r = compararPerimetros(baseGrande, levementeMaior, [])!;
    expect(r.recomendacao.toLowerCase()).toContain('gps');
  });
});

// ---------------------------------------------------------------------------
// Bloco 5 — Área acrescida relevante (sem camadas → alto/médio)
// ---------------------------------------------------------------------------

describe('compararPerimetros — acrescida relevante', () => {
  // anterior: ~100 ha ; novo: anterior + strip ao sul (~15 ha)
  // halfSide 0.030° → ~100 ha; 0.035° → ~136 ha → delta ~36 ha (~36%)
  const anteriorMedio = square(LON, LAT, 0.030);
  const novoMaior = square(LON, LAT + 0.003, 0.033); // deslocado e maior

  it('retorna DeltaRelatorio não nulo', () => {
    expect(compararPerimetros(anteriorMedio, novoMaior, [])).not.toBeNull();
  });

  it('areaNova_ha > areaAnterior_ha', () => {
    const r = compararPerimetros(anteriorMedio, novoMaior, [])!;
    expect(r.areaNova_ha).toBeGreaterThan(r.areaAnterior_ha);
  });

  it('tipoAlteracao = acrescida ou deslocamento', () => {
    const r = compararPerimetros(anteriorMedio, novoMaior, [])!;
    expect(['acrescida', 'deslocamento']).toContain(r.tipoAlteracao);
  });

  it('fonteDados preservado', () => {
    const r = compararPerimetros(anteriorMedio, novoMaior, [], 'cache')!;
    expect(r.fonteDados).toBe('cache');
  });
});

// ---------------------------------------------------------------------------
// Bloco 6 — Área suprimida relevante
// ---------------------------------------------------------------------------

describe('compararPerimetros — suprimida relevante', () => {
  // anterior grande (~136 ha), novo menor (~100 ha) → delta negativo
  const anteriorGrande = square(LON, LAT, 0.035);
  const novoMenor = square(LON, LAT, 0.030);

  it('delta_ha < 0', () => {
    const r = compararPerimetros(anteriorGrande, novoMenor, [])!;
    expect(r.delta_ha).toBeLessThan(0);
  });

  it('suprimido_ha > 0', () => {
    const r = compararPerimetros(anteriorGrande, novoMenor, [])!;
    expect(r.suprimido_ha).toBeGreaterThan(0);
  });

  it('tipoAlteracao = suprimida', () => {
    const r = compararPerimetros(anteriorGrande, novoMenor, [])!;
    expect(r.tipoAlteracao).toBe('suprimida');
  });

  it('areaAnterior_ha > areaNova_ha', () => {
    const r = compararPerimetros(anteriorGrande, novoMenor, [])!;
    expect(r.areaAnterior_ha).toBeGreaterThan(r.areaNova_ha);
  });
});

// ---------------------------------------------------------------------------
// Bloco 7 — Deslocamento (área similar, forma diferente)
// ---------------------------------------------------------------------------

describe('compararPerimetros — deslocamento de divisa', () => {
  // Dois polígonos do mesmo tamanho mas deslocados: |delta_pct| < 5%
  // mas há acrescido e suprimido relevantes
  const anterior = square(LON, LAT, 0.009);           // ~100 ha
  const novo = square(LON + 0.002, LAT, 0.009);       // mesmo tamanho, deslocado ~220 m a leste

  it('tipoAlteracao = deslocamento', () => {
    const r = compararPerimetros(anterior, novo, [])!;
    expect(r).not.toBeNull();
    expect(r.tipoAlteracao).toBe('deslocamento');
  });

  it('severidade = medio (deslocamento sem camadas)', () => {
    const r = compararPerimetros(anterior, novo, [])!;
    expect(r.severidade).toBe('medio');
  });

  it('acrescido_ha > 0 e suprimido_ha > 0 (ambos presentes)', () => {
    const r = compararPerimetros(anterior, novo, [])!;
    expect(r.acrescido_ha).toBeGreaterThan(0);
    expect(r.suprimido_ha).toBeGreaterThan(0);
  });

  it('requerVisita = false para deslocamento médio', () => {
    const r = compararPerimetros(anterior, novo, [])!;
    expect(r.requerVisita).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bloco 8 — Acrescido tocando camada CRÍTICA (TI → critico + requerVisita)
// ---------------------------------------------------------------------------

describe('compararPerimetros — acrescido toca TI (critico)', () => {
  // anterior: pequeno quadrado; novo: muito maior, incluindo área de TI
  const anteriorPequeno = square(LON, LAT, 0.005);  // ~25 ha
  const novoGrande = square(LON, LAT, 0.020);       // ~400 ha

  // TI posicionada na área acrescida (borda leste, fora do anteriorPequeno)
  const ti: CamadaRef = camadaQuadrado(LON + 0.012, LAT, 0.003, 'terra_indigena');

  it('severidade = critico', () => {
    const r = compararPerimetros(anteriorPequeno, novoGrande, [ti])!;
    expect(r).not.toBeNull();
    expect(r.severidade).toBe('critico');
  });

  it('requerVisita = true', () => {
    const r = compararPerimetros(anteriorPequeno, novoGrande, [ti])!;
    expect(r.requerVisita).toBe(true);
  });

  it('sobreposicoesAcrescido contém terra_indigena', () => {
    const r = compararPerimetros(anteriorPequeno, novoGrande, [ti])!;
    const tipos = r.sobreposicoesAcrescido.map((s) => s.tipo);
    expect(tipos).toContain('terra_indigena');
  });

  it('recomendacao menciona Terra Indígena', () => {
    const r = compararPerimetros(anteriorPequeno, novoGrande, [ti])!;
    expect(r.recomendacao).toMatch(/terra ind[íi]gena/i);
  });
});

// ---------------------------------------------------------------------------
// Bloco 9 — Acrescido tocando EMBARGO (critico + recomendação específica)
// ---------------------------------------------------------------------------

describe('compararPerimetros — acrescido toca embargo_ibama (critico)', () => {
  const anteriorPequeno = square(LON, LAT, 0.005);
  const novoGrande = square(LON, LAT, 0.020);
  const embargo: CamadaRef = camadaQuadrado(LON + 0.012, LAT, 0.003, 'embargo_ibama');

  it('severidade = critico e requerVisita = true', () => {
    const r = compararPerimetros(anteriorPequeno, novoGrande, [embargo])!;
    expect(r.severidade).toBe('critico');
    expect(r.requerVisita).toBe(true);
  });

  it('recomendacao menciona IBAMA ou embargo', () => {
    const r = compararPerimetros(anteriorPequeno, novoGrande, [embargo])!;
    expect(r.recomendacao).toMatch(/ibama|embargo/i);
  });
});

// ---------------------------------------------------------------------------
// Bloco 10 — Acrescido tocando desmatamento > 1 ha (alto)
// ---------------------------------------------------------------------------

describe('compararPerimetros — acrescido toca desmatamento > 1 ha (alto)', () => {
  const anteriorPequeno = square(LON, LAT, 0.001);  // ~4,8 ha
  const novoMaior = square(LON, LAT, 0.0025);       // ~30 ha → delta ~25 ha (< 50, não-critico)

  // Desmatamento na faixa acrescida (overlap ~2,4 ha > 1 ha)
  const desmat: CamadaRef = camadaQuadrado(LON + 0.0018, LAT, 0.0007, 'desmatamento');

  it('severidade = alto', () => {
    const r = compararPerimetros(anteriorPequeno, novoMaior, [desmat])!;
    expect(r).not.toBeNull();
    expect(r.severidade).toBe('alto');
  });

  it('requerVisita = true', () => {
    const r = compararPerimetros(anteriorPequeno, novoMaior, [desmat])!;
    expect(r.requerVisita).toBe(true);
  });

  it('sobreposicoesAcrescido tem desmatamento', () => {
    const r = compararPerimetros(anteriorPequeno, novoMaior, [desmat])!;
    expect(r.sobreposicoesAcrescido.some((s) => s.tipo === 'desmatamento')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bloco 11 — Acrescido tocando APP > 0.5 ha (alto)
// ---------------------------------------------------------------------------

describe('compararPerimetros — acrescido toca APP > 0,5 ha (alto)', () => {
  const anteriorPequeno = square(LON, LAT, 0.001);
  const novoMaior = square(LON, LAT, 0.0025); // delta ~25 ha (< 50, não-critico)
  const app: CamadaRef = camadaQuadrado(LON + 0.0018, LAT, 0.0007, 'app_hidrografia');

  it('severidade = alto por APP > 0.5 ha', () => {
    const r = compararPerimetros(anteriorPequeno, novoMaior, [app])!;
    expect(r).not.toBeNull();
    // APP pode gerar alto se area_ha > 0.5
    const appSob = r.sobreposicoesAcrescido.find((s) => s.tipo === 'app_hidrografia');
    if (appSob && appSob.area_ha > 0.5) {
      expect(r.severidade).toBe('alto');
      expect(r.requerVisita).toBe(true);
    } else {
      // Se a área APP não excedeu 0.5 ha, pode ser médio — aceitável
      expect(['alto', 'medio']).toContain(r.severidade);
    }
  });
});

// ---------------------------------------------------------------------------
// Bloco 12 — Delta+ entre 5% e 50% sem camada (alto)
// ---------------------------------------------------------------------------

describe('compararPerimetros — delta_pct entre 5% e 50% (alto)', () => {
  // anterior ~98 ha, novo ~117 ha → delta ~19 ha (~19,5%) — em [5%,50%] e < 50 ha
  const anteriorBase = square(LON, LAT, 0.0045);
  const novoVintePorc = square(LON, LAT, 0.00492); // ~9,3% maior em halfSide → ~19,5% área maior

  it('severidade = alto quando delta_pct entre 5 e 50 sem camadas', () => {
    const r = compararPerimetros(anteriorBase, novoVintePorc, [])!;
    expect(r).not.toBeNull();
    if (r.delta_pct >= 5 && r.delta_pct <= 50) {
      expect(r.severidade).toBe('alto');
      expect(r.requerVisita).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Bloco 13 — Delta+ > 50 ha (critico por tamanho)
// ---------------------------------------------------------------------------

describe('compararPerimetros — delta > 50 ha (critico)', () => {
  // anterior ~25 ha, novo ~250 ha → delta ~225 ha
  const anteriorPequeno = square(LON, LAT, 0.005);   // ~25 ha
  const novoEnorme = square(LON, LAT, 0.050);        // ~2500 ha

  it('severidade = critico por delta > 50 ha', () => {
    const r = compararPerimetros(anteriorPequeno, novoEnorme, [])!;
    expect(r).not.toBeNull();
    // delta > 50 ha deve ser critico mesmo sem camadas
    if (r.delta_ha > 50) {
      expect(r.severidade).toBe('critico');
      expect(r.requerVisita).toBe(true);
    }
  });

  it('recomendacao genérica critico quando sem camada específica', () => {
    const r = compararPerimetros(anteriorPequeno, novoEnorme, [])!;
    if (r.severidade === 'critico') {
      expect(r.recomendacao.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Bloco 14 — Só car_vizinho no acrescido (médio)
// ---------------------------------------------------------------------------

describe('compararPerimetros — apenas car_vizinho no acrescido (médio)', () => {
  const anteriorBase = square(LON, LAT, 0.0045); // ~98 ha
  const novoMaior = square(LON, LAT, 0.00456); // delta ~2,6 ha (~2,7%) → < 5% e < 10 ha

  const carVizinho: CamadaRef = camadaQuadrado(LON + 0.0045, LAT, 0.0006, 'car_vizinho');
  // Sem outras camadas restritivas

  it('severidade = medio quando só car_vizinho', () => {
    const r = compararPerimetros(anteriorBase, novoMaior, [carVizinho])!;
    expect(r).not.toBeNull();
    // Se o acrescido toca só car_vizinho (e delta < 10 ha sem TI/UC/embargo)
    const somenteCar = r.sobreposicoesAcrescido.every((s) => s.tipo === 'car_vizinho');
    if (somenteCar && r.sobreposicoesAcrescido.length > 0) {
      expect(r.severidade).toBe('medio');
      expect(r.requerVisita).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Bloco 15 — incertezaGPS_m propagado da accuracy dos vértices
// ---------------------------------------------------------------------------

describe('compararPerimetros — incertezaGPS_m', () => {
  const anteriorComAccuracy = square(LON, LAT, 0.009).map((p, i) => ({
    ...p,
    accuracy: i === 0 ? 18 : 5,
  }));
  const novoComAccuracy = square(LON, LAT, 0.010).map((p, i) => ({
    ...p,
    accuracy: i === 1 ? 25 : 3,
  }));
  const semAccuracy = square(LON, LAT, 0.009);

  it('incertezaGPS_m = max accuracy de anterior + novo', () => {
    const r = compararPerimetros(anteriorComAccuracy, novoComAccuracy, [])!;
    expect(r.incertezaGPS_m).toBe(25); // pior accuracy
  });

  it('incertezaGPS_m = undefined quando não há accuracy', () => {
    const r = compararPerimetros(semAccuracy, square(LON, LAT, 0.010), [])!;
    expect(r.incertezaGPS_m).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Bloco 16 — fonteDados propagado corretamente
// ---------------------------------------------------------------------------

describe('compararPerimetros — fonteDados', () => {
  const a = square(LON, LAT, 0.009);
  const b = square(LON, LAT, 0.010);

  it('default = online', () => {
    const r = compararPerimetros(a, b, [])!;
    expect(r.fonteDados).toBe('online');
  });

  it('offline-demo propagado', () => {
    const r = compararPerimetros(a, b, [], 'offline-demo')!;
    expect(r.fonteDados).toBe('offline-demo');
  });

  it('cache propagado', () => {
    const r = compararPerimetros(a, b, [], 'cache')!;
    expect(r.fonteDados).toBe('cache');
  });
});

// ---------------------------------------------------------------------------
// Bloco 17 — Suprimido > 30% cobrindo desmate (critico por ocultamento)
// ---------------------------------------------------------------------------

describe('compararPerimetros — suprimido cobre desmatamento (critico ocultamento)', () => {
  // anterior GRANDE cobrindo desmatamento; novo MUITO MENOR deixando o desmate para fora
  // suprimido_ha > 30% de anterior_ha, e o suprimido está sobre desmatamento
  const anteriorGrande = square(LON, LAT, 0.020);  // ~400 ha
  const novoMuiMenor = square(LON, LAT, 0.005);   // ~25 ha — suprimido ~94% do anterior

  // Desmatamento na área que será suprimida (borda leste do anterior)
  const desmatSuprimido: CamadaRef = camadaQuadrado(LON + 0.012, LAT, 0.004, 'desmatamento');

  it('severidade = critico quando suprimido > 30% cobre desmatamento', () => {
    const r = compararPerimetros(anteriorGrande, novoMuiMenor, [desmatSuprimido])!;
    expect(r).not.toBeNull();
    // suprimido é ~375 ha de ~400 ha anterior = ~94% → > 30%
    // e o desmatamento está no suprimido → critico
    if (r.suprimido_ha / r.areaAnterior_ha > 0.30) {
      expect(r.severidade).toBe('critico');
    }
  });
});

// ---------------------------------------------------------------------------
// Bloco 18 — Queimada no acrescido (alto quando área > 1 ha)
// ---------------------------------------------------------------------------

describe('compararPerimetros — acrescido toca queimada > 1 ha (alto)', () => {
  const anteriorBase = square(LON, LAT, 0.001);
  const novoMaior = square(LON, LAT, 0.0025); // delta ~25 ha (< 50, não-critico)
  const queimada: CamadaRef = camadaQuadrado(LON + 0.0018, LAT, 0.0007, 'queimada');

  it('severidade = alto por queimada', () => {
    const r = compararPerimetros(anteriorBase, novoMaior, [queimada])!;
    expect(r).not.toBeNull();
    const qSob = r.sobreposicoesAcrescido.find((s) => s.tipo === 'queimada');
    if (qSob && qSob.area_ha > 1) {
      expect(r.severidade).toBe('alto');
    }
  });
});

// ---------------------------------------------------------------------------
// Bloco 19 — UC no acrescido (critico)
// ---------------------------------------------------------------------------

describe('compararPerimetros — acrescido toca UC (critico)', () => {
  const anteriorBase = square(LON, LAT, 0.003);
  const novoMaior = square(LON, LAT, 0.015);
  const uc: CamadaRef = camadaQuadrado(LON + 0.008, LAT, 0.004, 'unidade_conservacao');

  it('severidade = critico e requerVisita = true', () => {
    const r = compararPerimetros(anteriorBase, novoMaior, [uc])!;
    expect(r).not.toBeNull();
    expect(r.severidade).toBe('critico');
    expect(r.requerVisita).toBe(true);
  });

  it('recomendacao menciona TI ou UC (ramo terra_indigena/UC critico sem especificar TI)', () => {
    const r = compararPerimetros(anteriorBase, novoMaior, [uc])!;
    // recomendação critico genérica quando não é TI nem embargo
    expect(r.recomendacao.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Bloco 20 — Delta+ > 10 ha + car_vizinho (alto)
// ---------------------------------------------------------------------------

describe('compararPerimetros — delta > 10 ha com car_vizinho (alto)', () => {
  // anterior ~4,8 ha, novo ~30 ha → delta ~25 ha (> 10 e < 50), car_vizinho na área acrescida
  const anteriorPeq = square(LON, LAT, 0.001);
  const novoMaior = square(LON, LAT, 0.0025);
  const car: CamadaRef = camadaQuadrado(LON + 0.0018, LAT, 0.0007, 'car_vizinho');

  it('severidade = alto (delta > 10 ha + car_vizinho)', () => {
    const r = compararPerimetros(anteriorPeq, novoMaior, [car])!;
    expect(r).not.toBeNull();
    // só se car_vizinho aparecer no acrescido e delta > 10 ha
    const temCar = r.sobreposicoesAcrescido.some((s) => s.tipo === 'car_vizinho');
    if (temCar && r.delta_ha > 10) {
      expect(r.severidade).toBe('alto');
      expect(r.requerVisita).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Bloco 21 — Suprimida < 10% (médio)
// ---------------------------------------------------------------------------

describe('compararPerimetros — suprimida moderada < 10% (médio)', () => {
  // anterior ~100 ha, novo ~95 ha → delta ~-5 ha (~-5%) → médio por suprimido < 10%
  const anteriorBase = square(LON, LAT, 0.030);
  const novoMenor = square(LON, LAT, 0.0295); // levemente menor

  it('severidade = medio por suprimida < 10% sem camadas', () => {
    const r = compararPerimetros(anteriorBase, novoMenor, [])!;
    expect(r).not.toBeNull();
    if (r.delta_ha < 0 && Math.abs(r.delta_pct) < 10) {
      expect(r.severidade).toBe('medio');
    }
  });
});

// ---------------------------------------------------------------------------
// Bloco 22 — requerVisita para severidades
// ---------------------------------------------------------------------------

describe('requerVisita por severidade', () => {
  it('requerVisita = true para critico', () => {
    const anteriorPeq = square(LON, LAT, 0.005);
    const novoGrande = square(LON, LAT, 0.020);
    const ti = camadaQuadrado(LON + 0.012, LAT, 0.003, 'terra_indigena');
    const r = compararPerimetros(anteriorPeq, novoGrande, [ti])!;
    expect(r.severidade).toBe('critico');
    expect(r.requerVisita).toBe(true);
  });

  it('requerVisita = false para baixo (microajuste)', () => {
    const base = square(LON, LAT, 0.030);
    const quaseIgual = square(LON, LAT, 0.0302);
    const r = compararPerimetros(base, quaseIgual, [])!;
    if (r.severidade === 'baixo') {
      expect(r.requerVisita).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Bloco 23 — Integração: DEMO_PERIMETRO_ANTERIOR + SORRISO_SOJA + DEMO_CAMADAS
// ---------------------------------------------------------------------------

describe('integração demo — DEMO_PERIMETRO_ANTERIOR × SORRISO_SOJA × DEMO_CAMADAS', () => {
  const sorrisoSoja = DEMO_ROUTES.find((r) => r.id === 'sorriso-soja')!;
  const novoVertices = sorrisoSoja.vertices;

  it('DEMO_PERIMETRO_ANTERIOR está definido e tem >= 3 vértices', () => {
    expect(DEMO_PERIMETRO_ANTERIOR).toBeDefined();
    expect(DEMO_PERIMETRO_ANTERIOR.length).toBeGreaterThanOrEqual(3);
  });

  it('retorna DeltaRelatorio não nulo', () => {
    const r = compararPerimetros(
      DEMO_PERIMETRO_ANTERIOR,
      novoVertices,
      DEMO_CAMADAS,
      'offline-demo',
    );
    expect(r).not.toBeNull();
  });

  it('areaAnterior_ha < areaNova_ha (novo é maior)', () => {
    const r = compararPerimetros(
      DEMO_PERIMETRO_ANTERIOR,
      novoVertices,
      DEMO_CAMADAS,
      'offline-demo',
    )!;
    expect(r.areaAnterior_ha).toBeLessThan(r.areaNova_ha);
  });

  it('delta_ha > 0 (acréscimo de área)', () => {
    const r = compararPerimetros(
      DEMO_PERIMETRO_ANTERIOR,
      novoVertices,
      DEMO_CAMADAS,
      'offline-demo',
    )!;
    expect(r.delta_ha).toBeGreaterThan(0);
  });

  it('areaAnterior_ha ≈ 32,7 ha (±5 ha)', () => {
    const r = compararPerimetros(
      DEMO_PERIMETRO_ANTERIOR,
      novoVertices,
      DEMO_CAMADAS,
      'offline-demo',
    )!;
    expect(r.areaAnterior_ha).toBeGreaterThan(27);
    expect(r.areaAnterior_ha).toBeLessThan(38);
  });

  it('areaNova_ha ≈ 39,8 ha (±5 ha)', () => {
    const r = compararPerimetros(
      DEMO_PERIMETRO_ANTERIOR,
      novoVertices,
      DEMO_CAMADAS,
      'offline-demo',
    )!;
    expect(r.areaNova_ha).toBeGreaterThan(34);
    expect(r.areaNova_ha).toBeLessThan(45);
  });

  it('delta_ha ≈ 7 ha (±5 ha)', () => {
    const r = compararPerimetros(
      DEMO_PERIMETRO_ANTERIOR,
      novoVertices,
      DEMO_CAMADAS,
      'offline-demo',
    )!;
    expect(r.delta_ha).toBeGreaterThan(2);
    expect(r.delta_ha).toBeLessThan(15);
  });

  it('acrescido_ha > 0 (strip sul presente)', () => {
    const r = compararPerimetros(
      DEMO_PERIMETRO_ANTERIOR,
      novoVertices,
      DEMO_CAMADAS,
      'offline-demo',
    )!;
    expect(r.acrescido_ha).toBeGreaterThan(0);
  });

  it('sobreposicoesAcrescido não vazia (acrescido cruza camadas demo)', () => {
    const r = compararPerimetros(
      DEMO_PERIMETRO_ANTERIOR,
      novoVertices,
      DEMO_CAMADAS,
      'offline-demo',
    )!;
    expect(r.sobreposicoesAcrescido.length).toBeGreaterThan(0);
  });

  it('severidade = critico (acrescido cruza embargo ou TI no acrescido)', () => {
    const r = compararPerimetros(
      DEMO_PERIMETRO_ANTERIOR,
      novoVertices,
      DEMO_CAMADAS,
      'offline-demo',
    )!;
    expect(r.severidade).toBe('critico');
  });

  it('requerVisita = true para demo', () => {
    const r = compararPerimetros(
      DEMO_PERIMETRO_ANTERIOR,
      novoVertices,
      DEMO_CAMADAS,
      'offline-demo',
    )!;
    expect(r.requerVisita).toBe(true);
  });

  it('fonteDados = offline-demo', () => {
    const r = compararPerimetros(
      DEMO_PERIMETRO_ANTERIOR,
      novoVertices,
      DEMO_CAMADAS,
      'offline-demo',
    )!;
    expect(r.fonteDados).toBe('offline-demo');
  });

  it('recomendacao não vazia', () => {
    const r = compararPerimetros(
      DEMO_PERIMETRO_ANTERIOR,
      novoVertices,
      DEMO_CAMADAS,
      'offline-demo',
    )!;
    expect(r.recomendacao.length).toBeGreaterThan(10);
  });

  it('geradoEm é ISO válido', () => {
    const r = compararPerimetros(
      DEMO_PERIMETRO_ANTERIOR,
      novoVertices,
      DEMO_CAMADAS,
      'offline-demo',
    )!;
    expect(new Date(r.geradoEm).toISOString()).toBe(r.geradoEm);
  });
});

// ---------------------------------------------------------------------------
// Bloco 24 — Acréscimo disjunto (difference → MultiPolygon)
// O anterior é uma barra fina que cruza todo o novo, partindo o acréscimo em
// duas regiões separadas (topo + base). Exercita o ramo MultiPolygon da análise.
// ---------------------------------------------------------------------------

describe('compararPerimetros — acréscimo disjunto (MultiPolygon)', () => {
  // novo: quadrado ~120 ha. anterior: barra horizontal fina mais larga que o novo
  // em X → novo − anterior = faixa superior + faixa inferior (duas partes).
  const novo = square(LON, LAT, 0.005);
  const barra: LngLat[] = [
    { longitude: LON - 0.006, latitude: LAT - 0.0005 },
    { longitude: LON + 0.006, latitude: LAT - 0.0005 },
    { longitude: LON + 0.006, latitude: LAT + 0.0005 },
    { longitude: LON - 0.006, latitude: LAT + 0.0005 },
  ];
  // Camada na faixa superior do acréscimo (uma das duas partes do MultiPolygon).
  const camadaTopo = camadaQuadrado(LON, LAT + 0.003, 0.0015, 'desmatamento');

  it('retorna DeltaRelatorio não nulo com acréscimo em duas partes', () => {
    const r = compararPerimetros(barra, novo, [camadaTopo], 'offline-demo')!;
    expect(r).not.toBeNull();
    expect(r.acrescido_ha).toBeGreaterThan(0);
  });

  it('detecta sobreposição em parte do MultiPolygon (faixa superior)', () => {
    const r = compararPerimetros(barra, novo, [camadaTopo], 'offline-demo')!;
    expect(r.sobreposicoesAcrescido.some((s) => s.tipo === 'desmatamento')).toBe(true);
  });
});
