// Testes do helper de alteração de perímetro (telas do analista).
import { describe, it, expect } from 'vitest';
import {
  analisarAlteracaoImovel,
  decisaoSugerida,
  pesoSeveridade,
  resolverBaselineProdutor,
} from './alteracao';
import type { LngLat } from './geo';
import { DEMO_CAMADAS, DEMO_PERIMETRO_ANTERIOR } from './refLayers.demo';
import { DEMO_ROUTES } from '../sim/routes';
import type { Imovel, ImovelGeometry } from '../types';
import { areaHectares, perimeterM } from './geo';

function geom(points: LngLat[]): ImovelGeometry {
  return { points, area_ha: areaHectares(points), perimetro_m: perimeterM(points) };
}

function mkImovel(points: LngLat[], anterior?: LngLat[]): Imovel {
  return {
    id: 'im_test',
    perfil: 'produtor',
    produtor: { nome: 'Teste', cpfCnpj: '000' },
    imovel: { nome: 'Imóvel teste', municipio: 'Sorriso', uf: 'MT' },
    geometry: geom(points),
    geometryAnterior: anterior ? geom(anterior) : undefined,
    documentos: [],
    status: 'rascunho',
    createdAt: 0,
    updatedAt: 0,
  };
}

const sorriso = DEMO_ROUTES.find((r) => r.id === 'sorriso-soja')!.vertices;

describe('analisarAlteracaoImovel', () => {
  it('null quando geometry tem menos de 3 pontos', () => {
    const im = mkImovel([{ longitude: -55.95, latitude: -12.42 }]);
    expect(analisarAlteracaoImovel(im, DEMO_CAMADAS)).toBeNull();
  });

  it('baseline = real quando há geometryAnterior', () => {
    const im = mkImovel(sorriso, DEMO_PERIMETRO_ANTERIOR);
    const a = analisarAlteracaoImovel(im, DEMO_CAMADAS, 'offline-demo');
    expect(a).not.toBeNull();
    expect(a!.baseline).toBe('real');
    expect(a!.anteriorPoints).toEqual(DEMO_PERIMETRO_ANTERIOR);
    expect(a!.relatorio.delta_ha).toBeGreaterThan(0); // novo é maior
  });

  it('baseline = demo quando sem histórico mas próximo de Sorriso', () => {
    const im = mkImovel(sorriso); // sem geometryAnterior
    const a = analisarAlteracaoImovel(im, DEMO_CAMADAS, 'offline-demo');
    expect(a).not.toBeNull();
    expect(a!.baseline).toBe('demo');
    expect(a!.anteriorPoints).toEqual(DEMO_PERIMETRO_ANTERIOR);
  });

  it('null quando sem histórico e longe da área de demo', () => {
    // Polígono no oceano Atlântico — longe de Sorriso/MT
    const longe: LngLat[] = [
      { longitude: -30.0, latitude: 0.0 },
      { longitude: -30.0 + 0.01, latitude: 0.0 },
      { longitude: -30.0 + 0.01, latitude: 0.01 },
      { longitude: -30.0, latitude: 0.01 },
    ];
    const im = mkImovel(longe);
    expect(analisarAlteracaoImovel(im, DEMO_CAMADAS)).toBeNull();
  });

  it('requerVisita true para a demo Sorriso (acréscimo toca embargo/queimada)', () => {
    const im = mkImovel(sorriso, DEMO_PERIMETRO_ANTERIOR);
    const a = analisarAlteracaoImovel(im, DEMO_CAMADAS, 'offline-demo')!;
    expect(a.relatorio.requerVisita).toBe(true);
  });
});

describe('decisaoSugerida', () => {
  it('crítico → alerta com prazo de 5 dias', () => {
    const d = decisaoSugerida('critico');
    expect(d.tone).toBe('alerta');
    expect(d.prazo).toBe('5 dias');
  });
  it('alto → aviso com prazo de 15 dias', () => {
    expect(decisaoSugerida('alto').prazo).toBe('15 dias');
  });
  it('médio → aviso sem prazo', () => {
    const d = decisaoSugerida('medio');
    expect(d.tone).toBe('aviso');
    expect(d.prazo).toBeNull();
  });
  it('baixo → ok sem prazo', () => {
    const d = decisaoSugerida('baixo');
    expect(d.tone).toBe('ok');
    expect(d.prazo).toBeNull();
  });
});

describe('resolverBaselineProdutor', () => {
  const longe: LngLat[] = [
    { longitude: -30.0, latitude: 0.0 },
    { longitude: -29.99, latitude: 0.0 },
    { longitude: -29.99, latitude: 0.01 },
    { longitude: -30.0, latitude: 0.01 },
  ];

  it('origem = real quando há geometria registrada (>= 3 pontos)', () => {
    const b = resolverBaselineProdutor(DEMO_PERIMETRO_ANTERIOR, sorriso);
    expect(b).not.toBeNull();
    expect(b!.origem).toBe('real');
    expect(b!.points).toEqual(DEMO_PERIMETRO_ANTERIOR);
  });

  it('origem = demo quando sem registro mas a caminhada está em Sorriso', () => {
    const b = resolverBaselineProdutor(undefined, sorriso);
    expect(b).not.toBeNull();
    expect(b!.origem).toBe('demo');
  });

  it('null quando sem registro e a caminhada está longe da demo', () => {
    expect(resolverBaselineProdutor(undefined, longe)).toBeNull();
  });

  it('null quando sem registro e a caminhada tem menos de 3 pontos', () => {
    expect(resolverBaselineProdutor(undefined, [{ longitude: -55.95, latitude: -12.42 }])).toBeNull();
  });

  it('ignora registrado com menos de 3 pontos e cai no baseline de demo', () => {
    const b = resolverBaselineProdutor([{ longitude: -55.95, latitude: -12.42 }], sorriso);
    expect(b!.origem).toBe('demo');
  });
});

describe('pesoSeveridade', () => {
  it('ordena critico > alto > medio > baixo', () => {
    expect(pesoSeveridade('critico')).toBeGreaterThan(pesoSeveridade('alto'));
    expect(pesoSeveridade('alto')).toBeGreaterThan(pesoSeveridade('medio'));
    expect(pesoSeveridade('medio')).toBeGreaterThan(pesoSeveridade('baixo'));
  });
});
