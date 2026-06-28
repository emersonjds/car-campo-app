/**
 * Módulo de exportação do CAR Campo.
 *
 * ---- Decisão LGPD — mascaramento de CPF/CNPJ ----
 * Arquivos exportados (GeoJSON, PDF) podem ser compartilhados com terceiros
 * via WhatsApp, e-mail, portais agrários etc. Para reduzir risco de exposição
 * de PII em trânsito, CPF e CNPJ são mascarados **por padrão** (`maskPii=true`):
 *   CPF  (11 dígitos): ***.456.789-**   (exibe apenas os 6 dígitos centrais)
 *   CNPJ (14 dígitos): todos os dígitos ocultos (ex.: "**.***.XXX" + barra + "****-**")
 * O nome do produtor é mantido pois é indispensável para identificação
 * no processo CAR.
 * O parâmetro `maskPii` pode ser definido como `false` apenas em contextos
 * internos onde o usuário é o próprio titular dos dados.
 *
 * ---- API de sistema de arquivos ----
 * Usa `expo-file-system/legacy` (writeAsStringAsync + documentDirectory),
 * pois a nova API `File`/`Paths` do expo-file-system 56 ainda não tem
 * suporte completo na geração de URIs para o share sheet nativo.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { Share } from 'react-native';
import { toGeoJSONFeature, areaHectares, perimeterM, type LngLat } from './geo';
import type { Imovel } from '../types';
import { API_BASE_URL } from './config';

// ---------------------------------------------------------------------------
// Utilitários internos
// ---------------------------------------------------------------------------

/**
 * Mascara CPF ou CNPJ para conformidade com LGPD ao exportar/compartilhar.
 * CPF  (11 dígitos): ***.XXX.XXX-**  — exibe dígitos 4-9.
 * CNPJ (14 dígitos): todos os dígitos ocultos (formato "XX.XXX.XXX/XXXX-XX" inteiro mascarado).
 * Outros: oculta tudo exceto os 3 últimos caracteres (fallback genérico).
 */
function maskCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  }
  if (digits.length === 14) {
    return `**.***.***/****-**`;
  }
  // Fallback: esconde tudo exceto 3 últimos chars
  if (value.length > 3) {
    return value.slice(0, -3).replace(/./g, '*') + value.slice(-3);
  }
  return '***';
}

function formatDateBR(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Dimensões fixas do croqui (compartilhadas entre o SVG e o request de satélite).
const CROQUI_W = 420;
const CROQUI_H = 280;
const CROQUI_PAD = 36;

/**
 * Transform lon/lat -> px do croqui. Devolve também o `satBbox`: o bbox
 * geográfico que corresponde ao card inteiro (0..W, 0..H), para casar o raster
 * de satélite exatamente com o polígono desenhado por cima.
 */
function croquiTransform(points: LngLat[]) {
  const lons = points.map((p) => p.longitude);
  const lats = points.map((p) => p.latitude);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const lonRange = maxLon - minLon || 1e-6;
  const latRange = maxLat - minLat || 1e-6;
  const scale = Math.min(
    (CROQUI_W - 2 * CROQUI_PAD) / lonRange,
    (CROQUI_H - 2 * CROQUI_PAD) / latRange,
  );

  const usedW = lonRange * scale;
  const usedH = latRange * scale;
  const offsetX = CROQUI_PAD + (CROQUI_W - 2 * CROQUI_PAD - usedW) / 2;
  const offsetY = CROQUI_PAD + (CROQUI_H - 2 * CROQUI_PAD - usedH) / 2;

  const toX = (lon: number): number => offsetX + (lon - minLon) * scale;
  // SVG Y cresce para baixo; lat cresce para cima — inverter
  const toY = (lat: number): number => CROQUI_H - offsetY - (lat - minLat) * scale;

  // bbox geográfico que cobre o card todo (inverso dos cantos 0,0 e W,H)
  const satBbox = {
    minLon: minLon - offsetX / scale,
    maxLon: minLon + (CROQUI_W - offsetX) / scale,
    minLat: minLat - offsetY / scale,
    maxLat: minLat + (CROQUI_H - offsetY) / scale,
  };

  return { toX, toY, satBbox };
}

/**
 * Baixa um recorte de imagem de satélite (Esri World Imagery) para o bbox e
 * devolve como data URI base64 — assim o PDF fica autossuficiente (vê offline
 * depois de gerado). Requer rede no momento da geração; em falha devolve null
 * e o croqui cai no fundo esquemático.
 * ponytail: tile público da Esri sem chave; se precisar de SLA, trocar por provedor próprio.
 */
async function fetchSatelliteDataUri(
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
): Promise<string | null> {
  try {
    const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!dir) return null;
    const b = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
    const url =
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export' +
      `?bbox=${b}&bboxSR=4326&imageSR=4326&size=${CROQUI_W * 3},${CROQUI_H * 3}` +
      '&format=jpg&f=image';
    const tmp = `${dir}sat_${Date.now()}.jpg`;
    const { uri, status } = await FileSystem.downloadAsync(url, tmp);
    if (status !== 200) return null;
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return b64 ? `data:image/jpeg;base64,${b64}` : null;
  } catch {
    return null; // offline / falha → croqui esquemático
  }
}

/** Busca o satélite do card a partir dos pontos; null se < 3 pontos ou falha. */
async function croquiSatDataUri(points: LngLat[]): Promise<string | null> {
  if (points.length < 3) return null;
  return fetchSatelliteDataUri(croquiTransform(points).satBbox);
}

/**
 * Gera o croqui SVG do polígono com vértices numerados. Se `satDataUri` for
 * passado, usa imagem de satélite de fundo (alinhada ao polígono); senão, fundo
 * esquemático offline.
 */
function buildSVGCroqui(points: LngLat[], satDataUri?: string | null): string {
  if (points.length < 3) return '';

  const W = CROQUI_W;
  const H = CROQUI_H;
  const { toX, toY } = croquiTransform(points);
  const onSat = !!satDataUri;

  const polygonPts = points
    .map((p) => `${toX(p.longitude).toFixed(1)},${toY(p.latitude).toFixed(1)}`)
    .join(' ');

  const dotLabels = points
    .map((p, i) => {
      const x = toX(p.longitude).toFixed(1);
      const y = toY(p.latitude);
      return (
        `<circle cx="${x}" cy="${y.toFixed(1)}" r="5.5" fill="#16321f" stroke="#7CFFB0" stroke-width="1.5"/>` +
        `<text x="${x}" y="${(y + 3).toFixed(1)}" text-anchor="middle" ` +
        `font-size="8.5" font-family="Arial,sans-serif" font-weight="bold" fill="#d6ffe5">${i + 1}</text>`
      );
    })
    .join('');

  const bg = onSat
    ? `<image href="${satDataUri}" xlink:href="${satDataUri}" x="0" y="0" ` +
      `width="${W}" height="${H}" preserveAspectRatio="none" ` +
      `clip-path="url(#croquiClip)" filter="url(#croquiSat)"/>` +
      `<rect width="${W}" height="${H}" rx="8" fill="none" stroke="rgba(0,0,0,0.18)"/>`
    : `<rect width="${W}" height="${H}" rx="8" fill="#eef7f0"/>`;

  const poly = onSat
    ? `<polygon points="${polygonPts}" fill="rgba(34,197,94,0.18)" stroke="#7CFFB0" stroke-width="2.5" stroke-linejoin="round"/>`
    : `<polygon points="${polygonPts}" fill="rgba(27,107,58,0.15)" stroke="#1b6b3a" stroke-width="2" stroke-linejoin="round"/>`;

  return (
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
    `xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `style="display:block;margin:0 auto;">` +
    `<defs>` +
    `<clipPath id="croquiClip"><rect width="${W}" height="${H}" rx="8"/></clipPath>` +
    // Realça o verde da lavoura: satura, dá leve contraste e puxa o canal verde.
    `<filter id="croquiSat" x="0" y="0" width="100%" height="100%">` +
    `<feColorMatrix type="saturate" values="1.35"/>` +
    `<feComponentTransfer>` +
    `<feFuncR type="linear" slope="1.06" intercept="-0.02"/>` +
    `<feFuncG type="linear" slope="1.12" intercept="0"/>` +
    `<feFuncB type="linear" slope="1.0" intercept="-0.02"/>` +
    `</feComponentTransfer></filter>` +
    `</defs>` +
    bg +
    poly +
    dotLabels +
    `</svg>`
  );
}

/** HTML do relatório completo para printToFileAsync. Layout A4, offline-safe. */
function buildHTML(imovel: Imovel, maskPii: boolean, satDataUri?: string | null): string {
  const { imovel: dados, produtor, geometry, status, createdAt } = imovel;
  const points = geometry.points;
  const area = areaHectares(points).toFixed(4);
  const perim = Number(perimeterM(points).toFixed(0)).toLocaleString('pt-BR');
  const cpfDisplay = maskPii ? maskCpfCnpj(produtor.cpfCnpj) : produtor.cpfCnpj;
  const svgCroqui = buildSVGCroqui(points, satDataUri);
  const croquiTitulo = satDataUri ? 'imagem de satélite' : 'esquemático';

  const vertexRows = points
    .map(
      (p, i) =>
        `<tr>
          <td>${i + 1}</td>
          <td>${p.latitude.toFixed(8)}</td>
          <td>${p.longitude.toFixed(8)}</td>
          <td>${p.accuracy != null ? `${p.accuracy.toFixed(1)} m` : '—'}</td>
        </tr>`,
    )
    .join('');

  const statusLabel = status === 'enviado' ? 'Enviado' : 'Rascunho';
  const statusColor = status === 'enviado' ? '#1b6b3a' : '#8a5a13';
  const statusBg = status === 'enviado' ? '#e2f3e8' : '#fbf0d9';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>CAR Campo — Demarcação do Imóvel</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1d2b22;
         background: #fff; padding: 24px; }
  h1 { color: #1b6b3a; font-size: 18px; border-bottom: 2px solid #1b6b3a;
       padding-bottom: 8px; margin-bottom: 16px; }
  h2 { color: #1b6b3a; font-size: 12px; text-transform: uppercase;
       letter-spacing: 0.6px; margin-top: 20px; margin-bottom: 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px;
          margin-bottom: 16px; }
  .info-label { font-size: 9px; color: #5d6b62; font-weight: bold;
                text-transform: uppercase; }
  .info-value { font-size: 12px; color: #1d2b22; margin-top: 2px; }
  .stats { display: flex; gap: 10px; margin: 12px 0; }
  .stat { flex: 1; background: #eef7f0; border-radius: 8px;
          padding: 10px 8px; text-align: center; }
  .stat-value { font-size: 20px; font-weight: bold; color: #1b6b3a; }
  .stat-label { font-size: 9px; color: #5d6b62; margin-top: 3px;
                text-transform: uppercase; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 99px;
           font-size: 10px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 10px; }
  th { background: #1b6b3a; color: #fff; padding: 6px 8px; text-align: left; }
  td { padding: 4px 8px; border-bottom: 1px solid #d9e4dc; }
  tr:nth-child(even) td { background: #eef7f0; }
  .croqui-wrap { margin: 12px 0; }
  .aviso { background: #fdf4e3; border-left: 4px solid #8a5a13; border-radius: 8px;
           padding: 10px 12px; margin-bottom: 16px; }
  .aviso-titulo { font-size: 11px; font-weight: bold; color: #8a5a13;
                  text-transform: uppercase; letter-spacing: 0.4px; }
  .aviso-texto { font-size: 10px; color: #1d2b22; margin-top: 4px; line-height: 1.5; }
  footer { margin-top: 24px; border-top: 1px solid #d9e4dc; padding-top: 8px;
           font-size: 9px; color: #5d6b62; text-align: center; line-height: 1.5; }
  @page { size: A4 portrait; margin: 15mm; }
</style>
</head>
<body>
<h1>CAR Campo — Medição Preliminar do Imóvel</h1>

<div class="aviso">
  <div class="aviso-titulo">Documento preliminar — não oficial</div>
  <div class="aviso-texto">
    Esta metragem foi feita pelo celular do produtor e serve como referência para adiantar
    o processo. <strong>Não substitui a medição oficial</strong>, que deve ser realizada por
    técnico habilitado (engenheiro/analista ambiental) em visita ao imóvel.
  </div>
</div>

<div class="grid">
  <div>
    <div class="info-label">Imóvel</div>
    <div class="info-value">${escHtml(dados.nome)}</div>
  </div>
  <div>
    <div class="info-label">Município / UF</div>
    <div class="info-value">${escHtml(dados.municipio)} / ${escHtml(dados.uf)}</div>
  </div>
  <div>
    <div class="info-label">Produtor</div>
    <div class="info-value">${escHtml(produtor.nome)}</div>
  </div>
  <div>
    <div class="info-label">CPF / CNPJ</div>
    <div class="info-value">${escHtml(cpfDisplay)}</div>
  </div>
  ${dados.matricula
    ? `<div><div class="info-label">Matrícula</div><div class="info-value">${escHtml(dados.matricula)}</div></div>`
    : ''}
  ${dados.modulosFiscais != null
    ? `<div><div class="info-label">Módulos Fiscais</div><div class="info-value">${dados.modulosFiscais}</div></div>`
    : ''}
  <div>
    <div class="info-label">Status</div>
    <div class="info-value">
      <span class="badge" style="background:${statusBg};color:${statusColor}">
        ${statusLabel}
      </span>
    </div>
  </div>
  <div>
    <div class="info-label">Criado em</div>
    <div class="info-value">${formatDateBR(createdAt)}</div>
  </div>
</div>

<h2>Medidas do imóvel</h2>
<div class="stats">
  <div class="stat">
    <div class="stat-value">${area}</div>
    <div class="stat-label">Área (hectares)</div>
  </div>
  <div class="stat">
    <div class="stat-value">${perim}</div>
    <div class="stat-label">Perímetro (metros)</div>
  </div>
  <div class="stat">
    <div class="stat-value">${points.length}</div>
    <div class="stat-label">Vértices GPS</div>
  </div>
</div>

${
  svgCroqui
    ? `<h2>Croqui do perímetro (${croquiTitulo})</h2>
       <div class="croqui-wrap">${svgCroqui}</div>`
    : ''
}

<h2>Coordenadas dos vértices — WGS84 (GeoJSON lon/lat)</h2>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Latitude</th>
      <th>Longitude</th>
      <th>Precisão GPS</th>
    </tr>
  </thead>
  <tbody>
    ${vertexRows}
  </tbody>
</table>

<footer>
  Gerado em ${formatDateBR(Date.now())} pelo app <strong>CAR Campo</strong>
  (haCARthon &middot; Desafio 2 &middot; Solução 4).<br>
  Coordenadas no sistema geodésico WGS84 conforme RFC 7946 (GeoJSON).<br>
  Documento preliminar e não oficial — não substitui a medição do técnico nem a
  homologação junto ao órgão ambiental competente (SICAR/IBAMA).
</footer>
</body>
</html>`;
}

/** Escapa caracteres HTML para evitar injeção no template. */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Monta um GeoJSON FeatureCollection com o perímetro do imóvel.
 *
 * CPF/CNPJ é mascarado por padrão (`maskPii = true`) para conformidade com LGPD.
 * Passe `maskPii = false` apenas quando o receptor for o próprio titular dos dados.
 */
export function buildGeoJSON(imovel: Imovel, maskPii = true): object {
  const { imovel: dados, produtor, geometry, status } = imovel;
  const cpfDisplay = maskPii ? maskCpfCnpj(produtor.cpfCnpj) : produtor.cpfCnpj;

  const feature = toGeoJSONFeature(geometry.points, {
    nome: dados.nome,
    municipio: dados.municipio,
    uf: dados.uf,
    produtor_nome: produtor.nome,
    // CPF/CNPJ mascarado conforme decisão LGPD acima
    produtor_cpf_cnpj: cpfDisplay,
    area_ha: Number(areaHectares(geometry.points).toFixed(4)),
    perimetro_m: Number(perimeterM(geometry.points).toFixed(1)),
    ...(dados.matricula ? { matricula: dados.matricula } : {}),
    ...(dados.modulosFiscais != null ? { modulos_fiscais: dados.modulosFiscais } : {}),
    status,
    gerado_em: new Date().toISOString(),
    app: 'CAR Campo · Desafio 2 · Solução 4',
  });

  return {
    type: 'FeatureCollection',
    features: [feature],
  };
}

/**
 * Serializa o GeoJSON em arquivo `.geojson` no sandbox do app
 * e abre o share sheet nativo via expo-sharing.
 *
 * Usa `expo-file-system/legacy` (writeAsStringAsync) — API estável em SDK 56.
 * Trata graciosamente o caso de sharing indisponível (lança erro descritivo).
 */
export async function exportGeoJSONFile(imovel: Imovel): Promise<void> {
  const dir = FileSystem.documentDirectory;
  if (!dir) {
    throw new Error('Sistema de arquivos não disponível neste dispositivo.');
  }

  const geojson = buildGeoJSON(imovel);
  const json = JSON.stringify(geojson, null, 2);
  const safeName = imovel.imovel.nome.replace(/[^a-zA-Z0-9À-ú]/g, '_').slice(0, 30);
  const filename = `imovel_${safeName}_${Date.now()}.geojson`;
  const uri = `${dir}${filename}`;

  await FileSystem.writeAsStringAsync(uri, json, { encoding: 'utf8' });

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error(
      'Compartilhamento não está disponível neste dispositivo. ' +
        `O arquivo foi salvo em: ${uri}`,
    );
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/geo+json',
    dialogTitle: 'Exportar GeoJSON do imóvel',
    UTI: 'public.json',
  });
}

/**
 * Abre o PDF preliminar no visualizador nativo (expo-print) para o produtor
 * VER como ficou o documento no próprio celular — com opção de salvar/imprimir.
 * Tenta usar imagem de satélite no croqui (com rede); cai no esquemático offline.
 */
export async function previewPDF(imovel: Imovel): Promise<void> {
  const sat = await croquiSatDataUri(imovel.geometry.points);
  const html = buildHTML(imovel, /* maskPii */ true, sat);
  await Print.printAsync({ html });
}

/**
 * HTML do documento preliminar (CPF mascarado — LGPD) para exibir num WebView
 * dentro do app — pré-visualização offline, sem salvar nem imprimir.
 * Mantém o croqui esquemático (sync, sem rede); o satélite entra no PDF gerado.
 */
export function documentoHTML(imovel: Imovel): string {
  return buildHTML(imovel, /* maskPii */ true);
}

/**
 * Versão async do preview: tenta embutir a imagem de satélite no croqui (precisa
 * de rede). Use no WebView mostrando primeiro `documentoHTML` (esquemático,
 * instantâneo) e trocando por esta quando resolver — com fallback offline.
 */
export async function documentoHTMLComSatelite(imovel: Imovel): Promise<string> {
  const sat = await croquiSatDataUri(imovel.geometry.points);
  return buildHTML(imovel, /* maskPii */ true, sat);
}

/**
 * Gera o relatório PDF (croqui SVG, medidas e vértices) via expo-print e abre o
 * share sheet nativo para baixar (salvar nos Arquivos) ou enviar (WhatsApp, e-mail…).
 * Usa imagem de satélite no croqui quando há rede; cai no esquemático offline.
 */
export async function exportPDF(imovel: Imovel): Promise<void> {
  const sat = await croquiSatDataUri(imovel.geometry.points);
  const html = buildHTML(imovel, /* maskPii */ true, sat);

  // Dimensões A4 em pontos (72 ppi): 595 × 842
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error(
      'Compartilhamento não está disponível neste dispositivo. ' +
        `O PDF foi salvo em: ${uri}`,
    );
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Documento preliminar de metragem',
    UTI: 'com.adobe.pdf',
  });
}

export interface LinkMedicao {
  /** Código curto (6 chars) para consultar a medição na web. */
  codigo: string;
  /** URL direta da página de visualização do PDF. */
  viewUrl: string;
  /** URL da página de consulta (CPF + código). */
  consultaUrl: string;
}

/**
 * Gera o PDF (CPF mascarado — LGPD), envia em base64 para a CAR Geo API e
 * retorna o código + as URLs de visualização e consulta. O CPF do produtor
 * (dígitos) vai junto só para a API gerar o hash de consulta — não é salvo cru.
 * Requer conexão; lança erro descritivo se a API não responder.
 */
export async function uploadPDFLink(imovel: Imovel): Promise<LinkMedicao> {
  const sat = await croquiSatDataUri(imovel.geometry.points);
  const { uri } = await Print.printToFileAsync({
    html: buildHTML(imovel, /* maskPii */ true, sat),
    width: 595,
    height: 842,
  });
  const pdf_base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const cpf = imovel.produtor.cpfCnpj.replace(/\D/g, '');
  const res = await fetch(`${API_BASE_URL}/documentos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdf_base64, nome: `medicao_${imovel.imovel.nome}`, cpf }),
  });
  if (!res.ok) {
    throw new Error('Não foi possível gerar o link agora. Tente novamente com internet.');
  }
  const data = (await res.json()) as { url: string; codigo?: string; view_url?: string };
  return {
    codigo: data.codigo ?? '',
    viewUrl: data.view_url ?? `${data.url}/ver`,
    consultaUrl: `${API_BASE_URL}/consulta`,
  };
}

/**
 * Compartilha um resumo de texto curto (WhatsApp, SMS, e-mail, etc.)
 * via Share nativo do React Native — não gera arquivo, sem dependência de rede.
 * CPF/CNPJ não é incluído no texto compartilhado (LGPD).
 */
export async function shareText(imovel: Imovel): Promise<void> {
  const { imovel: dados, produtor, geometry } = imovel;
  const area = areaHectares(geometry.points).toFixed(2);
  const perim = Number(perimeterM(geometry.points).toFixed(0)).toLocaleString('pt-BR');

  const message =
    `CAR Campo — Imóvel: ${dados.nome}\n` +
    `Produtor: ${produtor.nome}\n` +
    `Município: ${dados.municipio}/${dados.uf}\n` +
    `Área: ${area} ha | Perímetro: ${perim} m | Vértices: ${geometry.points.length}\n` +
    (dados.matricula ? `Matrícula: ${dados.matricula}\n` : '') +
    `\nGerado pelo app CAR Campo · haCARthon · Desafio 2 · Solução 4`;

  await Share.share({
    message,
    title: 'Imóvel CAR Campo',
  });
}
