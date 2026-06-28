// Central de documentos do imóvel rural: catálogo dos documentos digitais,
// sincronização mock com o gov.br/SICAR/INCRA e avaliação de regularidade
// (documentos faltando + área em risco) para o aviso de crédito.
//
// SEAM: integração gov.br real (OIDC+PKCE + WFS/REST governamental) entra em
// `sincronizarDocumentos`. Hoje é mock determinístico, offline-first.
import type { Documento, DocumentoTipo, Imovel } from '../types';

// ---------------------------------------------------------------------------
// Modelo de status dos documentos
// ---------------------------------------------------------------------------

export type DocStatus = 'em-dia' | 'vencendo' | 'vencido' | 'pendente' | 'ausente';

export interface ItemDocumento {
  tipo: DocumentoTipo;
  label: string;
  orgao: string;
  status: DocStatus;
  doc?: Documento;
  venceEm?: number;
  detalhe: string;
}

export interface SolicitacaoMetragem {
  delta_ha: number;
  afeta: DocumentoTipo[];
  mensagem: string;
}

export type NivelRegularidade = 'regular' | 'pendente' | 'critico';

export interface DocMeta {
  label: string;
  orgao: string;
  /** true = sincronizável via gov.br no demo. */
  digital: boolean;
  /** pesa no aviso de regularidade/crédito. */
  obrigatorioCredito: boolean;
}

export interface RegularidadeImovel {
  nivel: NivelRegularidade;
  haEmRisco: number;
  docsObrigatoriosFaltando: DocumentoTipo[];
  podeImpactarCredito: boolean;
  titulo: string;
  mensagem: string;
  disclaimer: string;
}

export const CATALOGO_DIGITAL: Record<DocumentoTipo, DocMeta> = {
  car:          { label: 'Recibo do CAR',        orgao: 'SICAR / Meu Imóvel Rural', digital: true,  obrigatorioCredito: true },
  'car-extrato':{ label: 'Extrato do CAR',        orgao: 'SICAR / Meu Imóvel Rural', digital: true,  obrigatorioCredito: false },
  ccir:         { label: 'CCIR',                  orgao: 'INCRA',                    digital: true,  obrigatorioCredito: true },
  sigef:        { label: 'Georreferenciamento',   orgao: 'SIGEF / INCRA',            digital: true,  obrigatorioCredito: true },
  matricula:    { label: 'Matrícula',             orgao: 'Cartório de Registro',     digital: true,  obrigatorioCredito: true },
  caf:          { label: 'CAF',                   orgao: 'MDA',                      digital: true,  obrigatorioCredito: false },
  itr:          { label: 'ITR / CAFIR',           orgao: 'Receita Federal',          digital: true,  obrigatorioCredito: false },
  licenca:      { label: 'Licença ambiental',     orgao: 'Órgão ambiental estadual', digital: true,  obrigatorioCredito: false },
  rg:           { label: 'RG / CPF',              orgao: '',                         digital: false, obrigatorioCredito: false },
  'foto-divisa':{ label: 'Foto da divisa',        orgao: '',                         digital: false, obrigatorioCredito: false },
  outro:        { label: 'Outro',                 orgao: '',                         digital: false, obrigatorioCredito: false },
};

export const OBRIGATORIOS_CREDITO: DocumentoTipo[] = (
  Object.keys(CATALOGO_DIGITAL) as DocumentoTipo[]
).filter((t) => CATALOGO_DIGITAL[t].obrigatorioCredito);

const DISCLAIMER =
  'Informação orientativa gerada a partir dos seus documentos e da geometria do ' +
  'imóvel. Não constitui oferta de crédito nem diagnóstico jurídico. A concessão ' +
  'depende de análise da instituição financeira e da documentação completa.';

// ponytail: helper local para fim do exercício fiscal do ano do timestamp fornecido
function fimExercicio(ts: number): number {
  return new Date(new Date(ts).getFullYear(), 11, 31, 23, 59, 59, 999).getTime();
}

// Formata epoch ms como "MM/AAAA" (usado nas mensagens de detalhe)
function fmtMesAno(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Documentos digitais que "existem" no gov.br para este imóvel (mock determinístico). */
export function documentosDisponiveis(imovel: Imovel): Documento[] {
  const tipos: DocumentoTipo[] = [];
  if (imovel.imovel.carNumero) tipos.push('car', 'car-extrato');
  tipos.push('ccir'); // cadastro INCRA por CPF
  if (imovel.imovel.matricula) tipos.push('matricula');
  if (imovel.geometry.points.length >= 3) tipos.push('sigef'); // foi georreferenciado
  // caf/itr/licenca não são retornados por padrão → viram pendência.

  // Datas derivadas de imovel.createdAt para resultado determinístico por imóvel.
  // CCIR e ITR: vence no fim do exercício em que o imóvel foi cadastrado.
  // CAF: validade de 3 anos a partir do cadastro (CAF 3.0 — MDA, 2025).
  const venceEmCCIR = fimExercicio(imovel.createdAt);
  const venceEmCAF  = imovel.createdAt + 3 * 365.25 * 24 * 60 * 60 * 1000;
  const venceEmITR  = venceEmCCIR;

  return tipos.map((tipo) => {
    const meta = CATALOGO_DIGITAL[tipo];
    const venceEm: number | undefined =
      tipo === 'ccir' ? venceEmCCIR :
      tipo === 'caf'  ? venceEmCAF  :
      tipo === 'itr'  ? venceEmITR  :
      undefined; // car, car-extrato, sigef, matricula: permanentes

    return {
      id: `govbr_${tipo}`, // id estável → re-sync não duplica
      tipo,
      origem: 'govbr',
      orgao: meta.orgao,
      nome: meta.label,
      mime: 'application/pdf',
      emitidoEm: imovel.createdAt,
      venceEm,
      createdAt: imovel.createdAt,
    } as Documento;
  });
}

/** Mescla mantendo todos os existentes; só insere `novos` cujo tipo ainda não existe. */
export function mergeDocumentos(existing: Documento[], novos: Documento[]): Documento[] {
  const tiposExistentes = new Set(existing.map((d) => d.tipo));
  return [...existing, ...novos.filter((n) => !tiposExistentes.has(n.tipo))];
}

/** Sincroniza com o gov.br (mock). Nunca lança: em falha devolve os docs atuais. */
export async function sincronizarDocumentos(imovel: Imovel): Promise<Documento[]> {
  try {
    await new Promise((r) => setTimeout(r, 600)); // simula latência da busca
    return mergeDocumentos(imovel.documentos, documentosDisponiveis(imovel));
  } catch {
    return imovel.documentos;
  }
}

// ---------------------------------------------------------------------------
// Status por documento
// ---------------------------------------------------------------------------

const SESSENTA_DIAS = 60 * 24 * 60 * 60 * 1000;

/** Calcula o DocStatus de um tipo de documento para o imóvel dado. Função pura. */
export function statusDocumento(
  tipo: DocumentoTipo,
  imovel: Imovel,
  doc: Documento | undefined,
  hoje: number,
): DocStatus {
  const hasDelta = !!(imovel.alertaDivergencia || imovel.deltaRelatorio);

  switch (tipo) {
    case 'car':
      if (!imovel.imovel.carNumero || !doc) return 'ausente';
      if (
        imovel.alertaDivergencia?.severidade === 'critico' ||
        imovel.validacao?.status === 'reprovado'
      ) return 'pendente';
      return 'em-dia';

    case 'car-extrato':
      if (!doc) return 'ausente';
      if (hasDelta) return 'vencido';
      return 'em-dia';

    case 'sigef':
      if (!doc) return 'ausente';
      if (hasDelta) return 'vencido';
      return 'em-dia';

    case 'matricula':
      if (!doc) return 'ausente';
      return 'em-dia';

    case 'ccir':
    case 'caf':
    case 'itr':
    case 'licenca': {
      if (!doc) return 'ausente';
      const ve = doc.venceEm;
      if (!ve) return 'em-dia';
      if (ve < hoje) return 'vencido';
      if (ve < hoje + SESSENTA_DIAS) return 'vencendo';
      return 'em-dia';
    }

    default:
      return doc ? 'em-dia' : 'ausente';
  }
}

function gerarDetalhe(
  tipo: DocumentoTipo,
  status: DocStatus,
  doc: Documento | undefined,
): string {
  const ve = doc?.venceEm;

  if (status === 'ausente') {
    switch (tipo) {
      case 'caf':     return 'Cadastre em caf.mda.gov.br';
      case 'itr':     return 'Entregue a DITR no e-CAC (Receita Federal)';
      case 'licenca': return 'Consulte o órgão ambiental estadual';
      default:        return 'Baixe no Meu Imóvel Rural (gov.br)';
    }
  }

  if (status === 'pendente') {
    return tipo === 'car' ? 'Em análise no SICAR' : 'Pendente de regularização';
  }

  if (status === 'vencido') {
    if (tipo === 'sigef' || tipo === 'car-extrato') return 'Refaça — nova metragem detectada';
    if (ve) return `Vencido em ${fmtMesAno(ve)} — renove`;
    return 'Vencido — renove o documento';
  }

  if (status === 'vencendo' && ve) return `Vence em ${fmtMesAno(ve)}`;

  // em-dia
  if (ve) return `Válido até ${fmtMesAno(ve)}`;
  return 'Documento em dia';
}

// Prioridade de exibição: o que precisa de ação aparece primeiro.
const PRIORIDADE_STATUS: Record<DocStatus, number> = {
  ausente: 0, vencido: 1, pendente: 2, vencendo: 3, 'em-dia': 4,
};

/**
 * Lista todos os documentos digitais aplicáveis ao imóvel, cada um com seu
 * status calculado. Inclui itens ausentes (ainda não anexados). Ordenados:
 * ausentes/vencidos/pendentes primeiro, em-dia por último.
 */
export function listarDocumentosPropriedade(imovel: Imovel, hoje: number): ItemDocumento[] {
  // Catálogo digital COMPLETO sempre — documentos obrigatórios faltando aparecem
  // como 'ausente' (o fazendeiro precisa vê-los para providenciar), não somem.
  const tipos: DocumentoTipo[] = [
    'car', 'car-extrato', 'ccir', 'sigef', 'matricula', 'caf', 'itr', 'licenca',
  ];

  const docPorTipo = new Map<DocumentoTipo, Documento>(
    imovel.documentos.map((d) => [d.tipo, d]),
  );

  const itens: ItemDocumento[] = tipos.map((tipo) => {
    const meta = CATALOGO_DIGITAL[tipo];
    const doc = docPorTipo.get(tipo);
    const status = statusDocumento(tipo, imovel, doc, hoje);
    return {
      tipo,
      label: meta.label,
      orgao: meta.orgao,
      status,
      doc,
      venceEm: doc?.venceEm,
      detalhe: gerarDetalhe(tipo, status, doc),
    };
  });

  return itens.sort((a, b) => PRIORIDADE_STATUS[a.status] - PRIORIDADE_STATUS[b.status]);
}

/**
 * Retorna aviso de nova metragem quando há re-demarcação pendente (alertaDivergencia
 * ou deltaRelatorio). Null quando o imóvel está estável.
 */
export function solicitacaoMetragem(imovel: Imovel): SolicitacaoMetragem | null {
  if (!imovel.alertaDivergencia && !imovel.deltaRelatorio) return null;
  const delta_ha = Math.abs(
    imovel.alertaDivergencia?.delta_ha ??
    imovel.deltaRelatorio?.acrescido_ha ??
    0,
  );
  const deltaStr = delta_ha > 0 ? `+${delta_ha.toFixed(1)} ha` : 'divergência de área';
  return {
    delta_ha,
    afeta: ['sigef', 'car-extrato'],
    mensagem: `Nova metragem de ${deltaStr} detectada. Refaça o Georreferenciamento e o Extrato do CAR para regularizar.`,
  };
}

/** Avalia regularidade: documentos obrigatórios faltando + hectares em risco. */
export function avaliarRegularidade(imovel: Imovel): RegularidadeImovel {
  const presentes = new Set(imovel.documentos.map((d) => d.tipo));
  const docsObrigatoriosFaltando = OBRIGATORIOS_CREDITO.filter((t) => !presentes.has(t));

  const haEmRisco = Math.abs(
    imovel.alertaDivergencia?.delta_ha ??
      imovel.deltaRelatorio?.acrescido_ha ??
      0,
  );

  const critico =
    imovel.validacao?.status === 'reprovado' ||
    imovel.alertaDivergencia?.severidade === 'critico';

  let nivel: NivelRegularidade = 'regular';
  if (critico) nivel = 'critico';
  else if (docsObrigatoriosFaltando.length > 0 || haEmRisco > 0) nivel = 'pendente';

  const podeImpactarCredito = nivel !== 'regular';

  const partes: string[] = [];
  if (haEmRisco > 0) partes.push(`~${haEmRisco.toFixed(1)} ha não regularizados`);
  if (docsObrigatoriosFaltando.length > 0) {
    const n = docsObrigatoriosFaltando.length;
    partes.push(`${n} documento${n > 1 ? 's' : ''} obrigatório${n > 1 ? 's' : ''} faltando`);
  }

  const titulo =
    nivel === 'regular' ? 'Imóvel regular' : nivel === 'critico' ? 'Regularização crítica' : 'Regularização pendente';
  const mensagem = podeImpactarCredito
    ? partes.length > 0
      ? `${partes.join(' e ')} podem impedir o acesso a crédito rural (Pronaf/Pronampe) e financiamento bancário.`
      : 'Situação cadastral reprovada. Regularize o imóvel para acesso a crédito rural e financiamento.'
    : 'Documentação e geometria em dia — apto a pleitear crédito rural.';

  return { nivel, haEmRisco, docsObrigatoriosFaltando, podeImpactarCredito, titulo, mensagem, disclaimer: DISCLAIMER };
}
