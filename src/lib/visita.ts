import { updateImovel } from './store';
import { submitPerimeter } from './api';
import type { Imovel, MotivoVisita, SolicitacaoVisita } from '../types';

/**
 * Registra a solicitação de visita do técnico: grava no store (offline-first)
 * e tenta publicar o perímetro preliminar na CAR Geo API (best-effort, nunca
 * bloqueia por falta de rede). Retorna o imóvel atualizado, ou null se sumiu.
 */
export async function solicitarVisitaTecnico(
  imovel: Imovel,
  motivo: MotivoVisita,
  detalhe: string,
): Promise<Imovel | null> {
  const sol: SolicitacaoVisita = { solicitadaEm: Date.now(), motivo, detalhe };
  const updated = await updateImovel(imovel.id, {
    solicitacaoVisita: sol,
    status: 'enviado',
  });

  const { imovel: dados, produtor, geometry } = imovel;
  const properties: Record<string, unknown> = {
    nome: dados.nome,
    municipio: dados.municipio,
    uf: dados.uf,
    produtor_nome: produtor.nome,
    ...(dados.matricula ? { matricula: dados.matricula } : {}),
    ...(dados.modulosFiscais != null ? { modulos_fiscais: dados.modulosFiscais } : {}),
  };
  await submitPerimeter(geometry.points, properties).catch(() => {});

  return updated;
}
