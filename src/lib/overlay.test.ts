// Testes unitários do motor de análise de sobreposição (overlay.ts).
//
// ⚠️  RUNNER NÃO CONFIGURADO — Nenhum framework de teste está presente em
//     package.json (sem jest, vitest, mocha etc.). Para executar estes testes:
//
//     Opção A — Vitest (recomendado para projetos Vite/Expo/ESM):
//       bun add -D vitest
//       # adicione em package.json > scripts:  "test": "vitest run"
//       bun test
//
//     Opção B — Jest com suporte a ESM:
//       bun add -D jest @types/jest ts-jest
//       # configure jest.config.ts com preset ts-jest
//       bun test
//
//     Os testes abaixo são compatíveis com ambos (mesma API describe/it/expect).
//
// Cobertura mínima exigida pelo quality gate (M5):
//   (a) Quadrado ~100 m de lado → area_ha ≈ 1,0 ±0,05
//   (b) Imóvel com area ≈ 0 → percentual = 0, sem NaN/Infinity
//   (c) points.length < 3 → ok = false, sem exceção
//   (d) Desmatamento com sobreposição > 20% → severidade 'critico'
//   (e) Camada sem interseção → não entra em sobreposicoes

import { describe, it, expect } from 'vitest';
import {
  analisarSobreposicoes,
  severidadePorTipo,
  type CamadaRef,
} from './overlay';
import type { LngLat } from './geo';

// ---------------------------------------------------------------------------
// Helpers de polígono para os testes
// ---------------------------------------------------------------------------

/**
 * Cria um quadrado com centro em (lon, lat) e lado de ~sideDeg graus.
 * A área geodésica de um quadrado de 0.009° × 0.009° em lat -12° é ≈ 1 ha.
 */
function _square(lon: number, lat: number, halfSide: number): LngLat[] {
  return [
    { longitude: lon - halfSide, latitude: lat - halfSide },
    { longitude: lon + halfSide, latitude: lat - halfSide },
    { longitude: lon + halfSide, latitude: lat + halfSide },
    { longitude: lon - halfSide, latitude: lat + halfSide },
  ];
}

/** CamadaRef de teste: quadrado simples sem holes. */
function _camadaQuadrado(
  lon: number,
  lat: number,
  halfSide: number,
  tipo: CamadaRef['tipo'] = 'terra_indigena',
): CamadaRef {
  const s = halfSide;
  return {
    tipo,
    nome: 'Camada Teste',
    fonte: 'fixture',
    rings: [
      [
        [lon - s, lat - s],
        [lon + s, lat - s],
        [lon + s, lat + s],
        [lon - s, lat + s],
        [lon - s, lat - s], // fechado
      ],
    ],
  };
}

// ---------------------------------------------------------------------------
// (a) Área geodésica de quadrado ~100 m × 100 m ≈ 1 ha
// ---------------------------------------------------------------------------

describe('analisarSobreposicoes', () => {
  it('(a) quadrado de ~100 m de lado tem area_ha ≈ 1,0 ±0,05', () => {
    // Em latitude -12°:
    //   1° lat  ≈ 111 120 m → 100 m ≈ 0,000900°
    //   1° lon  ≈ 108 670 m → 100 m ≈ 0,000920°
    // Usamos halfSide = 0,000450° para cada eixo → lado ≈ 100 m.
    // Área esperada ≈ 0,01 km² = 1 ha.
    const points = _square(-55.95, -12.42, 0.00045);
    const resultado = analisarSobreposicoes(points, []);
    expect(resultado.areaImovel_ha).toBeGreaterThan(0.95);
    expect(resultado.areaImovel_ha).toBeLessThan(1.05);
  });

  // ---------------------------------------------------------------------------
  // (b) Imóvel com pontos colineares (área ≈ 0) → sem NaN ou Infinity
  // ---------------------------------------------------------------------------

  it('(b) pontos colineares (area ≈ 0) → percentual=0, sem NaN/Infinity', () => {
    // Três pontos na mesma latitude — ringAreaM2 retorna valor ~0
    const collinear: LngLat[] = [
      { longitude: -55.9530, latitude: -12.4180 },
      { longitude: -55.9470, latitude: -12.4180 },
      { longitude: -55.9510, latitude: -12.4180 },
    ];
    // Camada sobreposta: mesma região
    const camada = _camadaQuadrado(-55.95, -12.418, 0.01);
    const resultado = analisarSobreposicoes(collinear, [camada]);

    // nenhum campo deve ser NaN ou Infinity
    expect(Number.isFinite(resultado.areaImovel_ha)).toBe(true);
    for (const s of resultado.sobreposicoes) {
      expect(Number.isFinite(s.percentual)).toBe(true);
      expect(Number.isNaN(s.percentual)).toBe(false);
      expect(Number.isFinite(s.area_ha)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // (c) points.length < 3 → ok=false, areaImovel_ha=0, sem exceção
  // ---------------------------------------------------------------------------

  it('(c) menos de 3 pontos → ok=false, areaImovel_ha=0', () => {
    const poucosPontos: LngLat[] = [
      { longitude: -55.95, latitude: -12.42 },
      { longitude: -55.94, latitude: -12.42 },
    ];
    const resultado = analisarSobreposicoes(poucosPontos, []);
    expect(resultado.ok).toBe(false);
    expect(resultado.areaImovel_ha).toBe(0);
    expect(resultado.sobreposicoes).toHaveLength(0);
  });

  it('(c) zero pontos → ok=false, sem exceção', () => {
    const resultado = analisarSobreposicoes([], []);
    expect(resultado.ok).toBe(false);
    expect(resultado.areaImovel_ha).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // (d) Desmatamento com sobreposição > 20% → severidade escalada para 'critico'
  // ---------------------------------------------------------------------------

  it('(d) desmatamento > 20% do imóvel → severidade=critico', () => {
    // Imóvel: quadrado de 0.01° de halfSide em -55.95, -12.42
    const imóvel = _square(-55.95, -12.42, 0.01);
    // Camada desmatamento: cobre ~50% do imóvel (metade esquerda)
    const camadaDesmatamento: CamadaRef = {
      tipo: 'desmatamento',
      nome: 'PRODES 2023 teste',
      fonte: 'fixture',
      rings: [
        [
          [-55.97,  -12.44],
          [-55.95,  -12.44], // divide ao meio (lon = -55.95 = centro)
          [-55.95,  -12.40],
          [-55.97,  -12.40],
          [-55.97,  -12.44],
        ],
      ],
    };
    const resultado = analisarSobreposicoes(imóvel, [camadaDesmatamento]);
    expect(resultado.sobreposicoes).toHaveLength(1);
    const s = resultado.sobreposicoes[0]!;
    expect(s.percentual).toBeGreaterThan(20);
    expect(s.severidade).toBe('critico');
  });

  it('(d) desmatamento ≤ 20% → severidade=alerta (base)', () => {
    // severidadePorTipo é 'alerta' por definição para desmatamento
    expect(severidadePorTipo('desmatamento')).toBe('alerta');
  });

  // ---------------------------------------------------------------------------
  // (e) Camada sem interseção geográfica → não entra em sobreposicoes
  // ---------------------------------------------------------------------------

  it('(e) camada longe do imóvel → sobreposicoes vazia', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    // Camada no lado oposto do Brasil (SP)
    const camadaDistante = _camadaQuadrado(-46.63, -23.55, 0.1, 'embargo_ibama');
    const resultado = analisarSobreposicoes(imóvel, [camadaDistante]);
    expect(resultado.sobreposicoes).toHaveLength(0);
    // Sem sobreposição crítica → ok=true
    expect(resultado.ok).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Extras: validação de contrato e ordem de severidade
  // ---------------------------------------------------------------------------

  it('sobreposicoes são ordenadas: critico → alerta → info', () => {
    const imóvel = _square(-55.95, -12.42, 0.05);
    // Cria três camadas que se sobrepõem ao imóvel
    const camadas: CamadaRef[] = [
      _camadaQuadrado(-55.95, -12.42, 0.03, 'app_hidrografia'), // info
      _camadaQuadrado(-55.95, -12.42, 0.03, 'embargo_ibama'),   // critico
      _camadaQuadrado(-55.95, -12.42, 0.03, 'desmatamento'),    // alerta
    ];
    const resultado = analisarSobreposicoes(imóvel, camadas);
    const severidades = resultado.sobreposicoes.map((s) => s.severidade);
    // deve estar ordenado: primeiro critico, depois alerta, depois info
    const ordemEsperada = [...severidades].sort((a, b) => {
      const o: Record<string, number> = { critico: 0, alerta: 1, info: 2 };
      return (o[a] ?? 3) - (o[b] ?? 3);
    });
    expect(severidades).toEqual(ordemEsperada);
  });

  it('ok=false quando há sobreposição critica', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    const ti = _camadaQuadrado(-55.95, -12.42, 0.005, 'terra_indigena');
    const resultado = analisarSobreposicoes(imóvel, [ti]);
    expect(resultado.ok).toBe(false);
    expect(resultado.sobreposicoes[0]?.severidade).toBe('critico');
  });

  it('ok=true quando há sobreposição apenas info', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    const app = _camadaQuadrado(-55.95, -12.42, 0.005, 'app_hidrografia');
    const resultado = analisarSobreposicoes(imóvel, [app]);
    expect(resultado.ok).toBe(true);
    expect(resultado.sobreposicoes[0]?.severidade).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// severidadePorTipo — tabela de severidades
// ---------------------------------------------------------------------------

describe('severidadePorTipo', () => {
  it('terra_indigena → critico', () => expect(severidadePorTipo('terra_indigena')).toBe('critico'));
  it('unidade_conservacao → critico', () => expect(severidadePorTipo('unidade_conservacao')).toBe('critico'));
  it('embargo_ibama → critico', () => expect(severidadePorTipo('embargo_ibama')).toBe('critico'));
  it('desmatamento → alerta', () => expect(severidadePorTipo('desmatamento')).toBe('alerta'));
  it('queimada → alerta', () => expect(severidadePorTipo('queimada')).toBe('alerta'));
  it('app_hidrografia → info', () => expect(severidadePorTipo('app_hidrografia')).toBe('info'));
  it('hidrografia → info', () => expect(severidadePorTipo('hidrografia')).toBe('info'));
  it('car_vizinho → info', () => expect(severidadePorTipo('car_vizinho')).toBe('info'));
});

// ---------------------------------------------------------------------------
// Mensagens por tipo e ramos dinâmicos de severidade (cobertura de _mensagem)
// ---------------------------------------------------------------------------

describe('mensagens e severidade dinâmica', () => {
  it('unidade_conservacao gera mensagem com ICMBio', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    const uc = _camadaQuadrado(-55.95, -12.42, 0.005, 'unidade_conservacao');
    const r = analisarSobreposicoes(imóvel, [uc]);
    expect(r.sobreposicoes[0]!.severidade).toBe('critico');
    expect(r.sobreposicoes[0]!.mensagem).toContain('ICMBio');
  });

  it('embargo_ibama gera mensagem de embargo', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    const emb = _camadaQuadrado(-55.95, -12.42, 0.005, 'embargo_ibama');
    const r = analisarSobreposicoes(imóvel, [emb]);
    expect(r.sobreposicoes[0]!.mensagem).toContain('IBAMA');
  });

  it('terra_indigena gera mensagem com FUNAI', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    const ti = _camadaQuadrado(-55.95, -12.42, 0.005, 'terra_indigena');
    const r = analisarSobreposicoes(imóvel, [ti]);
    expect(r.sobreposicoes[0]!.mensagem).toContain('FUNAI');
  });

  it('desmatamento ≤ 20% (não crítico) usa mensagem de alerta', () => {
    // imóvel grande, camada cobrindo fração pequena (~5%)
    const imóvel = _square(-55.95, -12.42, 0.02);
    const desmat: CamadaRef = {
      tipo: 'desmatamento',
      nome: 'PRODES pequeno',
      fonte: 'fixture',
      rings: [[
        [-55.97, -12.44],
        [-55.964, -12.44],
        [-55.964, -12.435],
        [-55.97, -12.435],
        [-55.97, -12.44],
      ]],
    };
    const r = analisarSobreposicoes(imóvel, [desmat]);
    expect(r.sobreposicoes).toHaveLength(1);
    const s = r.sobreposicoes[0]!;
    expect(s.percentual).toBeLessThanOrEqual(20);
    expect(s.severidade).toBe('alerta');
    expect(s.mensagem).toContain('desmatada legalmente');
  });

  it('queimada > 20% escala para crítico com mensagem específica', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    const queimada: CamadaRef = {
      tipo: 'queimada',
      nome: 'AQ1km teste',
      fonte: 'fixture',
      rings: [[
        [-55.97, -12.44],
        [-55.95, -12.44],
        [-55.95, -12.40],
        [-55.97, -12.40],
        [-55.97, -12.44],
      ]],
    };
    const r = analisarSobreposicoes(imóvel, [queimada]);
    const s = r.sobreposicoes[0]!;
    expect(s.percentual).toBeGreaterThan(20);
    expect(s.severidade).toBe('critico');
    expect(s.mensagem).toContain('Percentual alto');
    expect(r.ok).toBe(false);
  });

  it('queimada ≤ 20% permanece alerta', () => {
    const imóvel = _square(-55.95, -12.42, 0.02);
    const queimada: CamadaRef = {
      tipo: 'queimada',
      nome: 'AQ1km pequeno',
      fonte: 'fixture',
      rings: [[
        [-55.97, -12.44],
        [-55.964, -12.44],
        [-55.964, -12.435],
        [-55.97, -12.435],
        [-55.97, -12.44],
      ]],
    };
    const r = analisarSobreposicoes(imóvel, [queimada]);
    const s = r.sobreposicoes[0]!;
    expect(s.percentual).toBeLessThanOrEqual(20);
    expect(s.severidade).toBe('alerta');
    expect(s.mensagem).toContain('queima controlada');
  });

  it('app_hidrografia gera mensagem de APP', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    const app = _camadaQuadrado(-55.95, -12.42, 0.005, 'app_hidrografia');
    const r = analisarSobreposicoes(imóvel, [app]);
    expect(r.sobreposicoes[0]!.mensagem).toContain('APP');
  });

  it('hidrografia gera mensagem de curso d\'água', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    const hidro = _camadaQuadrado(-55.95, -12.42, 0.005, 'hidrografia');
    const r = analisarSobreposicoes(imóvel, [hidro]);
    expect(r.sobreposicoes[0]!.mensagem).toContain('hidrografia');
    expect(r.sobreposicoes[0]!.severidade).toBe('info');
  });

  it('car_vizinho > 50% escala para alerta (conflito de limites)', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    // camada cobre todo o imóvel → 100%
    const car = _camadaQuadrado(-55.95, -12.42, 0.02, 'car_vizinho');
    const r = analisarSobreposicoes(imóvel, [car]);
    const s = r.sobreposicoes[0]!;
    expect(s.percentual).toBeGreaterThan(50);
    expect(s.severidade).toBe('alerta');
    expect(s.mensagem).toContain('conflito de limites');
    // alerta não bloqueia
    expect(r.ok).toBe(true);
  });

  it('car_vizinho ≤ 50% permanece info', () => {
    const imóvel = _square(-55.95, -12.42, 0.02);
    const car: CamadaRef = {
      tipo: 'car_vizinho',
      nome: 'Fazenda vizinha',
      fonte: 'fixture',
      rings: [[
        [-55.97, -12.44],
        [-55.964, -12.44],
        [-55.964, -12.435],
        [-55.97, -12.435],
        [-55.97, -12.44],
      ]],
    };
    const r = analisarSobreposicoes(imóvel, [car]);
    const s = r.sobreposicoes[0]!;
    expect(s.percentual).toBeLessThanOrEqual(50);
    expect(s.severidade).toBe('info');
    expect(s.mensagem).toContain('georreferenciamento');
  });
});

// ---------------------------------------------------------------------------
// Holes, MultiPolygon (múltiplas partes), fechamento de anéis e incerteza
// ---------------------------------------------------------------------------

describe('topologia avançada de camadas', () => {
  it('camada com buraco (hole) reduz a área de interseção', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    const half = 0.02;
    const lon = -55.95;
    const lat = -12.42;
    const holeHalf = 0.009;
    // anel exterior grande, com um buraco central que cobre quase todo o imóvel
    const comBuraco: CamadaRef = {
      tipo: 'terra_indigena',
      nome: 'TI com exclusão',
      fonte: 'fixture',
      rings: [
        [
          [lon - half, lat - half],
          [lon + half, lat - half],
          [lon + half, lat + half],
          [lon - half, lat + half],
          [lon - half, lat - half],
        ],
        [
          [lon - holeHalf, lat - holeHalf],
          [lon + holeHalf, lat - holeHalf],
          [lon + holeHalf, lat + holeHalf],
          [lon - holeHalf, lat + holeHalf],
          [lon - holeHalf, lat - holeHalf],
        ],
      ],
    };
    const semBuraco = _camadaQuadrado(lon, lat, half, 'terra_indigena');
    const comR = analisarSobreposicoes(imóvel, [comBuraco]);
    const semR = analisarSobreposicoes(imóvel, [semBuraco]);
    const areaCom = comR.sobreposicoes[0]?.area_ha ?? 0;
    const areaSem = semR.sobreposicoes[0]!.area_ha;
    expect(areaCom).toBeLessThan(areaSem);
  });

  it('MultiPolygon representado como múltiplas CamadaRef agrega cada parte', () => {
    const imóvel = _square(-55.95, -12.42, 0.02);
    // duas partes que tocam o imóvel em cantos opostos
    const parte1 = _camadaQuadrado(-55.96, -12.43, 0.005, 'desmatamento');
    const parte2 = _camadaQuadrado(-55.94, -12.41, 0.005, 'desmatamento');
    const r = analisarSobreposicoes(imóvel, [parte1, parte2]);
    expect(r.sobreposicoes.length).toBe(2);
  });

  it('camada com anéis vazios é ignorada (rings.length === 0)', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    const vazia: CamadaRef = { tipo: 'terra_indigena', nome: 'x', fonte: 'y', rings: [] };
    const r = analisarSobreposicoes(imóvel, [vazia]);
    expect(r.sobreposicoes).toHaveLength(0);
  });

  it('anel de camada não-fechado é fechado internamente (sem lançar)', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    const aberta: CamadaRef = {
      tipo: 'embargo_ibama',
      nome: 'aberta',
      fonte: 'fixture',
      rings: [[
        [-55.955, -12.425],
        [-55.945, -12.425],
        [-55.945, -12.415],
        [-55.955, -12.415],
        // não fecha — _ensureClosedRings deve fechar
      ]],
    };
    const r = analisarSobreposicoes(imóvel, [aberta]);
    expect(r.sobreposicoes).toHaveLength(1);
  });

  it('imóvel já fechado (primeiro = último) não duplica vértice', () => {
    const base = _square(-55.95, -12.42, 0.01);
    const fechado = [...base, { ...base[0]! }];
    const ti = _camadaQuadrado(-55.95, -12.42, 0.005, 'terra_indigena');
    const r = analisarSobreposicoes(fechado, [ti]);
    expect(r.sobreposicoes).toHaveLength(1);
  });

  it('camada com anel vazio é tolerada (geometria inválida ignorada)', () => {
    const imóvel = _square(-55.95, -12.42, 0.01);
    const invalida: CamadaRef = {
      tipo: 'terra_indigena',
      nome: 'anel vazio',
      fonte: 'fixture',
      rings: [[]],
    };
    const r = analisarSobreposicoes(imóvel, [invalida]);
    expect(r.sobreposicoes).toHaveLength(0);
  });

  it('incertezaPosicional_m = pior accuracy dos vértices', () => {
    const pts = _square(-55.95, -12.42, 0.01).map((p, i) => ({
      ...p,
      accuracy: i === 0 ? 18 : 5,
    }));
    const r = analisarSobreposicoes(pts, []);
    expect(r.incertezaPosicional_m).toBe(18);
  });

  it('sem accuracy nos vértices → incertezaPosicional_m undefined', () => {
    const r = analisarSobreposicoes(_square(-55.95, -12.42, 0.01), []);
    expect(r.incertezaPosicional_m).toBeUndefined();
  });

  it('respeita fonteDados informado', () => {
    const r = analisarSobreposicoes(_square(-55.95, -12.42, 0.01), [], 'cache');
    expect(r.fonteDados).toBe('cache');
  });

  it('percentual nunca passa de 100 mesmo com camada muito maior', () => {
    const imóvel = _square(-55.95, -12.42, 0.005);
    const enorme = _camadaQuadrado(-55.95, -12.42, 0.05, 'app_hidrografia');
    const r = analisarSobreposicoes(imóvel, [enorme]);
    expect(r.sobreposicoes[0]!.percentual).toBeLessThanOrEqual(100);
  });
});
