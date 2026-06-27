// Testes unitários das utilidades geoespaciais (geo.ts).
import { describe, it, expect } from 'vitest';
import {
  ringAreaM2,
  areaHectares,
  distanceM,
  perimeterM,
  toGeoJSONFeature,
  interpolate,
  bearingDeg,
  destinationPoint,
  selfIntersects,
  simplifyRDP,
  validatePerimeter,
  type LngLat,
} from './geo';

// Quadrado de ~100 m de lado em latitude -12° → ≈ 1 ha.
function square(lon: number, lat: number, half: number): LngLat[] {
  return [
    { longitude: lon - half, latitude: lat - half },
    { longitude: lon + half, latitude: lat - half },
    { longitude: lon + half, latitude: lat + half },
    { longitude: lon - half, latitude: lat + half },
  ];
}

describe('ringAreaM2 / areaHectares', () => {
  it('retorna 0 para menos de 3 pontos', () => {
    expect(ringAreaM2([])).toBe(0);
    expect(ringAreaM2([{ longitude: 0, latitude: 0 }])).toBe(0);
    expect(ringAreaM2([{ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 1 }])).toBe(0);
  });

  it('quadrado de ~100 m → ≈ 1 ha', () => {
    const ha = areaHectares(square(-55.95, -12.42, 0.00045));
    expect(ha).toBeGreaterThan(0.95);
    expect(ha).toBeLessThan(1.05);
  });

  it('área é sempre positiva (valor absoluto) independente da orientação', () => {
    const cw = [...square(-55.95, -12.42, 0.001)].reverse();
    expect(ringAreaM2(cw)).toBeGreaterThan(0);
  });
});

describe('distanceM', () => {
  it('mesmo ponto → 0', () => {
    expect(distanceM({ longitude: -55, latitude: -12 }, { longitude: -55, latitude: -12 })).toBe(0);
  });

  it('1 grau de latitude ≈ 111 km', () => {
    const d = distanceM({ longitude: 0, latitude: 0 }, { longitude: 0, latitude: 1 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe('perimeterM', () => {
  it('retorna 0 com menos de 2 pontos', () => {
    expect(perimeterM([])).toBe(0);
    expect(perimeterM([{ longitude: 0, latitude: 0 }])).toBe(0);
  });

  it('perímetro de quadrado ~100 m ≈ 400 m', () => {
    const p = perimeterM(square(-55.95, -12.42, 0.00045));
    expect(p).toBeGreaterThan(350);
    expect(p).toBeLessThan(450);
  });
});

describe('toGeoJSONFeature', () => {
  it('lança erro com menos de 3 pontos', () => {
    expect(() => toGeoJSONFeature([{ longitude: 0, latitude: 0 }])).toThrow();
  });

  it('fecha o anel automaticamente e calcula propriedades', () => {
    const f = toGeoJSONFeature(square(-55.95, -12.42, 0.001), { id: 'x' });
    expect(f.type).toBe('Feature');
    expect(f.geometry.type).toBe('Polygon');
    const ring = f.geometry.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]); // anel fechado
    expect(f.properties.vertices).toBe(4);
    expect((f.properties as Record<string, unknown>).id).toBe('x');
    expect(typeof f.properties.area_ha).toBe('number');
    expect(typeof f.properties.perimetro_m).toBe('number');
  });

  it('não duplica fechamento quando já fechado', () => {
    const pts = square(-55.95, -12.42, 0.001);
    const closed = [...pts, { ...pts[0]! }];
    const f = toGeoJSONFeature(closed);
    const ring = f.geometry.coordinates[0]!;
    // já estava fechado: comprimento = pontos de entrada (não acrescenta outro)
    expect(ring.length).toBe(closed.length);
  });
});

describe('interpolate', () => {
  it('t=0 → a, t=1 → b, t=0.5 → meio', () => {
    const a: LngLat = { longitude: 0, latitude: 0 };
    const b: LngLat = { longitude: 10, latitude: 20 };
    expect(interpolate(a, b, 0)).toEqual({ longitude: 0, latitude: 0 });
    expect(interpolate(a, b, 1)).toEqual({ longitude: 10, latitude: 20 });
    expect(interpolate(a, b, 0.5)).toEqual({ longitude: 5, latitude: 10 });
  });
});

describe('bearingDeg', () => {
  it('norte ≈ 0°', () => {
    const b = bearingDeg({ longitude: 0, latitude: 0 }, { longitude: 0, latitude: 1 });
    expect(b).toBeCloseTo(0, 1);
  });

  it('leste ≈ 90°', () => {
    const b = bearingDeg({ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 });
    expect(b).toBeGreaterThan(89);
    expect(b).toBeLessThan(91);
  });

  it('resultado normalizado em [0, 360)', () => {
    const b = bearingDeg({ longitude: 0, latitude: 0 }, { longitude: -1, latitude: 0 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
    expect(b).toBeCloseTo(270, 0);
  });
});

describe('destinationPoint', () => {
  it('deslocamento ao norte aumenta a latitude', () => {
    const d = destinationPoint({ longitude: 0, latitude: 0 }, 0, 1000);
    expect(d.latitude).toBeGreaterThan(0);
    expect(d.longitude).toBeCloseTo(0, 5);
  });

  it('round-trip: distância gerada bate (≈ 100 m)', () => {
    const from: LngLat = { longitude: -55.95, latitude: -12.42 };
    const to = destinationPoint(from, 45, 100);
    expect(distanceM(from, to)).toBeGreaterThan(95);
    expect(distanceM(from, to)).toBeLessThan(105);
  });

  it('normaliza longitude para [-180, 180]', () => {
    const d = destinationPoint({ longitude: 179.999, latitude: 0 }, 90, 1000);
    expect(d.longitude).toBeGreaterThanOrEqual(-180);
    expect(d.longitude).toBeLessThanOrEqual(180);
  });
});

describe('selfIntersects', () => {
  it('triângulo (n<4) nunca tem auto-interseção', () => {
    expect(selfIntersects([
      { longitude: 0, latitude: 0 },
      { longitude: 1, latitude: 0 },
      { longitude: 0, latitude: 1 },
    ])).toBe(false);
  });

  it('quadrado simples → sem auto-interseção', () => {
    expect(selfIntersects(square(-55.95, -12.42, 0.001))).toBe(false);
  });

  it('laço (bowtie) → auto-interseção verdadeira', () => {
    // gravata-borboleta: ordem cruzada
    const bowtie: LngLat[] = [
      { longitude: 0, latitude: 0 },
      { longitude: 1, latitude: 1 },
      { longitude: 1, latitude: 0 },
      { longitude: 0, latitude: 1 },
    ];
    expect(selfIntersects(bowtie)).toBe(true);
  });

  it('pentágono convexo → sem auto-interseção (percorre fallthrough degenerado)', () => {
    const pent: LngLat[] = [
      { longitude: 0, latitude: 0 },
      { longitude: 2, latitude: 0 },
      { longitude: 3, latitude: 2 },
      { longitude: 1, latitude: 3 },
      { longitude: -1, latitude: 2 },
    ];
    expect(selfIntersects(pent)).toBe(false);
  });

  it('segmento colinear sobreposto (endpoint sobre aresta) → auto-interseção', () => {
    // s0 = (0,0)->(3,0); s2 = (1,0)->(1,3): vértice (1,0) está sobre s0
    const ring: LngLat[] = [
      { longitude: 0, latitude: 0 },
      { longitude: 3, latitude: 0 },
      { longitude: 1, latitude: 0 },
      { longitude: 1, latitude: 3 },
    ];
    expect(selfIntersects(ring)).toBe(true);
  });

  it('segmentos totalmente colineares e sobrepostos → _onSegment decide', () => {
    // s0=(0,0)->(4,0) e s2=(1,0)->(2,0): ambos sobre y=0, todos os orient()=0,
    // forçando a avaliação de _onSegment (não a interseção própria)
    const ring: LngLat[] = [
      { longitude: 0, latitude: 0 },
      { longitude: 4, latitude: 0 },
      { longitude: 1, latitude: 0 },
      { longitude: 2, latitude: 0 },
    ];
    expect(selfIntersects(ring)).toBe(true);
  });

  it('detecta caso colinear/ponto-sobre-segmento', () => {
    // vértice extra colinear sobre uma aresta forma toque degenerado
    const ring: LngLat[] = [
      { longitude: 0, latitude: 0 },
      { longitude: 2, latitude: 0 },
      { longitude: 2, latitude: 2 },
      { longitude: 1, latitude: 0 }, // colinear com a aresta de base
      { longitude: 0, latitude: 2 },
    ];
    expect(selfIntersects(ring)).toBe(true);
  });
});

describe('simplifyRDP', () => {
  it('retorna cópia para <= 2 pontos', () => {
    const pts: LngLat[] = [{ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 1 }];
    const out = simplifyRDP(pts);
    expect(out).toEqual(pts);
    expect(out).not.toBe(pts);
  });

  it('remove ponto quase colinear dentro da tolerância', () => {
    const pts: LngLat[] = [
      { longitude: 0, latitude: 0 },
      { longitude: 0.0000001, latitude: 0.5 }, // desvio sub-métrico
      { longitude: 0, latitude: 1 },
    ];
    const out = simplifyRDP(pts, 3);
    expect(out.length).toBe(2);
    expect(out[0]).toEqual(pts[0]);
    expect(out[1]).toEqual(pts[2]);
  });

  it('preserva ponto que excede a tolerância', () => {
    const pts: LngLat[] = [
      { longitude: 0, latitude: 0 },
      { longitude: 0.01, latitude: 0.5 }, // grande desvio (>1 km)
      { longitude: 0, latitude: 1 },
    ];
    const out = simplifyRDP(pts, 3);
    expect(out.length).toBe(3);
  });

  it('segmento degenerado (início = fim) usa distância ao ponto', () => {
    // primeiro e último idênticos → _perpDistM cai no ramo lenSq===0
    const pts: LngLat[] = [
      { longitude: 0, latitude: 0 },
      { longitude: 0, latitude: 0.01 }, // ponto distante (~1 km)
      { longitude: 0, latitude: 0 },
    ];
    const out = simplifyRDP(pts, 3);
    expect(out.length).toBe(3);
  });

  it('escolhe o vértice de maior desvio entre vários (ramo d <= maxDist)', () => {
    const pts: LngLat[] = [
      { longitude: 0, latitude: 0 },
      { longitude: 0.02, latitude: 0.3 }, // desvio maior
      { longitude: 0.0001, latitude: 0.6 }, // desvio menor (não vira max)
      { longitude: 0, latitude: 1 },
    ];
    const out = simplifyRDP(pts, 3);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[3]);
  });
});

describe('validatePerimeter', () => {
  it('menos de 3 pontos → bloqueia (retorno antecipado)', () => {
    const r = validatePerimeter([{ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 1 }]);
    expect(r.ok).toBe(false);
    expect(r.problemas.length).toBe(1);
    expect(r.avisos).toHaveLength(0);
  });

  it('auto-interseção → problema bloqueante', () => {
    const bowtie: LngLat[] = [
      { longitude: 0, latitude: 0 },
      { longitude: 1, latitude: 1 },
      { longitude: 1, latitude: 0 },
      { longitude: 0, latitude: 1 },
    ];
    const r = validatePerimeter(bowtie);
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => p.includes('cruza'))).toBe(true);
  });

  it('área ~0 (colinear) → problema bloqueante', () => {
    const collinear: LngLat[] = [
      { longitude: 0, latitude: 0 },
      { longitude: 0.001, latitude: 0 },
      { longitude: 0.002, latitude: 0 },
    ];
    const r = validatePerimeter(collinear);
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => p.includes('praticamente zero'))).toBe(true);
  });

  it('quadrado válido grande → ok, sem avisos', () => {
    const r = validatePerimeter(square(-55.95, -12.42, 0.01)); // muitos hectares
    expect(r.ok).toBe(true);
    expect(r.problemas).toHaveLength(0);
    expect(r.avisos).toHaveLength(0);
  });

  it('área pequena (1m²..1000m²) → aviso de área pequena', () => {
    // half ~0.00005° → lado ~11 m → área ~120 m²
    const r = validatePerimeter(square(-55.95, -12.42, 0.00005));
    expect(r.ok).toBe(true);
    expect(r.avisos.some((a) => a.includes('muito pequena'))).toBe(true);
  });

  it('perímetro < 10 m → aviso de ruído de GPS', () => {
    // quadrado minúsculo mas com área >= 1 m²: half 0.000009° → lado ~2 m, perim ~8 m, área ~4 m²
    const r = validatePerimeter(square(-55.95, -12.42, 0.000009));
    expect(r.avisos.some((a) => a.includes('menor que 10 m'))).toBe(true);
  });

  it('accuracy > 20 m em vértices → aviso de precisão', () => {
    const pts = square(-55.95, -12.42, 0.01).map((p, i) => ({
      ...p,
      accuracy: i === 0 ? 35 : 5,
    }));
    const r = validatePerimeter(pts);
    expect(r.avisos.some((a) => a.includes('precisão de GPS acima de 20 m'))).toBe(true);
  });
});
