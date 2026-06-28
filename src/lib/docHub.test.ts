import assert from 'node:assert';
import {
  documentosDisponiveis,
  mergeDocumentos,
  avaliarRegularidade,
  OBRIGATORIOS_CREDITO,
} from './docHub';
import type { Imovel, Documento } from '../types';

// Imóvel base de teste: tem carNumero, matrícula e geometria (3+ pontos).
function imovelBase(over: Partial<Imovel> = {}): Imovel {
  const base: Imovel = {
    id: 't1',
    perfil: 'produtor',
    produtor: { nome: 'Teste', cpfCnpj: '123.456.789-00' },
    imovel: { nome: 'Sítio Teste', municipio: 'Sorriso', uf: 'MT', matricula: '12.345', carNumero: 'MT-X-0001' },
    geometry: { points: [{ longitude: -55, latitude: -12 }, { longitude: -55.01, latitude: -12 }, { longitude: -55, latitude: -12.01 }], area_ha: 40, perimetro_m: 2600 },
    documentos: [],
    status: 'rascunho',
    createdAt: 0,
    updatedAt: 0,
  };
  return { ...base, ...over };
}

// 1) sync de imóvel com CAR + matrícula + geometria inclui os digitais esperados, sem caf/licenca
const disp = documentosDisponiveis(imovelBase());
const tipos = disp.map((d) => d.tipo).sort();
assert.deepStrictEqual(tipos, ['car', 'car-extrato', 'ccir', 'matricula', 'sigef'].sort());
assert.ok(disp.every((d) => d.origem === 'govbr' && d.orgao && d.uri === undefined), 'docs govbr são metadados');

// 2) merge não duplica tipo já presente (manual prevalece)
const manualMat: Documento = { id: 'm1', tipo: 'matricula', origem: 'manual', uri: 'file://x', nome: 'minha.pdf', createdAt: 0 };
const merged = mergeDocumentos([manualMat], disp);
const mats = merged.filter((d) => d.tipo === 'matricula');
assert.strictEqual(mats.length, 1, 'uma só matrícula');
assert.strictEqual(mats[0]!.origem, 'manual', 'manual prevalece');
// re-sync idempotente: mesclar de novo não cresce
assert.strictEqual(mergeDocumentos(merged, disp).length, merged.length, 're-sync não duplica');

// 3) regularidade: sem docs obrigatórios → pendente e impacta crédito
const r0 = avaliarRegularidade(imovelBase());
assert.deepStrictEqual(r0.docsObrigatoriosFaltando.sort(), [...OBRIGATORIOS_CREDITO].sort());
assert.notStrictEqual(r0.nivel, 'regular');
assert.strictEqual(r0.podeImpactarCredito, true);

// com todos os obrigatórios e sem área em risco → regular
const comDocs = imovelBase({ documentos: OBRIGATORIOS_CREDITO.map((t, i) => ({ id: `d${i}`, tipo: t, origem: 'govbr', orgao: 'x', nome: t, createdAt: 0 })) });
const rOk = avaliarRegularidade(comDocs);
assert.strictEqual(rOk.nivel, 'regular');
assert.strictEqual(rOk.podeImpactarCredito, false);
assert.strictEqual(rOk.haEmRisco, 0);

// 4) haEmRisco reflete alertaDivergencia.delta_ha
const rRisco = avaliarRegularidade(imovelBase({ alertaDivergencia: { detectadoEm: 0, delta_ha: 7.1, delta_pct: 22, severidade: 'critico', visto: false } }));
assert.strictEqual(rRisco.haEmRisco, 7.1);
assert.strictEqual(rRisco.nivel, 'critico');

console.log('docHub.test: OK');
