// Imóveis de DEMONSTRAÇÃO semeados no app quando o store está vazio.
//
// Por que existe: o app é offline-first e guarda os imóveis no AsyncStorage do
// dispositivo. Um rebuild/reinstale do app limpa esse container — e a Triagem do
// analista fica vazia ("Nada para validar"). Para a demo (e a parte de RE-METRAGEM
// do analista) ter sempre dados prontos, semeamos alguns imóveis fictícios na
// primeira execução. Tudo continua local; nada é enviado a nenhuma API.
//
// IMPORTANTE: dados FICTÍCIOS, exclusivos para demonstração offline.
import { areaHectares, perimeterM, type LngLat } from './geo';
import { DEMO_PERIMETRO_ANTERIOR } from './refLayers.demo';
import { DEMO_ROUTES } from '../sim/routes';
import type { ImovelGeometry, NovoImovel } from '../types';

/** Vértices de uma rota de demo pelo id (src/sim/routes.ts). */
function rota(id: string): LngLat[] {
  const r = DEMO_ROUTES.find((x) => x.id === id);
  if (!r) throw new Error(`rota de demo não encontrada: ${id}`);
  return r.vertices;
}

/** Monta a geometry derivando área (ha) e perímetro (m) dos vértices. */
function geo(vertices: LngLat[]): ImovelGeometry {
  return {
    points: vertices,
    area_ha: areaHectares(vertices),
    perimetro_m: perimeterM(vertices),
  };
}

/**
 * Imóveis de demonstração. Pensados para cobrir os cenários da Triagem:
 *   1) Re-demarcação CRÍTICA — tem geometryAnterior (baseline real); o delta
 *      acresce área que toca embargo/queimada → alerta "requer visita imediata"
 *      + sobreposições TI/Embargo/PRODES (camadas DEMO_CAMADAS de Sorriso/MT).
 *   2) Imóvel "limpo" pendente — floresta em Feliz Natal/MT, sem sobreposição.
 *   3) Imóvel já aprovado — cerrado no Oeste da Bahia (estado aprovado na lista).
 */
export const DEMO_IMOVEIS_SEED: NovoImovel[] = [
  {
    perfil: 'produtor',
    produtor: {
      nome: 'Raimundo Nonato da Silva',
      cpfCnpj: '123.456.789-00',
      telefone: '66999990001',
    },
    imovel: {
      nome: 'Fazenda Boa Esperança',
      municipio: 'Sorriso',
      uf: 'MT',
      matricula: '12.345',
      modulosFiscais: 4,
    },
    // Atual (re-demarcado, maior ao sul) × anterior (registrado, menor) → Δ +~7 ha.
    geometry: geo(rota('sorriso-soja')),
    geometryAnterior: geo(DEMO_PERIMETRO_ANTERIOR),
    documentos: [],
    status: 'enviado',
    // Informe automático do sistema: a medição (às cegas) divergiu do registro.
    alertaDivergencia: {
      detectadoEm: 0,
      delta_ha: 7.1,
      delta_pct: 22,
      severidade: 'critico',
      visto: false,
    },
    solicitacaoVisita: {
      solicitadaEm: 0,
      motivo: 'medicao',
      detalhe: 'Acréscimo de área ao sul após nova caminhada — pede conferência de terreno.',
    },
  },
  {
    perfil: 'produtor',
    produtor: {
      nome: 'Benedita Alves de Souza',
      cpfCnpj: '987.654.321-00',
      telefone: '66999990002',
    },
    imovel: {
      nome: 'Sítio Reserva Verde',
      municipio: 'Feliz Natal',
      uf: 'MT',
      matricula: '67.890',
      modulosFiscais: 2,
    },
    geometry: geo(rota('feliz-natal-floresta')),
    documentos: [],
    status: 'enviado',
  },
  {
    perfil: 'produtor',
    produtor: {
      nome: 'Cooperativa AgroOeste',
      cpfCnpj: '12.345.678/0001-90',
      telefone: '77999990003',
    },
    imovel: {
      nome: 'Sítio Cerrado Bahia',
      municipio: 'São Desidério',
      uf: 'BA',
      matricula: '24.680',
      modulosFiscais: 6,
    },
    geometry: geo(rota('oeste-bahia-cerrado')),
    documentos: [],
    status: 'enviado',
    validacao: { status: 'aprovado', analista: 'Analista', updatedAt: 0 },
  },
];
