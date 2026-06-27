// Motor de aptidão de crédito rural baseado na conformidade ambiental do imóvel.
//
// Contexto regulatório:
//   - Manual de Crédito Rural (MCR/BACEN) — CAR ativo e ausência de embargo IBAMA
//     são pré-requisitos para acesso ao crédito rural (MCR Seção 2 — Normas Gerais).
//   - Lei 11.326/2006 (art. 3°) — define agricultor familiar: até 4 módulos fiscais,
//     renda bruta anual majoritariamente da atividade rural, trabalho familiar.
//   - Lei 12.651/2012 (Código Florestal) — PRA (art. 59), APP, Reserva Legal;
//     passivo florestal não regularizado pode suspender crédito.
//   - Lei 9.985/2000 (SNUC) — distingue UC de Proteção Integral × Uso Sustentável.
//   - Pronaf: MCR Seção 10; taxas e tetos definidos nas Resoluções CMN de cada safra.
//   - Pronampe: Lei 13.999/2020 (extensão a produtores rurais registrados como MEI/ME/EPP).
//
// ATENÇÃO: Esta avaliação é INFORMATIVA. Não constitui oferta de crédito, proposta
// comercial nem diagnóstico jurídico. A concessão depende de análise da IF,
// comprovação de renda e enquadramento no MCR vigente.

import type { AnaliseAmbiental, CamadaTipo, Sobreposicao } from './overlay';
import type { Imovel } from '../types';
import { areaHectares } from './geo';

// ---------------------------------------------------------------------------
// Interfaces públicas
// ---------------------------------------------------------------------------

/** Representa uma linha de crédito rural e a aptidão do imóvel para ela. */
export interface LinhaCredito {
  id: 'pronaf' | 'pronampe_rural' | 'custeio' | 'investimento';
  /** Nome exibível da linha. Ex.: "Pronaf — Custeio / Investimento". */
  nome: string;
  /** Descrição de 1 linha em pt-br simples, voltada ao produtor. */
  descricao: string;
  /** true = imóvel aparentemente apto a pleitear a linha (sujeito a docs e análise da IF). */
  apto: boolean;
  /** Motivo de aptidão ou inaptidão. Sempre preenchido para rastreabilidade (LGPD art. 20). */
  motivo: string;
  /**
   * Teto estimado em reais inteiros — estimativa MUITO grosseira de ordem de grandeza.
   * Nunca exibir sem o disclaimer. Omitido quando bloqueado ou não calculável.
   * Representado em R$ (não em centavos) pois é valor puramente informativo de display.
   */
  tetoEstimado_BRL?: number;
}

/** Resultado consolidado da avaliação de aptidão de crédito para um imóvel. */
export interface AptidaoCredito {
  /**
   * false se houver ao menos um bloqueio crítico
   * (embargo IBAMA, sobreposição com TI, UC de Proteção Integral).
   * Crédito rural é inviável sem resolução prévia desses bloqueios.
   */
  elegivelGeral: boolean;
  /**
   * Score de saúde de conformidade ambiental para crédito (0–100).
   * 100 = nenhuma sobreposição; penalizado conforme severidade e percentual da área afetada.
   * Imóveis com bloqueio crítico têm score limitado a 30 (sinal claro ao produtor).
   */
  score: number;
  /** Lista de impedimentos impeditivos, em linguagem acessível ao produtor. */
  bloqueios: string[];
  /** Avaliação individualizada por linha de crédito disponível. */
  linhas: LinhaCredito[];
  /** Próximos passos concretos para destravar ou melhorar o acesso ao crédito. */
  recomendacoes: string[];
  /**
   * Aviso legal obrigatório. Deve ser exibido em destaque na UI, próximo a qualquer
   * teto ou indicação de aptidão — requisito de transparência (CDC art. 6° e MCR).
   */
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Constantes de regra de negócio
// ---------------------------------------------------------------------------

/** Aviso legal exibido junto a todo resultado de aptidão. */
const DISCLAIMER =
  'Estimativa informativa gerada a partir dos dados de conformidade ambiental do imóvel. ' +
  'Não constitui oferta de crédito, proposta comercial nem diagnóstico jurídico. ' +
  'A concessão depende de análise e aprovação da instituição financeira, ' +
  'comprovação de renda e atividade, apresentação de documentação completa ' +
  'e enquadramento no Manual de Crédito Rural (MCR/BACEN) vigente na safra.';

/**
 * Limite de módulos fiscais para enquadramento como agricultor familiar (Pronaf).
 * Ref.: Lei 11.326/2006 art. 3°, inc. II; MCR Seção 10.
 */
const PRONAF_MAX_MF = 4;

/**
 * Referência de módulo fiscal (ha) usada quando ImovelDados.modulosFiscais não está preenchido.
 * O módulo fiscal real varia por município: 5 ha (litoral/sul) a 110 ha (Amazônia).
 * Usamos 20 ha como referência conservadora — comum em regiões de concentração de pequenos
 * produtores (p. ex. cerrado e sul do Brasil). Resultado é marcado como incerto.
 * Fonte: INCRA (tabela de módulos fiscais por município, Instrução Especial/INCRA 20/1980).
 */
const MF_HA_REFERENCIA = 20;

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Retorna true se o documento informado tem 14 dígitos numéricos (CNPJ).
 * Remove formatação (pontos, traços, barra) antes de contar.
 */
function _isCnpj(cpfCnpj: string): boolean {
  return cpfCnpj.replace(/\D/g, '').length === 14;
}

/**
 * Calcula a penalidade de score para uma sobreposição.
 *
 * Fórmula por severidade:
 *   critico: 25 base + até 15 pontos pelo percentual afetado (teto 40)
 *   alerta:  10 base + até 10 pontos pelo percentual afetado (teto 20)
 *   info:     2 base + até  3 pontos pelo percentual afetado (teto  5)
 *
 * O percentual amplifica mas não domina: uma sobreposição de 1% com embargo
 * já é crítica (25 pts); o percentual refina dentro da categoria.
 */
function _penalidade(s: Sobreposicao): number {
  if (s.severidade === 'critico') return Math.min(40, 25 + s.percentual * 0.3);
  if (s.severidade === 'alerta')  return Math.min(20, 10 + s.percentual * 0.2);
  /* info */                       return Math.min(5,   2 + s.percentual * 0.05);
}

/**
 * Converte as sobreposições críticas em mensagens de bloqueio para o produtor.
 * Somente severidade 'critico' gera bloqueio efetivo de crédito rural (MCR Seção 2).
 */
function _extrairBloqueios(sobreposicoes: Sobreposicao[]): string[] {
  const bloqueios: string[] = [];

  for (const s of sobreposicoes) {
    if (s.severidade !== 'critico') continue;

    const tipo = s.tipo as CamadaTipo;

    if (tipo === 'embargo_ibama') {
      bloqueios.push(
        `Embargo IBAMA ativo sobre o imóvel (${s.area_ha.toFixed(1)} ha afetados). ` +
          'O MCR (Seção 2) veda crédito rural a imóveis com embargo ambiental vigente.',
      );
      continue;
    }

    if (tipo === 'terra_indigena') {
      bloqueios.push(
        `Sobreposição com Terra Indígena "${s.nome}" ` +
          `(${s.percentual.toFixed(1)}% da área, ${s.area_ha.toFixed(1)} ha). ` +
          'A titularidade de áreas em TI é constitucionalmente nula (CF art. 231 § 6°); ' +
          'nenhuma IF concederá crédito rural com esse bloqueio não resolvido.',
      );
      continue;
    }

    if (tipo === 'unidade_conservacao') {
      bloqueios.push(
        `Sobreposição com Unidade de Conservação de Proteção Integral "${s.nome}" ` +
          `(${s.percentual.toFixed(1)}% da área, ${s.area_ha.toFixed(1)} ha). ` +
          'Atividade agropecuária é vedada em UC de Proteção Integral (Lei 9.985/2000 art. 7°).',
      );
      continue;
    }

    // Tipo crítico futuro não mapeado acima
    bloqueios.push(
      `${s.mensagem} — sobreposição crítica em ${s.percentual.toFixed(1)}% da área.`,
    );
  }

  return bloqueios;
}

// ---------------------------------------------------------------------------
// Avaliadores por linha de crédito
// ---------------------------------------------------------------------------

/**
 * Avalia a linha Pronaf (custeio e investimento para agricultores familiares).
 *
 * Eligibilidade primária (verificada aqui via proxy de porte):
 *   - Até 4 módulos fiscais (Lei 11.326/2006 art. 3°).
 *   - DAP/CAF válida (verificação documental fora do escopo desta função).
 *   - Renda bruta anual ≤ R$ 500.000 (grupo padrão; alguns grupos diferem).
 *
 * Quando modulosFiscais não está cadastrado, estimamos com ressalva explícita.
 * Teto de custeio estimado: ~R$ 2.500/ha, limitado ao teto do Pronaf Grupo V
 * (~R$ 415.000 na safra 2024/25; atualizado anualmente por Res. CMN).
 */
function _avaliarPronaf(imovel: Imovel, bloqueado: boolean, area_ha: number): LinhaCredito {
  const base = {
    id: 'pronaf' as const,
    nome: 'Pronaf — Custeio / Investimento',
    descricao: 'Crédito subsidiado para agricultores familiares (Lei 11.326/2006; MCR Seção 10).',
  };

  if (bloqueado) {
    return {
      ...base,
      apto: false,
      motivo: 'Bloqueio ambiental crítico impede acesso ao crédito rural (MCR Seção 2). ' +
        'Resolva os impeditivos antes de pleitear qualquer linha.',
    };
  }

  const mf = imovel.imovel.modulosFiscais;

  // Caso 1: módulos fiscais informados — decisão direta
  if (mf !== undefined && mf !== null) {
    const apto = mf <= PRONAF_MAX_MF;
    return {
      ...base,
      apto,
      motivo: apto
        ? `Imóvel de ${mf} módulo(s) fiscal(is) — dentro do limite de ${PRONAF_MAX_MF} MF ` +
          'para enquadramento como agricultor familiar. Obtenha a DAP/CAF na Emater ou Senar.'
        : `Imóvel de ${mf} módulos fiscais excede o limite de ${PRONAF_MAX_MF} MF do Pronaf. ` +
          'Verifique linhas convencionais de custeio/investimento ou Pronampe Rural.',
      tetoEstimado_BRL: apto
        ? Math.min(Math.round(area_ha * 2_500), 415_000)
        : undefined,
    };
  }

  // Caso 2: módulos fiscais não informados — estimativa conservadora
  const mfEstimado = area_ha / MF_HA_REFERENCIA;
  const provavelmenteApto = mfEstimado <= PRONAF_MAX_MF;

  return {
    ...base,
    apto: provavelmenteApto,
    motivo: provavelmenteApto
      ? `Área de ${area_ha.toFixed(1)} ha sugere ~${mfEstimado.toFixed(1)} MF ` +
        `(referência: ${MF_HA_REFERENCIA} ha/MF) — possivelmente dentro do limite Pronaf. ` +
        'Confirme os módulos fiscais no CCIR (INCRA) e obtenha a DAP/CAF.'
      : `Área de ${area_ha.toFixed(1)} ha sugere ~${mfEstimado.toFixed(1)} MF ` +
        `(referência: ${MF_HA_REFERENCIA} ha/MF) — provavelmente acima do limite de ${PRONAF_MAX_MF} MF. ` +
        'Confirme no CCIR; o módulo fiscal do município pode alterar esse resultado.',
    tetoEstimado_BRL: provavelmenteApto
      ? Math.min(Math.round(area_ha * 2_500), 415_000)
      : undefined,
  };
}

/**
 * Avalia o Pronampe Rural (micro e pequenas empresas rurais).
 *
 * Ref.: Lei 13.999/2020 e portarias de cada edição do programa.
 * Elegível: produtor rural formalizado como MEI, ME ou EPP (CNPJ ativo).
 *   - MEI rural: faturamento bruto anual ≤ R$ 81.000
 *   - ME:        faturamento bruto anual ≤ R$ 360.000
 *   - EPP:       faturamento bruto anual ≤ R$ 4.800.000
 *
 * Produtor com apenas CPF (pessoa física) não tem acesso direto ao Pronampe —
 * precisa formalizar-se como MEI Rural antes.
 * Teto estimado: ~R$ 3.000/ha, limitado a R$ 150.000 (linha típica de capital de giro).
 */
function _avaliarPronampeRural(imovel: Imovel, bloqueado: boolean, area_ha: number): LinhaCredito {
  const base = {
    id: 'pronampe_rural' as const,
    nome: 'Pronampe Rural',
    descricao: 'Crédito para micro e pequenas empresas rurais (Lei 13.999/2020).',
  };

  if (bloqueado) {
    return {
      ...base,
      apto: false,
      motivo: 'Bloqueio ambiental crítico impede acesso ao crédito rural.',
    };
  }

  if (_isCnpj(imovel.produtor.cpfCnpj)) {
    return {
      ...base,
      apto: true,
      motivo:
        'Produtor com CNPJ — elegível ao Pronampe Rural se faturamento anual se enquadrar ' +
        'como MEI (≤ R$ 81k), ME (≤ R$ 360k) ou EPP (≤ R$ 4,8 mi). ' +
        'Comprovação de faturamento e regularidade fiscal (CND) obrigatórios na IF.',
      tetoEstimado_BRL: Math.min(Math.round(area_ha * 3_000), 150_000),
    };
  }

  // CPF: pessoa física — Pronampe exige CNPJ ativo
  return {
    ...base,
    apto: false,
    motivo:
      'Produtor cadastrado como CPF (pessoa física). O Pronampe exige registro como ' +
      'MEI, ME ou EPP (CNPJ ativo). Considere formalizar-se como MEI Rural ' +
      'no Portal do Empreendedor para acessar esta linha.',
  };
}

/**
 * Avalia crédito de custeio agropecuário convencional.
 *
 * Disponível a qualquer produtor rural (PF ou PJ), sem restrição de porte.
 * Ref.: MCR Seção 3 (custeio) — financia insumos, sementes, defensivos, operações de colheita.
 * Pré-requisitos ambientais: CAR ativo + ausência de embargo IBAMA (MCR Seção 2).
 * Taxas e prazos variam por banco, cultura e plano de safra — não estimamos aqui.
 *
 * Teto estimado: ~R$ 4.000/ha (médio nacional entre culturas), sem limite fixo por linha
 * (depende do orçamento da atividade aprovado pela IF).
 */
function _avaliarCusteio(bloqueado: boolean, area_ha: number): LinhaCredito {
  const base = {
    id: 'custeio' as const,
    nome: 'Custeio Agropecuário',
    descricao: 'Financiamento de insumos, plantio e colheita (MCR Seção 3).',
  };

  if (bloqueado) {
    return {
      ...base,
      apto: false,
      motivo: 'Bloqueio ambiental crítico impede acesso ao crédito rural (MCR Seção 2).',
    };
  }

  return {
    ...base,
    apto: true,
    motivo:
      'Imóvel sem bloqueios críticos. Custeio exige: CPF/CNPJ regular na Receita Federal, ' +
      'comprovante de atividade rural, orçamento da safra e garantias (penhor da produção, ' +
      'aval ou hipoteca). Procure um banco credenciado ao MAPA.',
    tetoEstimado_BRL: Math.min(Math.round(area_ha * 4_000), 2_000_000),
  };
}

/**
 * Avalia crédito de investimento rural (benfeitorias, máquinas, infraestrutura).
 *
 * Ref.: MCR Seção 4 — inclui linhas como ABC+ (baixo carbono), Moderinfra,
 * Pronamp Investimento etc. Exige projeto técnico (ATER) e vistoria.
 * Pré-requisitos ambientais: os mesmos do custeio + regularidade de APP e RL.
 *
 * Teto estimado: ~R$ 6.000/ha (infraestrutura básica), sem limite único por linha.
 */
function _avaliarInvestimento(bloqueado: boolean, area_ha: number): LinhaCredito {
  const base = {
    id: 'investimento' as const,
    nome: 'Investimento Rural',
    descricao: 'Financiamento de máquinas, benfeitorias e infraestrutura (MCR Seção 4).',
  };

  if (bloqueado) {
    return {
      ...base,
      apto: false,
      motivo: 'Bloqueio ambiental crítico impede acesso ao crédito rural (MCR Seção 2).',
    };
  }

  return {
    ...base,
    apto: true,
    motivo:
      'Imóvel sem bloqueios críticos. Investimento exige projeto técnico (ATER/EMATER), ' +
      'vistoria prévia da IF e garantias reais (hipoteca rural ou penhor de máquinas). ' +
      'Linhas ABC+ exigem comprovação de práticas de baixo carbono.',
    tetoEstimado_BRL: Math.min(Math.round(area_ha * 6_000), 5_000_000),
  };
}

// ---------------------------------------------------------------------------
// Gerador de recomendações
// ---------------------------------------------------------------------------

/**
 * Produz recomendações práticas a partir das sobreposições identificadas e do perfil do imóvel.
 * Ordenadas da mais urgente (bloqueios) à mais proativa (próximos passos).
 */
function _gerarRecomendacoes(
  sobreposicoes: Sobreposicao[],
  imovel: Imovel,
  area_ha: number,
): string[] {
  const recs: string[] = [];
  const tipos = new Set(sobreposicoes.map((s) => s.tipo as CamadaTipo));
  const temBloqueio = sobreposicoes.some((s) => s.severidade === 'critico');

  // — Bloqueios críticos (ordem de urgência) —

  if (tipos.has('embargo_ibama')) {
    recs.push(
      'Embargo IBAMA: consulte o IBAMA para identificar o auto de infração. ' +
        'Regularize a situação (cessação da infração + Termo de Compromisso ou pagamento, ' +
        'conforme o caso) antes de qualquer tentativa de crédito rural.',
    );
  }

  if (tipos.has('terra_indigena')) {
    recs.push(
      'Sobreposição com Terra Indígena: obtenha análise jurídica especializada. ' +
        'Consulte a FUNAI e, se necessário, a Advocacia-Geral da União (AGU). ' +
        'Essa situação pode implicar nulidade do título e impedimento definitivo de crédito.',
    );
  }

  if (tipos.has('unidade_conservacao')) {
    recs.push(
      'UC de Proteção Integral: consulte o ICMBio ou órgão gestor para confirmar ' +
        'a categoria. UCs de Uso Sustentável (APA, FLONA, RESEX etc.) permitem ' +
        'atividade agropecuária com restrições — e não geram bloqueio crítico de crédito.',
    );
  }

  // — Alertas (penalizam mas não bloqueiam) —

  if (tipos.has('desmatamento')) {
    recs.push(
      'Desmatamento recente identificado: regularize a vegetação suprimida via ' +
        'Programa de Regularização Ambiental (PRA) junto ao órgão estadual de meio ambiente ' +
        '(Lei 12.651/2012 art. 59). Passivo florestal não regularizado pode suspender ' +
        'o crédito rural a qualquer momento.',
    );
  }

  if (tipos.has('queimada')) {
    recs.push(
      'Cicatriz de queimada detectada (INPE): averigue a origem do fogo. ' +
        'Se houve queima controlada, mantenha a autorização do órgão ambiental; ' +
        'caso contrário, regularize via PRA e comprove a recuperação da área. ' +
        'Fogo recorrente ou sobre vegetação nativa pode gerar autuação, embargo e ' +
        'suspensão do crédito rural.',
    );
  }

  if (tipos.has('app_hidrografia')) {
    recs.push(
      'APP de hidrografia: verifique se há uso indevido da faixa marginal. ' +
        'Passivo de APP deve ser incluído no PRA. Não bloqueia crédito por si só, ' +
        'mas pode ser autuado em fiscalização e gerar embargo futuro.',
    );
  }

  // — Dados incompletos —

  if (!imovel.imovel.modulosFiscais) {
    recs.push(
      'Módulos fiscais não cadastrados: obtenha o CCIR (Certificado de Cadastro de Imóvel Rural) ' +
        'no portal do INCRA (certificacao.incra.gov.br). O número de MF é determinante para ' +
        'o enquadramento no Pronaf e outras linhas de crédito familiar.',
    );
  }

  if (!_isCnpj(imovel.produtor.cpfCnpj)) {
    recs.push(
      'Produtor cadastrado com CPF: considere formalizar-se como MEI Rural ' +
        '(Portal do Empreendedor) para ampliar o acesso a linhas como Pronampe Rural ' +
        'e facilitar a emissão de notas fiscais de produtor.',
    );
  }

  // — Próximos passos quando não há bloqueio crítico —

  if (!temBloqueio) {
    recs.push(
      'Solicite a DAP/CAF (Declaração de Aptidão ao Pronaf) na Emater, Senar ou entidade ' +
        'credenciada pelo MDA — é o documento-chave para confirmar o enquadramento e ' +
        'acessar as taxas subsidiadas do Pronaf na safra atual.',
    );
    recs.push(
      'Procure um banco credenciado ao MAPA ou uma cooperativa de crédito rural ' +
        '(Sicoob, Sicredi, Cresol etc.) com o CAR ativo e a DAP/CAF em mãos ' +
        'para simular as linhas disponíveis.',
    );
  }

  // — Casos especiais de escala —

  if (area_ha < 1) {
    recs.push(
      'Área do imóvel inferior a 1 ha: programas de microcrédito rural (SIM Digital/PNMPO, ' +
        'Agroamigo, programas estaduais) costumam ser mais adequados do que o ' +
        'crédito bancário convencional para propriedades muito pequenas.',
    );
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Função principal — contrato público
// ---------------------------------------------------------------------------

/**
 * Avalia a aptidão de crédito rural de um imóvel com base na análise ambiental.
 *
 * A função é **síncrona e pura** — não faz I/O e pode ser chamada diretamente
 * em componente React sem `await`. O I/O (análise de sobreposições) deve ocorrer
 * antes, via `overlay.ts`.
 *
 * @param analise - Resultado da análise de sobreposições ambientais (`overlay.ts`).
 * @param imovel  - Dados do imóvel: geometry, produtor, modulosFiscais, etc.
 * @returns       `AptidaoCredito` com score, bloqueios, linhas e recomendações.
 *
 * Decisões de regra de negócio:
 *   - `elegivelGeral`: false se qualquer sobreposição for 'critico' (MCR Seção 2).
 *   - `score`: começa em 100; penalizado por severidade × percentual de área afetada;
 *              cap em 30 quando houver bloqueio crítico.
 *   - Pronaf: determinado por `modulosFiscais` (se disponível) ou estimado pela área.
 *   - Pronampe: requer CNPJ ativo; CPF recebe orientação de formalização.
 *   - Custeio/Investimento: disponíveis para qualquer produtor sem bloqueio crítico.
 *   - `tetoEstimado_BRL`: estimativa grosseira (R$/ha × área, teto por linha);
 *                         sempre acompanhada pelo `disclaimer`.
 */
export function avaliarCredito(analise: AnaliseAmbiental, imovel: Imovel): AptidaoCredito {
  // Área geodésica real do imóvel (ha)
  const area_ha = areaHectares(imovel.geometry.points);

  // --- 1. Bloqueios críticos ---
  const temBloqueio = analise.sobreposicoes.some((s) => s.severidade === 'critico');
  const bloqueios = _extrairBloqueios(analise.sobreposicoes);

  // --- 2. Score de conformidade (0–100) ---
  let score = 100;
  for (const s of analise.sobreposicoes) {
    score -= _penalidade(s);
  }
  // Bloqueio crítico: score não pode transmitir falsa segurança
  if (temBloqueio) score = Math.min(score, 30);
  score = Math.max(0, Math.round(score));

  // --- 3. Elegibilidade por linha ---
  const linhas: LinhaCredito[] = [
    _avaliarPronaf(imovel, temBloqueio, area_ha),
    _avaliarPronampeRural(imovel, temBloqueio, area_ha),
    _avaliarCusteio(temBloqueio, area_ha),
    _avaliarInvestimento(temBloqueio, area_ha),
  ];

  // --- 4. Recomendações práticas ---
  const recomendacoes = _gerarRecomendacoes(analise.sobreposicoes, imovel, area_ha);

  return {
    elegivelGeral: !temBloqueio,
    score,
    bloqueios,
    linhas,
    recomendacoes,
    disclaimer: DISCLAIMER,
  };
}
