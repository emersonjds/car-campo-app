// Testes do motor de aptidão de crédito rural (credito.ts).
import { describe, it, expect } from 'vitest';
import { avaliarCredito } from './credito';
import type { AnaliseAmbiental, Sobreposicao, CamadaTipo, Severidade } from './overlay';
import type { Imovel } from '../types';
import type { LngLat } from './geo';

// --- Factories -------------------------------------------------------------

function squarePoints(half: number, lon = -55.95, lat = -12.42): LngLat[] {
  return [
    { longitude: lon - half, latitude: lat - half },
    { longitude: lon + half, latitude: lat - half },
    { longitude: lon + half, latitude: lat + half },
    { longitude: lon - half, latitude: lat + half },
  ];
}

function makeImovel(opts: {
  cpfCnpj?: string;
  modulosFiscais?: number;
  half?: number;
} = {}): Imovel {
  const points = squarePoints(opts.half ?? 0.01);
  return {
    id: 'i1',
    perfil: 'produtor',
    produtor: { nome: 'Fulano', cpfCnpj: opts.cpfCnpj ?? '12345678901' },
    imovel: {
      nome: 'Fazenda Teste',
      municipio: 'Sorriso',
      uf: 'MT',
      modulosFiscais: opts.modulosFiscais,
    },
    geometry: { points, area_ha: 0, perimetro_m: 0 },
    documentos: [],
    status: 'rascunho',
    createdAt: 0,
    updatedAt: 0,
  };
}

function sobrep(
  tipo: CamadaTipo,
  severidade: Severidade,
  percentual: number,
  area_ha = 10,
): Sobreposicao {
  return {
    tipo,
    nome: `Camada ${tipo}`,
    fonte: 'fixture',
    area_ha,
    percentual,
    severidade,
    mensagem: `msg ${tipo}`,
  };
}

function makeAnalise(sobreposicoes: Sobreposicao[]): AnaliseAmbiental {
  return {
    ok: !sobreposicoes.some((s) => s.severidade === 'critico'),
    sobreposicoes,
    areaImovel_ha: 100,
    geradoEm: new Date().toISOString(),
    fonteDados: 'offline-demo',
  };
}

// --- Bloqueios críticos ----------------------------------------------------

describe('bloqueios críticos → elegivelGeral false e score baixo', () => {
  it('embargo IBAMA bloqueia, score <= 30, linhas inaptas', () => {
    const r = avaliarCredito(makeAnalise([sobrep('embargo_ibama', 'critico', 10)]), makeImovel());
    expect(r.elegivelGeral).toBe(false);
    expect(r.score).toBeLessThanOrEqual(30);
    expect(r.bloqueios.some((b) => b.includes('Embargo IBAMA'))).toBe(true);
    expect(r.linhas.every((l) => l.apto === false)).toBe(true);
    expect(r.linhas.every((l) => l.tetoEstimado_BRL === undefined)).toBe(true);
  });

  it('terra indígena gera bloqueio constitucional', () => {
    const r = avaliarCredito(makeAnalise([sobrep('terra_indigena', 'critico', 15)]), makeImovel());
    expect(r.elegivelGeral).toBe(false);
    expect(r.bloqueios.some((b) => b.includes('Terra Indígena'))).toBe(true);
  });

  it('unidade de conservação gera bloqueio SNUC', () => {
    const r = avaliarCredito(makeAnalise([sobrep('unidade_conservacao', 'critico', 20)]), makeImovel());
    expect(r.elegivelGeral).toBe(false);
    expect(r.bloqueios.some((b) => b.includes('Unidade de Conservação'))).toBe(true);
  });

  it('tipo crítico não mapeado (desmatamento dinâmico) usa bloqueio genérico', () => {
    // desmatamento elevado a 'critico' pela severidade dinâmica
    const r = avaliarCredito(makeAnalise([sobrep('desmatamento', 'critico', 35)]), makeImovel());
    expect(r.elegivelGeral).toBe(false);
    expect(r.bloqueios.length).toBe(1);
    expect(r.bloqueios[0]).toContain('sobreposição crítica');
  });
});

// --- Score -----------------------------------------------------------------

describe('score', () => {
  it('sem sobreposições → score 100, elegível', () => {
    const r = avaliarCredito(makeAnalise([]), makeImovel());
    expect(r.score).toBe(100);
    expect(r.elegivelGeral).toBe(true);
  });

  it('desmatamento (alerta) penaliza o score', () => {
    const r = avaliarCredito(makeAnalise([sobrep('desmatamento', 'alerta', 10)]), makeImovel());
    expect(r.score).toBeLessThan(100);
    expect(r.elegivelGeral).toBe(true);
  });

  it('queimada (alerta) penaliza o score e gera recomendação', () => {
    const r = avaliarCredito(makeAnalise([sobrep('queimada', 'alerta', 10)]), makeImovel());
    expect(r.score).toBeLessThan(100);
    expect(r.recomendacoes.some((x) => x.includes('queimada'))).toBe(true);
  });

  it('info penaliza pouco', () => {
    const r = avaliarCredito(makeAnalise([sobrep('app_hidrografia', 'info', 5)]), makeImovel());
    expect(r.score).toBeLessThan(100);
    expect(r.score).toBeGreaterThanOrEqual(95);
  });

  it('score nunca fica negativo (penalidades acumuladas)', () => {
    const muitas = [
      sobrep('embargo_ibama', 'critico', 100),
      sobrep('terra_indigena', 'critico', 100),
      sobrep('desmatamento', 'alerta', 100),
      sobrep('queimada', 'alerta', 100),
      sobrep('app_hidrografia', 'info', 100),
    ];
    const r = avaliarCredito(makeAnalise(muitas), makeImovel());
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

// --- Pronaf ----------------------------------------------------------------

describe('Pronaf por módulos fiscais', () => {
  it('mf <= 4 → apto com teto', () => {
    const r = avaliarCredito(makeAnalise([]), makeImovel({ modulosFiscais: 3, half: 0.003 }));
    const pronaf = r.linhas.find((l) => l.id === 'pronaf')!;
    expect(pronaf.apto).toBe(true);
    expect(pronaf.tetoEstimado_BRL).toBeGreaterThan(0);
    expect(pronaf.tetoEstimado_BRL).toBeLessThanOrEqual(415_000);
  });

  it('mf > 4 → inapto sem teto', () => {
    const r = avaliarCredito(makeAnalise([]), makeImovel({ modulosFiscais: 10 }));
    const pronaf = r.linhas.find((l) => l.id === 'pronaf')!;
    expect(pronaf.apto).toBe(false);
    expect(pronaf.tetoEstimado_BRL).toBeUndefined();
  });

  it('mf ausente, área pequena → estimativa apto', () => {
    // área ~43 ha → ~2 MF (ref 20 ha/MF) <= 4 → apto
    const r = avaliarCredito(makeAnalise([]), makeImovel({ half: 0.003 }));
    const pronaf = r.linhas.find((l) => l.id === 'pronaf')!;
    expect(pronaf.apto).toBe(true);
    expect(pronaf.motivo).toContain('MF');
    expect(pronaf.tetoEstimado_BRL).toBeGreaterThan(0);
  });

  it('mf ausente, área grande → estimativa inapto', () => {
    // área ~480 ha → ~24 MF > 4 → inapto
    const r = avaliarCredito(makeAnalise([]), makeImovel({ half: 0.01 }));
    const pronaf = r.linhas.find((l) => l.id === 'pronaf')!;
    expect(pronaf.apto).toBe(false);
    expect(pronaf.tetoEstimado_BRL).toBeUndefined();
  });
});

// --- Pronampe --------------------------------------------------------------

describe('Pronampe Rural CPF vs CNPJ', () => {
  it('CNPJ → apto com teto', () => {
    const r = avaliarCredito(makeAnalise([]), makeImovel({ cpfCnpj: '11222333000181' }));
    const p = r.linhas.find((l) => l.id === 'pronampe_rural')!;
    expect(p.apto).toBe(true);
    expect(p.tetoEstimado_BRL).toBeGreaterThan(0);
    expect(p.tetoEstimado_BRL).toBeLessThanOrEqual(150_000);
  });

  it('CPF → inapto, orienta formalização', () => {
    const r = avaliarCredito(makeAnalise([]), makeImovel({ cpfCnpj: '12345678901' }));
    const p = r.linhas.find((l) => l.id === 'pronampe_rural')!;
    expect(p.apto).toBe(false);
    expect(p.motivo).toContain('MEI');
  });
});

// --- Custeio / Investimento ------------------------------------------------

describe('Custeio e Investimento', () => {
  it('sem bloqueio → ambos aptos com teto', () => {
    const r = avaliarCredito(makeAnalise([]), makeImovel());
    const custeio = r.linhas.find((l) => l.id === 'custeio')!;
    const invest = r.linhas.find((l) => l.id === 'investimento')!;
    expect(custeio.apto).toBe(true);
    expect(custeio.tetoEstimado_BRL).toBeGreaterThan(0);
    expect(invest.apto).toBe(true);
    expect(invest.tetoEstimado_BRL).toBeGreaterThan(0);
  });

  it('com bloqueio → ambos inaptos', () => {
    const r = avaliarCredito(makeAnalise([sobrep('embargo_ibama', 'critico', 5)]), makeImovel());
    expect(r.linhas.find((l) => l.id === 'custeio')!.apto).toBe(false);
    expect(r.linhas.find((l) => l.id === 'investimento')!.apto).toBe(false);
  });
});

// --- Recomendações ---------------------------------------------------------

describe('recomendações', () => {
  it('gera recs para cada tipo de sobreposição', () => {
    const sobreposicoes = [
      sobrep('embargo_ibama', 'critico', 5),
      sobrep('terra_indigena', 'critico', 5),
      sobrep('unidade_conservacao', 'critico', 5),
      sobrep('desmatamento', 'alerta', 5),
      sobrep('queimada', 'alerta', 5),
      sobrep('app_hidrografia', 'info', 5),
    ];
    const r = avaliarCredito(makeAnalise(sobreposicoes), makeImovel({ modulosFiscais: 2 }));
    const txt = r.recomendacoes.join(' | ');
    expect(txt).toContain('Embargo IBAMA');
    expect(txt).toContain('Terra Indígena');
    expect(txt).toContain('Proteção Integral');
    expect(txt).toContain('Desmatamento');
    expect(txt).toContain('queimada');
    expect(txt).toContain('APP');
  });

  it('sem módulos fiscais → recomenda CCIR', () => {
    const r = avaliarCredito(makeAnalise([]), makeImovel());
    expect(r.recomendacoes.some((x) => x.includes('Módulos fiscais'))).toBe(true);
  });

  it('CPF → recomenda formalização MEI', () => {
    const r = avaliarCredito(makeAnalise([]), makeImovel({ cpfCnpj: '12345678901' }));
    expect(r.recomendacoes.some((x) => x.includes('MEI Rural'))).toBe(true);
  });

  it('sem bloqueio → recomenda DAP/CAF e banco', () => {
    const r = avaliarCredito(makeAnalise([]), makeImovel({ modulosFiscais: 2, cpfCnpj: '11222333000181' }));
    const txt = r.recomendacoes.join(' | ');
    expect(txt).toContain('DAP/CAF');
    expect(txt).toContain('banco credenciado');
  });

  it('área < 1 ha → recomenda microcrédito', () => {
    const r = avaliarCredito(makeAnalise([]), makeImovel({ half: 0.0004, modulosFiscais: 1 }));
    expect(r.recomendacoes.some((x) => x.includes('microcrédito'))).toBe(true);
  });

  it('com bloqueio crítico → não recomenda DAP/CAF', () => {
    const r = avaliarCredito(
      makeAnalise([sobrep('terra_indigena', 'critico', 10)]),
      makeImovel({ modulosFiscais: 2 }),
    );
    expect(r.recomendacoes.some((x) => x.includes('DAP/CAF'))).toBe(false);
  });
});

// --- Disclaimer ------------------------------------------------------------

describe('disclaimer', () => {
  it('sempre presente, com bloqueio ou sem', () => {
    const comBloqueio = avaliarCredito(makeAnalise([sobrep('embargo_ibama', 'critico', 5)]), makeImovel());
    const semBloqueio = avaliarCredito(makeAnalise([]), makeImovel());
    expect(comBloqueio.disclaimer).toContain('Manual de Crédito Rural');
    expect(semBloqueio.disclaimer).toContain('Manual de Crédito Rural');
    expect(semBloqueio.disclaimer.length).toBeGreaterThan(50);
  });
});
