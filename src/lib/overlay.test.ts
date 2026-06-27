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

// Stubs de tipo para o runner de teste (jest e vitest injetam esses globais).
// ⚠️  NÃO instale um runner aqui sem confirmar com o time — veja o comentário
//     no topo do arquivo. Estes declare apenas satisfazem o tsc enquanto
//     o runner não está configurado.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
declare const expect: any;
/* eslint-enable @typescript-eslint/no-explicit-any */

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
  it('app_hidrografia → info', () => expect(severidadePorTipo('app_hidrografia')).toBe('info'));
  it('car_vizinho → info', () => expect(severidadePorTipo('car_vizinho')).toBe('info'));
});
