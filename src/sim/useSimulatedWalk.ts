// Hook de simulação de caminhada: anima um avatar percorrendo uma rota demo,
// emitindo posição suave e acumulando vértices como se fossem capturas GPS.
import { useCallback, useEffect, useRef, useState } from 'react';
import { distanceM, type LngLat } from '../lib/geo';
import { DEMO_ROUTES, type DemoRoute } from './routes';

export type SimStatus = 'idle' | 'walking' | 'paused' | 'done';

export interface UseSimulatedWalk {
  status: SimStatus;
  /** Vértices marcados (cantos da rota original já percorridos). */
  points: LngLat[];
  /** Posição animada do caminhante. null quando idle/done sem avatar. */
  avatar: LngLat | null;
  /** 0..1 representando progresso total da caminhada. */
  progress: number;
  /** Multiplicador de velocidade atual (1 | 2 | 4). */
  speed: number;
  /** Inicia (ou reinicia) a simulação com a rota indicada. */
  start: (routeId?: string) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  setSpeed: (s: 1 | 2 | 4) => void;
}

// ---------- constantes de animação ----------
/** Intervalo de tick em ms — ~30 fps. */
const TICK_MS = 30;
/**
 * Fração de passo avançada por tick a 1x de velocidade.
 * Cada passo ≈ 8 m. Um passo a cada 240 ms → caminhada de demonstração
 * cobre 400 m em ~12 s (1x) e ~3 s (4x).
 */
const BASE_STEP_FRACTION = 0.125; // steps/tick @ 1x speed
const STEP_M = 8; // metros entre pontos densificados
const ACCURACY_M = 5; // precisão simulada (m)

// ---------- helpers internos ----------

/** Constrói o caminho denso e registra quais índices são vértices originais. */
function buildWalkData(route: DemoRoute): { path: LngLat[]; vertexIndices: number[] } {
  const { vertices } = route;
  if (vertices.length < 2) {
    return { path: vertices.map((v) => ({ ...v, accuracy: ACCURACY_M })), vertexIndices: [0] };
  }

  const path: LngLat[] = [];
  const vertexIndices: number[] = [];
  const ring = [...vertices, vertices[0]!];

  for (let i = 0; i < ring.length - 1; i++) {
    vertexIndices.push(path.length);
    const a = ring[i]!;
    const b = ring[i + 1]!;
    const d = distanceM(a, b);
    const numSteps = Math.max(1, Math.floor(d / STEP_M));
    for (let s = 0; s < numSteps; s++) {
      const t = s / numSteps;
      path.push({
        longitude: a.longitude + (b.longitude - a.longitude) * t,
        latitude: a.latitude + (b.latitude - a.latitude) * t,
        accuracy: ACCURACY_M,
      });
    }
  }
  // ponto de fechamento
  path.push({ ...vertices[0]!, accuracy: ACCURACY_M });

  return { path, vertexIndices };
}

// ---------- hook ----------

export function useSimulatedWalk(): UseSimulatedWalk {
  const [status, setStatus] = useState<SimStatus>('idle');
  const [points, setPoints] = useState<LngLat[]>([]);
  const [avatar, setAvatar] = useState<LngLat | null>(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeedState] = useState<1 | 2 | 4>(1);

  // Refs — tudo que o timer usa para evitar closures desatualizadas
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pathRef = useRef<LngLat[]>([]);
  const vertexIndicesRef = useRef<number[]>([]);
  const originalVerticesRef = useRef<LngLat[]>([]);
  const indexRef = useRef(0);
  const nextVertexRef = useRef(0);
  const accumRef = useRef(0); // acumulador fracional de passos
  const speedRef = useRef<number>(1);

  const clearTick = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    clearTick();
    intervalRef.current = setInterval(() => {
      const path = pathRef.current;
      if (path.length === 0) return;

      // Avança pelo caminho usando acumulador fracional para movimento suave
      accumRef.current += speedRef.current * BASE_STEP_FRACTION;
      const steps = Math.floor(accumRef.current);
      accumRef.current -= steps;

      if (steps === 0) return;

      const newIdx = Math.min(indexRef.current + steps, path.length - 1);
      indexRef.current = newIdx;

      // Marca vértices originais que o avatar cruzou neste tick
      const vertexIndices = vertexIndicesRef.current;
      const origVertices = originalVerticesRef.current;
      while (
        nextVertexRef.current < vertexIndices.length &&
        newIdx >= (vertexIndices[nextVertexRef.current] ?? Infinity)
      ) {
        const ov = origVertices[nextVertexRef.current];
        if (ov) {
          setPoints((prev) => [...prev, { ...ov, accuracy: ACCURACY_M, timestamp: Date.now() }]);
        }
        nextVertexRef.current++;
      }

      const currentPoint = path[newIdx];
      if (currentPoint) {
        setAvatar({ ...currentPoint, timestamp: Date.now() });
      }
      setProgress(path.length > 1 ? newIdx / (path.length - 1) : 1);

      if (newIdx >= path.length - 1) {
        clearTick();
        setStatus('done');
      }
    }, TICK_MS);
  }, [clearTick]);

  // Limpa o timer ao desmontar
  useEffect(() => {
    return () => {
      clearTick();
    };
  }, [clearTick]);

  const start = useCallback(
    (routeId?: string) => {
      clearTick();

      const route =
        (routeId ? DEMO_ROUTES.find((r) => r.id === routeId) : undefined) ?? DEMO_ROUTES[0]!;
      const { path, vertexIndices } = buildWalkData(route);

      pathRef.current = path;
      vertexIndicesRef.current = vertexIndices;
      originalVerticesRef.current = route.vertices.map((v) => ({ ...v, accuracy: ACCURACY_M }));
      indexRef.current = 0;
      nextVertexRef.current = 0;
      accumRef.current = 0;

      // Reseta state
      setPoints([]);
      setProgress(0);
      setAvatar(path[0] ?? null);
      setStatus('walking');

      startTick();
    },
    [clearTick, startTick],
  );

  const pause = useCallback(() => {
    clearTick();
    setStatus('paused');
  }, [clearTick]);

  const resume = useCallback(() => {
    setStatus('walking');
    startTick();
  }, [startTick]);

  const reset = useCallback(() => {
    clearTick();
    pathRef.current = [];
    vertexIndicesRef.current = [];
    originalVerticesRef.current = [];
    indexRef.current = 0;
    nextVertexRef.current = 0;
    accumRef.current = 0;
    setPoints([]);
    setAvatar(null);
    setProgress(0);
    setStatus('idle');
  }, [clearTick]);

  const setSpeed = useCallback((s: 1 | 2 | 4) => {
    speedRef.current = s;
    setSpeedState(s);
  }, []);

  return { status, points, avatar, progress, speed, start, pause, resume, reset, setSpeed };
}
