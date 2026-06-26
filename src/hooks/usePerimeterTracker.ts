import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { MAX_ACCEPTABLE_ACCURACY_M, MIN_VERTEX_DISTANCE_M } from '../lib/config';
import { distanceM, type LngLat } from '../lib/geo';

export type TrackerStatus = 'idle' | 'requesting' | 'tracking' | 'paused' | 'denied';

export interface UsePerimeterTracker {
  status: TrackerStatus;
  points: LngLat[];
  current: LngLat | null;
  start: () => Promise<void>;
  pause: () => void;
  addManualPoint: () => void;
  reset: () => void;
}

/**
 * Captura o perímetro do imóvel enquanto o produtor caminha com o celular.
 * Registra um novo vértice automaticamente a cada MIN_VERTEX_DISTANCE_M metros,
 * e permite marcar um vértice manualmente (botão "marcar canto").
 */
export function usePerimeterTracker(): UsePerimeterTracker {
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [points, setPoints] = useState<LngLat[]>([]);
  const [current, setCurrent] = useState<LngLat | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const lastRef = useRef<LngLat | null>(null);

  const handleFix = useCallback((loc: Location.LocationObject) => {
    // Descarta fixes imprecisos (regra CLAUDE.md) — não contaminam o polígono.
    if (loc.coords.accuracy != null && loc.coords.accuracy > MAX_ACCEPTABLE_ACCURACY_M) {
      return;
    }
    const fix: LngLat = {
      longitude: loc.coords.longitude,
      latitude: loc.coords.latitude,
      accuracy: loc.coords.accuracy,
      timestamp: loc.timestamp,
    };
    setCurrent(fix);

    const last = lastRef.current;
    if (!last || distanceM(last, fix) >= MIN_VERTEX_DISTANCE_M) {
      lastRef.current = fix;
      setPoints((prev) => [...prev, fix]);
    }
  }, []);

  const start = useCallback(async () => {
    setStatus('requesting');
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== 'granted') {
      setStatus('denied');
      return;
    }
    subRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 2,
        timeInterval: 1000,
      },
      handleFix,
    );
    setStatus('tracking');
  }, [handleFix]);

  const pause = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    setStatus('paused');
  }, []);

  const addManualPoint = useCallback(() => {
    if (current) {
      lastRef.current = current;
      setPoints((prev) => [...prev, current]);
    }
  }, [current]);

  const reset = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    lastRef.current = null;
    setPoints([]);
    setCurrent(null);
    setStatus('idle');
  }, []);

  // Garante que a subscription do GPS seja removida ao desmontar (bateria!),
  // mesmo que o usuário saia da tela sem pausar.
  useEffect(() => {
    return () => {
      subRef.current?.remove();
      subRef.current = null;
    };
  }, []);

  return { status, points, current, start, pause, addManualPoint, reset };
}
