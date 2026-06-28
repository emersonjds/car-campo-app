// Avaliação de regularidade do imóvel a partir de sinais REAIS (medição,
// validação do analista e sobreposições) e rótulos dos documentos anexados.
//
// Sem mock gov.br: o app não finge buscar CAF/ITR/CCIR em órgão. A regularidade
// reflete só o que o app sabe de verdade.
import type { DocumentoTipo, Imovel } from '../types';

// ---------------------------------------------------------------------------
// Catálogo de rótulos (apenas o que o produtor anexa de fato)
// ---------------------------------------------------------------------------

export interface DocMeta {
  label: string;
  orgao: string;
}

export const CATALOGO_DIGITAL: Record<DocumentoTipo, DocMeta> = {
  car:          { label: 'Recibo do CAR',       orgao: 'SICAR / Meu Imóvel Rural' },
  'car-extrato':{ label: 'Extrato do CAR',       orgao: 'SICAR / Meu Imóvel Rural' },
  ccir:         { label: 'CCIR',                 orgao: 'INCRA' },
  sigef:        { label: 'Georreferenciamento',  orgao: 'SIGEF / INCRA' },
  matricula:    { label: 'Matrícula',            orgao: 'Cartório de Registro' },
  caf:          { label: 'CAF',                  orgao: 'MDA' },
  itr:          { label: 'ITR / CAFIR',          orgao: 'Receita Federal' },
  licenca:      { label: 'Licença ambiental',    orgao: 'Órgão ambiental estadual' },
  rg:           { label: 'RG / CPF',             orgao: '' },
  'foto-divisa':{ label: 'Foto da divisa',       orgao: '' },
  outro:        { label: 'Outro',                orgao: '' },
};

// ---------------------------------------------------------------------------
// Nova metragem (divergência real de área)
// ---------------------------------------------------------------------------

export interface SolicitacaoMetragem {
  delta_ha: number;
  afeta: DocumentoTipo[];
  mensagem: string;
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

// ---------------------------------------------------------------------------
// Regularidade (sinais reais)
// ---------------------------------------------------------------------------

export type NivelRegularidade = 'regular' | 'pendente' | 'critico';

export interface RegularidadeImovel {
  nivel: NivelRegularidade;
  haEmRisco: number;
  podeImpactarCredito: boolean;
  titulo: string;
  mensagem: string;
  disclaimer: string;
}

const DISCLAIMER =
  'Informação orientativa gerada a partir da medição de campo e da análise do ' +
  'imóvel. Não constitui oferta de crédito nem diagnóstico jurídico. A concessão ' +
  'depende de análise da instituição financeira e da documentação completa.';

/**
 * Avalia a regularidade do imóvel a partir de sinais reais:
 *   - validação reprovada ou sobreposição crítica → 'critico'
 *   - divergência de área não regularizada (haEmRisco > 0) → 'pendente'
 *   - caso contrário → 'regular'
 */
export function avaliarRegularidade(imovel: Imovel): RegularidadeImovel {
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
  else if (haEmRisco > 0) nivel = 'pendente';

  const podeImpactarCredito = nivel !== 'regular';

  const titulo =
    nivel === 'regular' ? 'Imóvel regular'
    : nivel === 'critico' ? 'Regularização crítica'
    : 'Regularização pendente';

  const mensagem =
    nivel === 'critico'
      ? haEmRisco > 0
        ? `~${haEmRisco.toFixed(1)} ha não regularizados e situação reprovada podem impedir o acesso a crédito rural (Pronaf/Pronampe).`
        : 'Situação cadastral reprovada. Regularize o imóvel para acesso a crédito rural e financiamento.'
      : nivel === 'pendente'
        ? `~${haEmRisco.toFixed(1)} ha não regularizados podem impedir o acesso a crédito rural (Pronaf/Pronampe).`
        : 'Medição e situação em dia — apto a pleitear crédito rural.';

  return { nivel, haEmRisco, podeImpactarCredito, titulo, mensagem, disclaimer: DISCLAIMER };
}
