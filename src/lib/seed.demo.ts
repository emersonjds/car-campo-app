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
// Datas fixas (epoch ms) para a demo — evita "agora" não-determinístico nos seeds.
const D = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

export const DEMO_IMOVEIS_SEED: NovoImovel[] = [
  {
    perfil: 'produtor',
    produtor: {
      nome: 'José da Silva',
      cpfCnpj: '123.456.789-00',
      telefone: '66999990001',
    },
    imovel: {
      nome: 'Sítio Boa Esperança',
      municipio: 'Sorriso',
      uf: 'MT',
      matricula: '12.345',
      modulosFiscais: 4,
      uso: 'Soja',
      carNumero: 'MT-5107925-A1B2.C3D4.E5F6.0001',
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
    // Técnico que foi a campo refazer a metragem e acompanhou o produtor.
    visitaAgendada: {
      agendadaEm: D(2026, 5, 12),
      dataVisita: D(2026, 5, 20),
      periodo: 'manha',
      horario: '08:00',
      analista: 'Eng. Agr. Marcos Tavares (SEMA-MT)',
      observacao: 'Reconferência do perímetro sul junto ao produtor.',
    },
  },
  {
    perfil: 'produtor',
    produtor: {
      nome: 'José da Silva',
      cpfCnpj: '123.456.789-00',
      telefone: '66999990001',
    },
    imovel: {
      nome: 'Sítio Reserva Verde',
      municipio: 'Feliz Natal',
      uf: 'MT',
      matricula: '67.890',
      modulosFiscais: 2,
      uso: 'Pecuária',
      carNumero: 'MT-5103601-7788.99AA.BBCC.0002',
    },
    geometry: geo(rota('feliz-natal-floresta')),
    documentos: [],
    status: 'enviado',
  },
  {
    perfil: 'produtor',
    produtor: {
      nome: 'José da Silva',
      cpfCnpj: '123.456.789-00',
      telefone: '66999990001',
    },
    imovel: {
      nome: 'Sítio Cerrado Bahia',
      municipio: 'São Desidério',
      uf: 'BA',
      matricula: '24.680',
      modulosFiscais: 6,
      uso: 'Soja irrigada',
      carNumero: 'BA-2922656-1122.3344.5566.0003',
    },
    geometry: geo(rota('oeste-bahia-cerrado')),
    documentos: [],
    status: 'enviado',
    validacao: { status: 'aprovado', analista: 'Téc. Amb. Luiza Prado', updatedAt: D(2026, 4, 8) },
    visitaAgendada: {
      agendadaEm: D(2026, 3, 28),
      dataVisita: D(2026, 4, 5),
      periodo: 'tarde',
      horario: '14:00',
      analista: 'Téc. Amb. Luiza Prado',
      observacao: 'Conferência de campo concluída — perímetro aprovado.',
    },
  },
  {
    perfil: 'produtor',
    produtor: {
      nome: 'José da Silva',
      cpfCnpj: '123.456.789-00',
      telefone: '66999990001',
    },
    imovel: {
      nome: 'Fazenda Santa Luzia',
      municipio: 'Sorriso',
      uf: 'MT',
      matricula: '33.221',
      modulosFiscais: 5,
      uso: 'Milho',
      carNumero: 'MT-5107925-D4E5.F6A1.B2C3.0004',
    },
    geometry: geo(rota('sorriso-fazendeiro')),
    documentos: [],
    status: 'enviado',
  },
];
