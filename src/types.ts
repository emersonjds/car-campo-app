// Modelos de domínio do CAR Campo. Contrato compartilhado por todos os módulos.
import type { LngLat } from './lib/geo';

export type Perfil = 'produtor' | 'analista';

export type DocumentoTipo =
  | 'matricula'
  | 'ccir'
  | 'rg'
  | 'car'
  | 'foto-divisa'
  | 'outro';

export interface Documento {
  id: string;
  tipo: DocumentoTipo;
  /** URI do arquivo no sandbox do app (file://...) */
  uri: string;
  nome: string;
  /** mime/type quando conhecido (image/jpeg, application/pdf, ...) */
  mime?: string;
  /** geotag opcional — fotos da divisa carregam onde foram tiradas */
  lat?: number;
  lng?: number;
  createdAt: number;
}

export interface ImovelGeometry {
  points: LngLat[];
  area_ha: number;
  perimetro_m: number;
}

export type ImovelStatus = 'rascunho' | 'enviado';

export interface Produtor {
  nome: string;
  /** CPF ou CNPJ — PII (LGPD) */
  cpfCnpj: string;
}

export interface ImovelDados {
  nome: string;
  municipio: string;
  uf: string;
  matricula?: string;
  modulosFiscais?: number;
}

export interface Imovel {
  id: string;
  perfil: Perfil;
  produtor: Produtor;
  imovel: ImovelDados;
  geometry: ImovelGeometry;
  documentos: Documento[];
  status: ImovelStatus;
  createdAt: number;
  updatedAt: number;
}

/** Payload para criar um novo imóvel (campos gerados pelo store ficam de fora). */
export type NovoImovel = Omit<Imovel, 'id' | 'createdAt' | 'updatedAt' | 'status'> &
  Partial<Pick<Imovel, 'status'>>;
