// Domínio da Conferência de Terreno do Analista — CAR Campo.
//
// O analista faz uma NOVA MEDIÇÃO por cima do mapa do fazendeiro. Este módulo
// transforma os resultados dos motores existentes (validatePerimeter, delta,
// overlay) num PAINEL DE AVISOS acionável ("o que revisitar") e mapeia cada
// alerta ao ÓRGÃO responsável para encaminhamento.
//
// Honestidade legal: sobreposição geométrica NÃO prova invasão nem titularidade.
import { validatePerimeter, type LngLat } from './geo';
import type { AnaliseAmbiental, CamadaTipo, Severidade, Sobreposicao } from './overlay';
import type { DeltaRelatorio } from './delta';

// ---------------------------------------------------------------------------
// Avisos ("o que revisitar")
// ---------------------------------------------------------------------------

export type CodigoAviso =
  | 'DEMARCACAO_ERRADA'
  | 'DIVERGENCIA_AREA_CRITICA'
  | 'DIVERGENCIA_AREA_MODERADA'
  | 'DESLOCAMENTO_DIVISAS'
  | 'INVASAO_TERRA_INDIGENA'
  | 'INVASAO_UNIDADE_CONSERVACAO'
  | 'EMBARGO_IBAMA'
  | 'DESMATAMENTO_DETECTADO'
  | 'QUEIMADA_DETECTADA'
  | 'APP_HIDROGRAFIA'
  | 'SOBREPOSICAO_CAR_VIZINHO';

export interface AvisoConferencia {
  codigo: CodigoAviso;
  rotulo: string;
  severidade: Severidade;
  significadoLegal: string;
  acao: string;
  origem: 'geometria' | 'delta' | 'sobreposicao';
  detalhe?: string;
  dadosOffline: boolean;
}

export interface PainelAvisos {
  avisos: AvisoConferencia[];
  severidadeGeral: Severidade | null;
  requerVisita: boolean;
  temDadosOffline: boolean;
}

// ---------------------------------------------------------------------------
// Órgãos responsáveis
// ---------------------------------------------------------------------------

export type OrgaoDestinatario = 'FUNAI' | 'ICMBio' | 'IBAMA' | 'INCRA' | 'MP' | 'PF' | 'SICAR';

const ORGAOS_POR_CODIGO: Record<CodigoAviso, OrgaoDestinatario[]> = {
  DEMARCACAO_ERRADA: ['INCRA'],
  DIVERGENCIA_AREA_CRITICA: ['INCRA'],
  DIVERGENCIA_AREA_MODERADA: ['INCRA'],
  DESLOCAMENTO_DIVISAS: ['INCRA'],
  INVASAO_TERRA_INDIGENA: ['FUNAI'],
  INVASAO_UNIDADE_CONSERVACAO: ['ICMBio'],
  EMBARGO_IBAMA: ['IBAMA'],
  DESMATAMENTO_DETECTADO: ['IBAMA'],
  QUEIMADA_DETECTADA: ['IBAMA'],
  APP_HIDROGRAFIA: ['IBAMA'],
  SOBREPOSICAO_CAR_VIZINHO: ['INCRA', 'SICAR'],
};

export function orgaosDoAviso(codigo: CodigoAviso): OrgaoDestinatario[] {
  return ORGAOS_POR_CODIGO[codigo];
}

/** Órgãos únicos a notificar a partir dos avisos crítico/alerta do painel. */
export function orgaosDoPainel(painel: PainelAvisos): OrgaoDestinatario[] {
  const set = new Set<OrgaoDestinatario>();
  for (const a of painel.avisos) {
    if (a.severidade === 'info') continue;
    for (const o of orgaosDoAviso(a.codigo)) set.add(o);
  }
  return [...set];
}

// ---------------------------------------------------------------------------
// Catálogo de texto (rótulo / significado legal honesto / ação)
// ---------------------------------------------------------------------------

const CATALOGO: Record<CodigoAviso, Pick<AvisoConferencia, 'rotulo' | 'significadoLegal' | 'acao'>> = {
  DEMARCACAO_ERRADA: {
    rotulo: 'Demarcação com erro geométrico',
    significadoLegal: 'Polígono inválido (anel aberto, auto-interseção ou vértices insuficientes) não é registrável no SICAR.',
    acao: 'Refazer a caminhada de conferência antes de prosseguir.',
  },
  DIVERGENCIA_AREA_CRITICA: {
    rotulo: 'Grande divergência de área',
    significadoLegal: 'Diferença > 20% entre declarado e medido. Pode ser erro de GPS, disputa de divisa ou expansão — não prova intenção.',
    acao: 'Agendar visita e confrontar com a matrícula/georreferenciamento no INCRA.',
  },
  DIVERGENCIA_AREA_MODERADA: {
    rotulo: 'Divergência moderada de área',
    significadoLegal: 'Diferença entre 5% e 20%. Ajuste legítimo ou erro de medição — sem conclusão sobre intenção.',
    acao: 'Solicitar documentos complementares e conferir o georreferenciamento.',
  },
  DESLOCAMENTO_DIVISAS: {
    rotulo: 'Deslocamento de divisas',
    significadoLegal: 'Área total parecida, forma diferente — possível redefinição de divisa com confrontantes. Não comprova irregularidade.',
    acao: 'Verificar matrícula e relação com vizinhos.',
  },
  INVASAO_TERRA_INDIGENA: {
    rotulo: 'Sobreposição com Terra Indígena',
    significadoLegal: 'Coincide com TI (FUNAI). Não implica ocupação intencional — pode ser base desatualizada ou erro posicional. Impede registro no CAR.',
    acao: 'Encaminhar à FUNAI. Não aprovar sem parecer.',
  },
  INVASAO_UNIDADE_CONSERVACAO: {
    rotulo: 'Sobreposição com Unidade de Conservação',
    significadoLegal: 'Coincide com UC (ICMBio). Uso pode ser restrito conforme a categoria — sobreposição não é infração per se.',
    acao: 'Encaminhar ao ICMBio. Não aprovar sem parecer.',
  },
  EMBARGO_IBAMA: {
    rotulo: 'Embargo IBAMA ativo',
    significadoLegal: 'Sobrepõe embargo ativo do IBAMA. Impede crédito rural e CAR. O embargo pode ser contestado administrativamente.',
    acao: 'Encaminhar ao IBAMA. Suspender aprovação.',
  },
  DESMATAMENTO_DETECTADO: {
    rotulo: 'Desmatamento detectado',
    significadoLegal: 'Supressão de vegetação (PRODES/DETER). Pode ser área consolidada (pré-2008) ou autorizada (ASV) — o app não determina legalidade.',
    acao: 'Verificar data e autorização. Encaminhar ao IBAMA se posterior a 2008 sem ASV.',
  },
  QUEIMADA_DETECTADA: {
    rotulo: 'Cicatriz de queimada',
    significadoLegal: 'Fogo detectado (INPE). Não prova crime — pode ser queima controlada autorizada ou natural.',
    acao: 'Verificar autorização e comunicar o órgão ambiental.',
  },
  APP_HIDROGRAFIA: {
    rotulo: 'APP de curso d’água/nascente',
    significadoLegal: 'Faixa de APP (Código Florestal, art. 4°) dentro do perímetro. Não é infração — pode declarar e recompor.',
    acao: 'Verificar obrigação de recomposição e registrar a APP no CAR.',
  },
  SOBREPOSICAO_CAR_VIZINHO: {
    rotulo: 'Sobreposição com CAR vizinho',
    significadoLegal: 'Coincide com imóvel CAR registrado. Pode ser dupla declaração ou erro de divisa — não diz qual imóvel está errado.',
    acao: 'Confrontar matrículas e georreferenciamento no INCRA.',
  },
};

const CAMADA_PARA_CODIGO: Record<CamadaTipo, CodigoAviso> = {
  terra_indigena: 'INVASAO_TERRA_INDIGENA',
  unidade_conservacao: 'INVASAO_UNIDADE_CONSERVACAO',
  embargo_ibama: 'EMBARGO_IBAMA',
  desmatamento: 'DESMATAMENTO_DETECTADO',
  queimada: 'QUEIMADA_DETECTADA',
  app_hidrografia: 'APP_HIDROGRAFIA',
  hidrografia: 'APP_HIDROGRAFIA',
  car_vizinho: 'SOBREPOSICAO_CAR_VIZINHO',
};

function montar(
  codigo: CodigoAviso,
  severidade: Severidade,
  origem: AvisoConferencia['origem'],
  dadosOffline: boolean,
  detalhe?: string,
): AvisoConferencia {
  return { codigo, severidade, origem, dadosOffline, detalhe, ...CATALOGO[codigo] };
}

const PESO_SEVERIDADE: Record<Severidade, number> = { critico: 2, alerta: 1, info: 0 };

// ---------------------------------------------------------------------------
// Geração do painel
// ---------------------------------------------------------------------------

/**
 * Gera o painel de avisos da conferência a partir dos motores existentes.
 *
 * @param conferido Pontos da nova medição do analista.
 * @param analise   Resultado de analisarSobreposicoes(conferido) — camadas oficiais.
 * @param delta     Resultado de compararPerimetros(declarado, conferido) ou null.
 */
export function gerarPainelAvisos(
  conferido: LngLat[],
  analise: AnaliseAmbiental | null,
  delta: DeltaRelatorio | null,
): PainelAvisos {
  const offline = (analise?.fonteDados ?? delta?.fonteDados ?? 'online') !== 'online';
  const avisos: AvisoConferencia[] = [];

  // 1) Geometria — demarcação errada
  const val = validatePerimeter(conferido);
  if (!val.ok) {
    avisos.push(montar('DEMARCACAO_ERRADA', 'critico', 'geometria', offline, val.problemas[0]));
  }

  // 2) Delta — divergência de área entre declarado e conferido
  if (delta) {
    const absPct = Math.abs(delta.delta_pct);
    const detalhe = `${delta.delta_ha >= 0 ? '+' : ''}${delta.delta_ha.toFixed(1)} ha (${delta.delta_pct >= 0 ? '+' : ''}${delta.delta_pct.toFixed(0)}%)`;
    if (delta.tipoAlteracao === 'deslocamento') {
      avisos.push(montar('DESLOCAMENTO_DIVISAS', 'alerta', 'delta', offline, detalhe));
    } else if (absPct > 20) {
      avisos.push(montar('DIVERGENCIA_AREA_CRITICA', 'critico', 'delta', offline, detalhe));
    } else if (absPct >= 5) {
      avisos.push(montar('DIVERGENCIA_AREA_MODERADA', 'alerta', 'delta', offline, detalhe));
    }
  }

  // 3) Sobreposições com camadas oficiais
  for (const sb of analise?.sobreposicoes ?? ([] as Sobreposicao[])) {
    const codigo = CAMADA_PARA_CODIGO[sb.tipo];
    const detalhe = `${sb.area_ha.toFixed(1)} ha (${sb.percentual.toFixed(0)}%)`;
    avisos.push(montar(codigo, sb.severidade, 'sobreposicao', offline, detalhe));
  }

  // Ordena por severidade (crítico → alerta → info), depois geometria > delta > sobreposição.
  const pesoOrigem = { geometria: 2, delta: 1, sobreposicao: 0 } as const;
  avisos.sort(
    (a, b) =>
      PESO_SEVERIDADE[b.severidade] - PESO_SEVERIDADE[a.severidade] ||
      pesoOrigem[b.origem] - pesoOrigem[a.origem],
  );

  const severidadeGeral = avisos[0]?.severidade ?? null;
  const requerVisita = avisos.some((a) => a.severidade === 'critico' || a.severidade === 'alerta');
  return { avisos, severidadeGeral, requerVisita, temDadosOffline: offline };
}
