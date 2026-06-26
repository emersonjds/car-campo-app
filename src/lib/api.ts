import { API_BASE_URL } from './config';
import { toGeoJSONFeature, type LngLat } from './geo';

export interface SubmitResult {
  ok: boolean;
  status: number;
  message: string;
}

/**
 * Envia o perímetro desenhado como GeoJSON para a CAR Geo API.
 *
 * Observação: a API atual (Solução 7) é somente-leitura (OGC API Features).
 * Este método já deixa o fluxo pronto: quando o endpoint de escrita
 * (POST /collections/imovel/items ou um endpoint de rascunho) existir, é só
 * apontar para ele. Por enquanto faz um POST e trata a resposta com graça.
 */
export async function submitPerimeter(
  points: LngLat[],
  properties: Record<string, unknown> = {},
): Promise<SubmitResult> {
  const feature = toGeoJSONFeature(points, properties);

  try {
    const res = await fetch(`${API_BASE_URL}/collections/imovel/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/geo+json' },
      body: JSON.stringify(feature),
    });

    if (res.ok) {
      return { ok: true, status: res.status, message: 'Perímetro enviado com sucesso.' };
    }
    if (res.status === 404 || res.status === 405) {
      return {
        ok: false,
        status: res.status,
        message:
          'A API de leitura respondeu (endpoint de escrita ainda não implementado). GeoJSON gerado e pronto para envio.',
      };
    }
    return { ok: false, status: res.status, message: `Falha no envio (HTTP ${res.status}).` };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: `Sem conexão com a API (${API_BASE_URL}). GeoJSON gerado localmente.`,
    };
  }
}

/** Verifica se a CAR Geo API está acessível. */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
