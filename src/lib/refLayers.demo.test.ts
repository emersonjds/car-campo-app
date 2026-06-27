// Testes das fixtures de demo (refLayers.demo.ts).
import { describe, it, expect } from 'vitest';
import { DEMO_CAMADAS } from './refLayers.demo';

describe('DEMO_CAMADAS', () => {
  it('existe e contém as 5 fixtures esperadas', () => {
    expect(Array.isArray(DEMO_CAMADAS)).toBe(true);
    expect(DEMO_CAMADAS).toHaveLength(5);
  });

  it('contém a fixture de queimada (AQ1km)', () => {
    const q = DEMO_CAMADAS.find((c) => c.tipo === 'queimada');
    expect(q).toBeDefined();
    expect(q!.nome).toContain('queimada');
    expect(q!.fonte).toContain('Queimadas');
  });

  it('cobre todos os tipos demo (TI, embargo, desmatamento, queimada, APP)', () => {
    const tipos = DEMO_CAMADAS.map((c) => c.tipo).sort();
    expect(tipos).toEqual(
      ['app_hidrografia', 'desmatamento', 'embargo_ibama', 'queimada', 'terra_indigena'].sort(),
    );
  });

  it('cada camada tem ao menos um anel fechado com >= 4 pontos', () => {
    for (const c of DEMO_CAMADAS) {
      expect(c.rings.length).toBeGreaterThan(0);
      const ring = c.rings[0]!;
      expect(ring.length).toBeGreaterThanOrEqual(4);
      expect(ring[0]).toEqual(ring[ring.length - 1]); // fechado
    }
  });

  it('todas as geometrias estão na região de Sorriso/MT', () => {
    for (const c of DEMO_CAMADAS) {
      for (const [lon, lat] of c.rings[0]!) {
        expect(lon).toBeGreaterThan(-56);
        expect(lon).toBeLessThan(-55.9);
        expect(lat).toBeGreaterThan(-12.43);
        expect(lat).toBeLessThan(-12.41);
      }
    }
  });
});
