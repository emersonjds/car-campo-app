// Central de documentos do imóvel rural: catálogo dos documentos digitais,
// sincronização mock com o gov.br/SICAR/INCRA e avaliação de regularidade
// (documentos faltando + área em risco) para o aviso de crédito.
//
// SEAM: integração gov.br real (OIDC+PKCE + WFS/REST governamental) entra em
// `sincronizarDocumentos`. Hoje é mock determinístico, offline-first.
import type { Documento, DocumentoTipo, Imovel } from '../types';

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

/** Documentos digitais que "existem" no gov.br para este imóvel (mock determinístico). */
export function documentosDisponiveis(imovel: Imovel): Documento[] {
  const tipos: DocumentoTipo[] = [];
  if (imovel.imovel.carNumero) tipos.push('car', 'car-extrato');
  tipos.push('ccir'); // cadastro INCRA por CPF
  if (imovel.imovel.matricula) tipos.push('matricula');
  if (imovel.geometry.points.length >= 3) tipos.push('sigef'); // foi georreferenciado
  // caf/itr/licenca não são retornados por padrão → viram pendência.

  return tipos.map((tipo) => {
    const meta = CATALOGO_DIGITAL[tipo];
    return {
      id: `govbr_${tipo}`, // id estável → re-sync não duplica
      tipo,
      origem: 'govbr',
      orgao: meta.orgao,
      nome: meta.label,
      mime: 'application/pdf',
      emitidoEm: imovel.createdAt,
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
