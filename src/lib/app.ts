// Derivação de APP (Área de Preservação Permanente) por buffer geodésico.
//
// Implementa as regras do Código Florestal (Lei 12.651/2012, Art. 4°):
//   I  — margem de curso d'água (faixa por largura do rio)
//   IV — nascente e olho d'água perene (raio de 50 m)
//
// Faixas de margem por largura do rio (Art. 4°, I):
//   < 10 m                → 30 m (padrão — largura não informada assume-se < 10 m)
//   10 a 50 m             → 50 m
//   50 a 200 m            → 100 m
//   200 a 600 m           → 200 m
//   > 600 m               → 500 m
//
// Convenção para diferenciar nascente de margem (campo `nome` de CamadaRef):
//   • nome.toLowerCase().includes('nascente') → nascente (raio 50 m)
//   • caso contrário                          → margem de rio (faixa padrão 30 m)
//   Opcional: incluir "largura_NNm" no nome para faixas maiores (ex.: "Rio XX – largura_50m").
//
// Dependências:
//   @turf/buffer   — buffer geodésico (puro JS, offline)
//   @turf/helpers  — point(), polygon() para montar Feature<Geometry>
//   overlay.ts     — analisarSobreposicoes(), CamadaRef (reutiliza interseção)
//   geo.ts         — areaHectares() (reutiliza área geodésica)
//
// Offline-first: nunca lança exceção que quebre a UI.
// Coordenadas: WGS84 lon/lat (GeoJSON RFC 7946) — nunca reprojetar.

import buffer from '@turf/buffer';
import union from '@turf/union';
import { point as turfPoint, polygon as turfPolygon, featureCollection } from '@turf/helpers';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

import { analisarSobreposicoes, type CamadaRef } from './overlay';
import { areaHectares, type LngLat } from './geo';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/** Resultado da análise de APP dentro do imóvel. */
export interface AppResultado {
  /** Área total de APP dentro do imóvel, em hectares. */
  app_ha: number;
  /** Percentual da área do imóvel em APP (0–100). Proteção contra divisão por zero. */
  porcentagem: number;
  /** Detalhamento por feição de hidrografia. */
  feicoes: {
    tipo: 'margem_rio' | 'nascente';
    descricao: string;
    ha: number;
  }[];
}

// ---------------------------------------------------------------------------
// Constantes — regras do Código Florestal
// ---------------------------------------------------------------------------

/** Raio de APP de nascente em metros (Art. 4°, IV, Lei 12.651/2012). */
const RAIO_NASCENTE_M = 50;

/**
 * Faixa padrão de APP de margem de rio em metros (Art. 4°, I, alínea a).
 * Aplica-se a cursos d'água com < 10 m de largura — estimativa de campo
 * quando a largura não é conhecida.
 */
const FAIXA_MARGEM_PADRAO_M = 30;

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Retorna true se o nome da feição indica uma nascente (olho d'água).
 * Convenção documentada: nome.toLowerCase().includes('nascente').
 */
function _isNascente(nome: string): boolean {
  return nome.toLowerCase().includes('nascente');
}

/**
 * Calcula a faixa de APP (m) para margem de rio.
 * Se o nome contiver "largura_NNm" (ex.: "largura_50m"), usa a faixa
 * correspondente à tabela do Art. 4°, I. Caso contrário, usa o padrão 30 m.
 */
function _faixaMargemM(nome: string): number {
  // Tenta extrair largura do nome: "largura_Nm" ou "largura_NNNm"
  const match = nome.match(/largura_(\d+)m/i);
  if (match) {
    const largura = Number(match[1]);
    if (largura < 10) return 30;
    if (largura <= 50) return 50;
    if (largura <= 200) return 100;
    if (largura <= 600) return 200;
    return 500;
  }
  return FAIXA_MARGEM_PADRAO_M;
}

/**
 * Calcula o centroide aritmético dos pontos de um anel GeoJSON ([lon, lat][]).
 * Usado para converter uma nascente (polígono minúsculo) em ponto para buffer.
 */
function _centroide(ring: number[][]): [number, number] {
  const valid = ring.filter((c) => c.length >= 2);
  if (valid.length === 0) return [0, 0];
  // Ignora o ponto de fechamento (primeiro === último) para não enviesar a média.
  const n = valid.length;
  const fechado =
    n >= 2 && valid[0]![0] === valid[n - 1]![0] && valid[0]![1] === valid[n - 1]![1];
  const pts = fechado ? valid.slice(0, -1) : valid;
  const lon = pts.reduce((s, c) => s + (c[0] ?? 0), 0) / pts.length;
  const lat = pts.reduce((s, c) => s + (c[1] ?? 0), 0) / pts.length;
  return [lon, lat];
}

/**
 * Decide se a feição de hidrografia é uma nascente.
 * O campo `tipo_feicao` (quando presente) tem prioridade sobre a heurística de
 * nome — robusto para dados reais (ex.: "Córrego da Nascente" não é nascente).
 */
function _ehNascente(feat: Pick<CamadaRef, 'tipo_feicao' | 'nome'>): boolean {
  if (feat.tipo_feicao === 'nascente') return true;
  if (feat.tipo_feicao === 'curso_dagua') return false;
  return _isNascente(feat.nome);
}

/**
 * Mede a área (ha) de APP dentro do imóvel SEM dupla contagem: une todos os
 * polígonos de APP (via @turf/union) antes de intersectar com o imóvel. As
 * partes da união não se sobrepõem, então somar suas interseções é correto.
 * (Sem união, buffers de APP que se sobrepõem — ex.: nascente que é cabeceira
 * de um córrego — seriam contados duas vezes, inflando o total.)
 */
function _areaAppNoImovel(points: LngLat[], camadas: CamadaRef[]): number {
  if (camadas.length === 0) return 0;
  let merged: Feature<Polygon | MultiPolygon> = turfPolygon(camadas[0]!.rings as number[][][]);
  for (let i = 1; i < camadas.length; i++) {
    const u = union(featureCollection([merged, turfPolygon(camadas[i]!.rings as number[][][])]));
    if (u) merged = u;
  }
  const partes: CamadaRef[] =
    merged.geometry.type === 'Polygon'
      ? [{ tipo: 'app_hidrografia', nome: 'APP', fonte: 'união', rings: merged.geometry.coordinates as number[][][] }]
      : merged.geometry.coordinates.map((p) => ({
          tipo: 'app_hidrografia' as const,
          nome: 'APP',
          fonte: 'união',
          rings: p as number[][][],
        }));
  const analise = analisarSobreposicoes(points, partes);
  return analise.sobreposicoes.reduce((s, sob) => s + sob.area_ha, 0);
}

// ---------------------------------------------------------------------------
// Funções públicas
// ---------------------------------------------------------------------------

/**
 * Deriva polígonos de APP a partir de feições de hidrografia (WGS84 lon/lat).
 *
 * Para cada elemento de `hidrografia`:
 *   • nome contém 'nascente' → APP circular com raio 50 m (Art. 4°, IV).
 *   • caso contrário         → APP de margem (faixa padrão 30 m, Art. 4°, I, a).
 *     Incluir "largura_NNm" no nome para aplicar faixa proporcional à largura do rio.
 *
 * O buffer é calculado geodesicamente pelo @turf/buffer (puro JS, offline).
 * Feições com geometria inválida são ignoradas silenciosamente (offline-first).
 *
 * @param hidrografia Feições de hidrografia como CamadaRef (tipo 'hidrografia').
 * @returns           Polígonos de APP derivados (tipo 'app_hidrografia').
 *
 * Nota: a APP derivada por buffer é uma ESTIMATIVA DE CAMPO — não substitui a
 * delimitação oficial homologada pelo órgão ambiental.
 */
export function derivarAPP(hidrografia: CamadaRef[]): CamadaRef[] {
  const resultado: CamadaRef[] = [];

  for (const feat of hidrografia) {
    // Ignora feição sem anéis ou com anel vazio
    if (feat.rings.length === 0) continue;
    const anel = feat.rings[0];
    if (!anel || anel.length === 0) continue;

    try {
      let buffered: Feature<Polygon | MultiPolygon> | undefined;
      let nomeApp: string;
      // tipo_feicao tem prioridade sobre o nome (robusto para dados reais)
      const ehNasc = _ehNascente(feat);
      const tipoFeicao: 'nascente' | 'curso_dagua' = ehNasc ? 'nascente' : 'curso_dagua';

      if (ehNasc) {
        // Nascente: centroide do anel → ponto → buffer 50 m (Art. 4°, IV)
        const [lon, lat] = _centroide(anel);
        const pt = turfPoint([lon, lat]);
        buffered = buffer(pt, RAIO_NASCENTE_M, { units: 'meters' });
        nomeApp =
          `APP Nascente – raio ${RAIO_NASCENTE_M} m (estimativa de campo) [${feat.nome}]`;
      } else {
        // Margem de rio: buffer do polígono pela faixa configurada (Art. 4°, I)
        const faixa = _faixaMargemM(feat.nome);
        const poly = turfPolygon(feat.rings as number[][][]);
        buffered = buffer(poly, faixa, { units: 'meters' });
        nomeApp =
          `APP Margem de rio – faixa ${faixa} m (estimativa de campo) [${feat.nome}]`;
      }

      if (!buffered) continue;

      // Extrai rings do resultado e cria uma CamadaRef de APP por parte
      const geom = buffered.geometry;
      if (geom.type === 'Polygon') {
        resultado.push({
          tipo: 'app_hidrografia',
          tipo_feicao: tipoFeicao,
          nome: nomeApp,
          fonte: `${feat.fonte} (buffer @turf/buffer)`,
          rings: geom.coordinates as number[][][],
        });
      } else if (geom.type === 'MultiPolygon') {
        for (const part of geom.coordinates) {
          resultado.push({
            tipo: 'app_hidrografia',
            tipo_feicao: tipoFeicao,
            nome: nomeApp,
            fonte: `${feat.fonte} (buffer @turf/buffer)`,
            rings: part as number[][][],
          });
        }
      }
    } catch {
      // Geometria malformada — ignorar esta feição (offline-first: nunca quebrar UI).
    }
  }

  return resultado;
}

/**
 * Calcula a área de APP dentro do imóvel e detalha por tipo de feição.
 *
 * Reutiliza `analisarSobreposicoes` de overlay.ts para o cálculo geodésico de
 * interseção (turf, WGS84 elipsoidal) — não duplica lógica de área.
 * Reutiliza `areaHectares` de geo.ts para a área do imóvel.
 *
 * @param points     Vértices do perímetro do imóvel (WGS84). Mínimo 3 pontos.
 * @param appCamadas Polígonos de APP (tipo 'app_hidrografia'), normalmente
 *                   produzidos por `derivarAPP()`. Podem também ser camadas
 *                   de APP prontas obtidas de WFS (ex.: FBDS APP layer).
 *
 * Proteção contra divisão por zero: se área do imóvel = 0, porcentagem = 0.
 * Retorno seguro para < 3 pontos: { app_ha: 0, porcentagem: 0, feicoes: [] }.
 */
export function appDentroDoImovel(points: LngLat[], appCamadas: CamadaRef[]): AppResultado {
  // Guarda mínimo de vértices — mesma regra de analisarSobreposicoes
  if (points.length < 3) {
    return { app_ha: 0, porcentagem: 0, feicoes: [] };
  }

  const areaImovel_ha = areaHectares(points);

  // Filtra apenas camadas de APP de hidrografia para a análise
  const somentApp = appCamadas.filter((c) => c.tipo === 'app_hidrografia');

  // Total SEM dupla contagem: une todas as APP antes de medir a interseção.
  const totalApp_ha = _areaAppNoImovel(points, somentApp);

  // Detalhamento por tipo: cada grupo é unido internamente (sem dupla contagem
  // intra-tipo). Entre tipos o total já vem da união geral acima.
  const nascentes = somentApp.filter(_ehNascente);
  const margens = somentApp.filter((c) => !_ehNascente(c));

  const feicoes: AppResultado['feicoes'] = [];
  const haNascente = _areaAppNoImovel(points, nascentes);
  if (haNascente > 0) {
    feicoes.push({
      tipo: 'nascente',
      descricao: 'APP de nascente (raio 50 m)',
      ha: Number(haNascente.toFixed(4)),
    });
  }
  const haMargem = _areaAppNoImovel(points, margens);
  if (haMargem > 0) {
    feicoes.push({
      tipo: 'margem_rio',
      descricao: "APP de margem de curso d'água",
      ha: Number(haMargem.toFixed(4)),
    });
  }

  // Divisão por zero protegida: imóvel de área 0 → porcentagem 0
  const porcentagem =
    areaImovel_ha > 0 ? Math.min(100, (totalApp_ha / areaImovel_ha) * 100) : 0;

  return {
    app_ha: Number(totalApp_ha.toFixed(4)),
    porcentagem: Number(porcentagem.toFixed(2)),
    feicoes,
  };
}
