import type { LngLat } from './lib/geo';
import type { DeltaRelatorio } from './lib/delta';

export type Perfil = 'produtor' | 'analista';

// Tipos de documento do imóvel rural. Vários já existem em formato DIGITAL e
// podem ser baixados pelo próprio produtor (gov.br, INCRA, SICAR, MDA…). A
// "origem" de cada um (onde obter o PDF) fica em TIPOS_META (DocumentosScreen).
export type DocumentoTipo =
  | 'matricula' // matrícula/escritura — Cartório de Registro de Imóveis (matrícula eletrônica)
  | 'ccir' // Certificado de Cadastro de Imóvel Rural — INCRA
  | 'car' // Recibo do CAR — SICAR / Meu Imóvel Rural
  | 'car-extrato' // Extrato/Demonstrativo do CAR — SICAR / Meu Imóvel Rural
  | 'sigef' // Certidão de georreferenciamento (demarcação) — SIGEF/INCRA
  | 'caf' // Cadastro Nacional da Agricultura Familiar (substitui a DAP) — MDA
  | 'itr' // ITR / CIB-CAFIR — Receita Federal
  | 'licenca' // Licença ambiental (LP/LI/LO) ou outorga de água — órgão estadual
  | 'rg'
  | 'foto-divisa'
  | 'outro';

export interface Documento {
  id: string;
  tipo: DocumentoTipo;
  /** URI do arquivo no sandbox (file://...). Ausente em docs sincronizados (metadados gov.br). */
  uri?: string;
  nome: string;
  /** mime/type quando conhecido (image/jpeg, application/pdf, ...) */
  mime?: string;
  /** geotag opcional — fotos da divisa carregam onde foram tiradas */
  lat?: number;
  lng?: number;
  /** Procedência do documento. Default 'manual' (anexado pelo produtor). */
  origem?: 'govbr' | 'manual';
  /** Órgão emissor — preenchido para origem 'govbr' (ex.: "SICAR / Meu Imóvel Rural"). */
  orgao?: string;
  /** Data de emissão (epoch ms) — preenchido para origem 'govbr'. */
  emitidoEm?: number;
  createdAt: number;
}

export interface ImovelGeometry {
  points: LngLat[];
  area_ha: number;
  perimetro_m: number;
}

export type ImovelStatus = 'rascunho' | 'enviado';

export type ValidacaoStatus = 'pendente' | 'aprovado' | 'reprovado';

/** Resultado da análise do analista de campo sobre o imóvel. */
export interface Validacao {
  status: ValidacaoStatus;
  nota?: string;
  analista?: string;
  updatedAt: number;
}

/** Motivo da solicitação de visita técnica feita pelo produtor. */
export type MotivoVisita = 'medicao' | 'documentacao';

/** Solicitação de visita técnica (proativa do produtor). */
export interface SolicitacaoVisita {
  solicitadaEm: number;
  motivo: MotivoVisita;
  /** Resumo legível do porquê (ex.: "Acréscimo de +16,3 ha tocando área restritiva"). */
  detalhe: string;
}

export interface Produtor {
  nome: string;
  /** CPF ou CNPJ — PII (LGPD) */
  cpfCnpj: string;
  /** Telefone/WhatsApp para contato do analista (somente dígitos, com DDD). */
  telefone?: string;
}

/** Visita de campo agendada pelo analista a partir da fila de avisos. */
export interface VisitaAgendada {
  agendadaEm: number;
  /** Data planejada da visita (escolhida no calendário). Epoch ms do dia. */
  dataVisita?: number;
  /** Período do dia combinado para a visita. */
  periodo?: 'manha' | 'tarde';
  /** Slot de horário exato selecionado / início (ex.: "08:00", "14:30"). */
  horario?: string;
  /** Hora de término, quando há janela definida (ex.: "11:30"). */
  horaFim?: string;
  /** Título do evento (ex.: "Vistoria de Contorno", "Reunião de Alinhamento - INCRA"). */
  titulo?: string;
  /** Modalidade: presencial (tem local físico) ou online (tem plataforma). */
  modalidade?: 'presencial' | 'online';
  /** Plataforma quando online (ex.: "Teams", "Meet"). */
  plataforma?: string;
  /** Observação livre do analista sobre a divergência/motivo da visita. */
  observacao?: string;
  analista?: string;
}

/**
 * Informe gerado pelo SISTEMA quando a medição do produtor diverge do registro
 * anterior o suficiente para exigir visita. Gravado no save da demarcação (o
 * produtor não vê) e exibido na Triagem/Visitas do analista como "novo" até
 * ele abrir o imóvel. É a contraprova que motiva a visita de campo.
 */
export interface AlertaDivergencia {
  detectadoEm: number;
  delta_ha: number;
  delta_pct: number;
  severidade: 'critico' | 'alto' | 'medio' | 'baixo';
  /** false = ainda não visto pelo analista (mostra selo "novo"). */
  visto: boolean;
}

export interface ImovelDados {
  nome: string;
  municipio: string;
  uf: string;
  matricula?: string;
  modulosFiscais?: number;
  /** Uso predominante do solo (ex.: Soja, Milho, Gado). Rótulo no card. */
  uso?: string;
  /** Número de registro no CAR (formato UF-IBGE-hash). */
  carNumero?: string;
}

export interface Imovel {
  id: string;
  perfil: Perfil;
  produtor: Produtor;
  imovel: ImovelDados;
  geometry: ImovelGeometry;
  /**
   * Snapshot da geometria imediatamente anterior à última re-demarcação.
   * Preenchido automaticamente pelo store.updateImovel ao detectar mudança de geometry.
   * Usado pelo motor de delta (lib/delta.ts) para comparar perímetros.
   */
  geometryAnterior?: ImovelGeometry;
  /**
   * Resultado da última comparação de perímetros (delta de re-demarcação).
   * Gerado por compararPerimetros() e persistido junto com o imóvel.
   */
  deltaRelatorio?: DeltaRelatorio;
  documentos: Documento[];
  /** Epoch ms da última sincronização de documentos com o gov.br (mock). */
  documentosSincronizadosEm?: number;
  status: ImovelStatus;
  /** Análise do analista de campo (opcional — só preenchida no fluxo do analista). */
  validacao?: Validacao;
  /**
   * Solicitação de visita técnica feita pelo PRODUTOR (proativa), ao detectar
   * divergência de medição ou para conferência de documentação. Alimenta a fila
   * de visitas do analista.
   */
  solicitacaoVisita?: SolicitacaoVisita;
  /** Visita de campo agendada pelo analista (a partir da fila de avisos). */
  visitaAgendada?: VisitaAgendada;
  /**
   * Informe automático do sistema: a última medição divergiu do registro e
   * exige visita. Gerado no save da demarcação; o analista vê na triagem.
   */
  alertaDivergencia?: AlertaDivergencia;
  createdAt: number;
  updatedAt: number;
}

/** Payload para criar um novo imóvel (campos gerados pelo store ficam de fora). */
export type NovoImovel = Omit<Imovel, 'id' | 'createdAt' | 'updatedAt' | 'status'> &
  Partial<Pick<Imovel, 'status'>>;
