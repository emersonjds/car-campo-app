// Utilidades geoespaciais para o desenho de perímetro pelo celular.
// Trabalhamos com coordenadas WGS84 (lon/lat), como exige o GeoJSON (RFC 7946).

export interface LngLat {
  longitude: number;
  latitude: number;
  /** precisão horizontal do GPS em metros (quando disponível) */
  accuracy?: number | null;
  timestamp?: number;
}

const EARTH_RADIUS_M = 6378137; // raio equatorial WGS84

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Área de um anel (polígono fechado) em m², via fórmula geodésica de Karney/shoelace
 * esférica — boa o suficiente para imóveis rurais. `ring` em ordem lon/lat.
 */
export function ringAreaM2(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  let total = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p1 = ring[i]!;
    const p2 = ring[(i + 1) % n]!;
    total +=
      toRad(p2.longitude - p1.longitude) *
      (2 + Math.sin(toRad(p1.latitude)) + Math.sin(toRad(p2.latitude)));
  }
  total = (total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2;
  return Math.abs(total);
}

export function areaHectares(ring: LngLat[]): number {
  return ringAreaM2(ring) / 10_000;
}

/** Distância em metros entre dois pontos (Haversine). */
export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Perímetro (m) do anel fechado. */
export function perimeterM(ring: LngLat[]): number {
  if (ring.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    total += distanceM(ring[i]!, ring[(i + 1) % ring.length]!);
  }
  return total;
}

/**
 * Monta um Feature GeoJSON (Polygon) a partir dos pontos capturados.
 * Fecha o anel automaticamente. Pronto para enviar à CAR Geo API.
 */
export function toGeoJSONFeature(points: LngLat[], properties: Record<string, unknown> = {}) {
  if (points.length < 3) {
    throw new Error('São necessários ao menos 3 pontos para formar um polígono.');
  }
  const ring = points.map((p) => [p.longitude, p.latitude]);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first); // fecha o anel
  }
  return {
    type: 'Feature' as const,
    geometry: { type: 'Polygon' as const, coordinates: [ring] },
    properties: {
      area_ha: Number(areaHectares(points).toFixed(4)),
      perimetro_m: Number(perimeterM(points).toFixed(1)),
      vertices: points.length,
      ...properties,
    },
  };
}

// ---------------------------------------------------------------------------
// Interpolação e navegação geodésica
// ---------------------------------------------------------------------------

/**
 * Interpolação linear em lon/lat entre dois pontos. t ∈ [0, 1].
 * Precisa o suficiente para distâncias de caminhada (< alguns km).
 */
export function interpolate(a: LngLat, b: LngLat, t: number): LngLat {
  return {
    longitude: a.longitude + (b.longitude - a.longitude) * t,
    latitude: a.latitude + (b.latitude - a.latitude) * t,
  };
}

/**
 * Rumo inicial (azimute) de a para b, em graus geográficos (0–360°, 0 = Norte).
 * Fórmula esférica — adequada para imóveis rurais.
 */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Ponto de destino a partir de `from`, dado rumo (graus) e distância (m).
 * Fórmula geodésica esférica (direct problem). Resultado em WGS84 lon/lat.
 */
export function destinationPoint(
  from: LngLat,
  bearingDeg: number,
  distanceM: number,
): LngLat {
  const theta = toRad(bearingDeg);
  const d = distanceM / EARTH_RADIUS_M; // distância angular em radianos
  const lat1 = toRad(from.latitude);
  const lon1 = toRad(from.longitude);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(theta),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return {
    // normaliza longitude para [-180, 180]
    longitude: (((lon2 * 180) / Math.PI + 540) % 360) - 180,
    latitude: (lat2 * 180) / Math.PI,
  };
}

// ---------------------------------------------------------------------------
// Topologia de polígono — detecção de auto-interseção
// ---------------------------------------------------------------------------

/**
 * Sinal de orientação do tripla (p, q, r):
 * +1 = anti-horário, -1 = horário, 0 = colinear.
 */
function _orient(p: LngLat, q: LngLat, r: LngLat): number {
  const v =
    (q.longitude - p.longitude) * (r.latitude - p.latitude) -
    (q.latitude - p.latitude) * (r.longitude - p.longitude);
  if (Math.abs(v) < 1e-12) return 0;
  return v > 0 ? 1 : -1;
}

/** Verifica se p está sobre o segmento [a, b] (pressupõe colinearidade). */
function _onSegment(p: LngLat, a: LngLat, b: LngLat): boolean {
  return (
    Math.min(a.longitude, b.longitude) <= p.longitude &&
    p.longitude <= Math.max(a.longitude, b.longitude) &&
    Math.min(a.latitude, b.latitude) <= p.latitude &&
    p.latitude <= Math.max(a.latitude, b.latitude)
  );
}

/** Retorna true se os segmentos [a,b] e [c,d] se intersectam (própria ou colinear). */
function _segmentsIntersect(a: LngLat, b: LngLat, c: LngLat, d: LngLat): boolean {
  const o1 = _orient(a, b, c);
  const o2 = _orient(a, b, d);
  const o3 = _orient(c, d, a);
  const o4 = _orient(c, d, b);

  // Interseção própria: pontos finais de cada segmento em lados opostos
  if (o1 !== o2 && o3 !== o4) return true;

  // Casos degenerados: ponto sobre o segmento oposto
  if (o1 === 0 && _onSegment(c, a, b)) return true;
  if (o2 === 0 && _onSegment(d, a, b)) return true;
  if (o3 === 0 && _onSegment(a, c, d)) return true;
  if (o4 === 0 && _onSegment(b, c, d)) return true;

  return false;
}

/**
 * Detecta auto-interseção no anel fechado do polígono.
 * `ring` deve ser o anel aberto (n vértices distintos; o segmento n-1→0 é implícito).
 * Pares adjacentes (incluindo s_0 e s_{n-1} que compartilham ring[0]) são ignorados.
 */
export function selfIntersects(ring: LngLat[]): boolean {
  const n = ring.length;
  if (n < 4) return false; // triângulo não pode ter auto-interseção
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    // j começa em i+2 para pular o segmento adjacente seguinte
    for (let j = i + 2; j < n; j++) {
      // s_0 e s_{n-1} compartilham ring[0]: são adjacentes, ignorar
      if (i === 0 && j === n - 1) continue;
      const c = ring[j]!;
      const d = ring[(j + 1) % n]!;
      if (_segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Simplificação de trajetória GPS — Ramer–Douglas–Peucker
// ---------------------------------------------------------------------------

/**
 * Distância perpendicular (metros) de `point` ao segmento `lineStart→lineEnd`.
 * Usa projeção plana local — precisa o suficiente para percursos < 5 km.
 */
function _perpDistM(point: LngLat, lineStart: LngLat, lineEnd: LngLat): number {
  const latRef = toRad((lineStart.latitude + lineEnd.latitude) / 2);
  const mPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M;
  const mPerDegLon = mPerDegLat * Math.cos(latRef);

  const px = (point.longitude - lineStart.longitude) * mPerDegLon;
  const py = (point.latitude - lineStart.latitude) * mPerDegLat;
  const dx = (lineEnd.longitude - lineStart.longitude) * mPerDegLon;
  const dy = (lineEnd.latitude - lineStart.latitude) * mPerDegLat;

  const lenSq = dx * dx + dy * dy;
  // Segmento degenerado: usa distância entre pontos
  if (lenSq === 0) return distanceM(point, lineStart);

  // |vetor cruzado| / |AB|
  return Math.abs(px * dy - py * dx) / Math.sqrt(lenSq);
}

function _rdp(
  pts: LngLat[],
  start: number,
  end: number,
  tol: number,
  keep: boolean[],
): void {
  if (end <= start + 1) return;
  let maxDist = 0;
  let maxIdx = start;
  for (let i = start + 1; i < end; i++) {
    const d = _perpDistM(pts[i]!, pts[start]!, pts[end]!);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > tol) {
    keep[maxIdx] = true;
    _rdp(pts, start, maxIdx, tol, keep);
    _rdp(pts, maxIdx, end, tol, keep);
  }
}

/**
 * Simplificação Ramer–Douglas–Peucker para reduzir ruído de GPS.
 * Preserva sempre o primeiro e o último ponto.
 * @param toleranceM tolerância em metros (padrão 3 m — remove ruído sem distorcer divisas).
 */
export function simplifyRDP(points: LngLat[], toleranceM = 3): LngLat[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  _rdp(points, 0, points.length - 1, toleranceM, keep);
  return points.filter((_, i) => keep[i]);
}

// ---------------------------------------------------------------------------
// Validação do perímetro antes do envio à CAR Geo API
// ---------------------------------------------------------------------------

/**
 * Valida o perímetro capturado. Retorna:
 * - `problemas`: erros que bloqueiam o envio (auto-interseção, vértices insuficientes, área ~0).
 * - `avisos`: alertas que não bloqueiam (GPS impreciso, área suspeita, perímetro minúsculo).
 * - `ok`: true quando não há problemas.
 *
 * Mensagens em pt-br direcionadas ao produtor rural.
 */
export function validatePerimeter(points: LngLat[]): {
  ok: boolean;
  problemas: string[];
  avisos: string[];
} {
  const problemas: string[] = [];
  const avisos: string[] = [];

  // --- Problemas bloqueantes ---

  if (points.length < 3) {
    problemas.push('São necessários pelo menos 3 pontos para fechar o contorno do imóvel.');
    // Retorno antecipado: demais verificações dependem de ≥ 3 vértices
    return { ok: false, problemas, avisos };
  }

  if (selfIntersects(points)) {
    problemas.push('O contorno se cruza — refaça o trecho que ficou torto.');
  }

  const areaSqM = ringAreaM2(points);
  if (areaSqM < 1) {
    problemas.push(
      'A área calculada é praticamente zero — verifique se os pontos foram registrados corretamente.',
    );
  }

  // --- Avisos (não bloqueantes) ---

  // Área muito pequena (< 0,1 ha = 1 000 m²) — possível erro de captura
  if (areaSqM >= 1 && areaSqM < 1_000) {
    avisos.push(
      `Área de ${areaHectares(points).toFixed(4)} ha parece muito pequena — confira se o contorno cobre o imóvel inteiro.`,
    );
  }

  // Perímetro muito pequeno — provavelmente ruído de GPS
  const perim = perimeterM(points);
  if (perim < 10) {
    avisos.push(
      'O perímetro é menor que 10 m — pode ser ruído de GPS ou pontos muito próximos.',
    );
  }

  // Pontos com precisão de GPS ruim (accuracy > 20 m)
  const countImprecise = points.filter(
    (p) => p.accuracy != null && p.accuracy > 20,
  ).length;
  if (countImprecise > 0) {
    avisos.push(
      `${countImprecise} ponto(s) com precisão de GPS acima de 20 m — o contorno pode estar deslocado nessas regiões.`,
    );
  }

  return { ok: problemas.length === 0, problemas, avisos };
}
