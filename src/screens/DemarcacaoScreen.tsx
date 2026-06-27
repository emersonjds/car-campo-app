// Tela de Demarcação — Passo 2 do wizard.
// Suporta dois modos: GPS real (usePerimeterTracker) e Simulação de caminhada (useSimulatedWalk).
// Offline-first: grava geometry localmente via updateImovel; nunca bloqueia por falta de rede.
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Circle, Marker, Polygon, Polyline } from 'react-native-maps';

import { Screen } from '../app/Screen';
import { WizardSteps } from '../app/WizardSteps';
import { useNav } from '../app/navigation';
import { areaHectares, perimeterM, simplifyRDP, type LngLat } from '../lib/geo';
import { getImovel, updateImovel } from '../lib/store';
import { DEMO_ROUTES } from '../sim/routes';
import { useSimulatedWalk } from '../sim/useSimulatedWalk';
import { usePerimeterTracker } from '../hooks/usePerimeterTracker';
import { Badge, PrimaryButton, SecondaryButton, StatBox } from '../ui';
import { colors } from '../theme/colors';
import { derivarAPP, appDentroDoImovel, type AppResultado } from '../lib/app';
import { DEMO_HIDROGRAFIA } from '../lib/refLayers.demo';

// ---------- tipos ----------

type Mode = 'gps' | 'sim';

// ---------- helpers ----------

const toLatLng = (p: LngLat) => ({ latitude: p.latitude, longitude: p.longitude });

function validatePerimeterLocal(points: LngLat[]): Array<{ msg: string; tone: 'aviso' | 'ok' }> {
  const issues: Array<{ msg: string; tone: 'aviso' | 'ok' }> = [];
  if (points.length === 0) return issues;
  if (points.length < 3) {
    issues.push({ msg: `Faltam ${3 - points.length} vértice(s) para fechar o polígono`, tone: 'aviso' });
    return issues;
  }
  const area = areaHectares(points);
  if (area < 0.05) {
    issues.push({ msg: `Área muito pequena (${(area * 10000).toFixed(0)} m²) — verifique os pontos`, tone: 'aviso' });
  } else if (area > 2500) {
    issues.push({ msg: `Área acima de 2.500 ha — confirme os vértices`, tone: 'aviso' });
  } else {
    issues.push({ msg: `Polígono válido (${area.toFixed(2)} ha)`, tone: 'ok' });
  }
  return issues;
}

// ---------- constantes de layout ----------

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAP_HEIGHT = Math.max(200, Math.floor(SCREEN_HEIGHT * 0.32));

const DEFAULT_REGION = {
  latitude: DEMO_ROUTES[0]!.vertices[0]!.latitude,
  longitude: DEMO_ROUTES[0]!.vertices[0]!.longitude,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

// ---------- camadas estáticas de hidrografia e APP ----------
// Computadas uma vez no carregamento do módulo — DEMO_HIDROGRAFIA é imutável.
// derivarAPP é puro JS offline (turf/buffer) e nunca lança exceção.

/** Polígonos de APP derivados da hidrografia de demo (faixas e raios do Código Florestal). */
const APP_CAMADAS_DEMO = derivarAPP(DEMO_HIDROGRAFIA);

/**
 * Feições de hidrografia convertidas para render no react-native-maps.
 * Nascente → center {lat,lon}; Rio → coords[] (anel exterior do polígono fino).
 */
const HIDRO_FEATURES = DEMO_HIDROGRAFIA.map((feat) => {
  const isNascente = feat.nome.toLowerCase().includes('nascente');
  const ring = feat.rings[0] ?? [];
  if (isNascente) {
    const validPts = ring.filter((c) => c.length >= 2);
    const count = validPts.length || 1;
    const lon = validPts.reduce((s, c) => s + (c[0] ?? 0), 0) / count;
    const lat = validPts.reduce((s, c) => s + (c[1] ?? 0), 0) / count;
    return { isNascente: true as const, center: { latitude: lat, longitude: lon } };
  } else {
    const coords = ring.map((coord) => ({
      latitude: coord[1] ?? 0,
      longitude: coord[0] ?? 0,
    }));
    return { isNascente: false as const, coords };
  }
});

/** Anéis exteriores dos polígonos de APP convertidos para react-native-maps. */
const APP_POLY_COORDS = APP_CAMADAS_DEMO.map((feat) => {
  const ring = feat.rings[0] ?? [];
  return ring.map((coord) => ({
    latitude: coord[1] ?? 0,
    longitude: coord[0] ?? 0,
  }));
});

// ---------- sub-componentes ----------

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <View style={s.modeRow}>
      <TouchableOpacity
        style={[s.modeBtn, mode === 'gps' && s.modeBtnActive]}
        onPress={() => onChange('gps')}
        activeOpacity={0.8}
      >
        <Text style={[s.modeBtnText, mode === 'gps' && s.modeBtnTextActive]}>
          GPS real
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.modeBtn, mode === 'sim' && s.modeBtnActive]}
        onPress={() => onChange('sim')}
        activeOpacity={0.8}
      >
        <Text style={[s.modeBtnText, mode === 'sim' && s.modeBtnTextActive]}>
          Simular caminhada
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function SpeedSelector({
  speed,
  onSelect,
}: {
  speed: 1 | 2 | 4;
  onSelect: (s: 1 | 2 | 4) => void;
}) {
  return (
    <View style={s.speedRow}>
      <Text style={s.speedLabel}>Velocidade:</Text>
      {([1, 2, 4] as const).map((v) => (
        <TouchableOpacity
          key={v}
          style={[s.speedBtn, speed === v && s.speedBtnActive]}
          onPress={() => onSelect(v)}
          hitSlop={8}
        >
          <Text style={[s.speedBtnText, speed === v && s.speedBtnTextActive]}>{v}x</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ---------- marcador do avatar com anel pulsante ----------

function AvatarMarker({ coordinate, pulse }: { coordinate: LngLat; pulse: Animated.Value }) {
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });

  return (
    <Marker coordinate={toLatLng(coordinate)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges>
      <View style={s.avatarWrap}>
        <Animated.View
          style={[
            s.avatarRing,
            { transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />
        <View style={s.avatarDot}>
          <Text style={s.avatarEmoji}>🚶</Text>
        </View>
      </View>
    </Marker>
  );
}

// ---------- tela principal ----------

export function DemarcacaoScreen({ imovelId }: { imovelId: string }) {
  const { navigate } = useNav();
  const [mode, setMode] = useState<Mode>('sim');
  const [selectedRouteId, setSelectedRouteId] = useState(DEMO_ROUTES[0]!.id);
  const [saving, setSaving] = useState(false);
  const [imovelLoaded, setImovelLoaded] = useState(false);
  const [appResultado, setAppResultado] = useState<AppResultado | null>(null);

  // Hooks de captura (ambos sempre ativos — lei dos hooks)
  const sim = useSimulatedWalk();
  const tracker = usePerimeterTracker();

  // Referência do mapa para animateToRegion
  const mapRef = useRef<MapView>(null);
  const lastRegionUpdateRef = useRef(0);

  // Animação de pulso do avatar
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  // Pontos e avatar ativos conforme o modo
  const activePoints: LngLat[] = mode === 'sim' ? sim.points : tracker.points;
  const activeAvatar: LngLat | null = mode === 'sim' ? sim.avatar : tracker.current;

  // ---------- efeito: carrega geometry existente ----------
  useEffect(() => {
    let alive = true;
    getImovel(imovelId).then((imovel) => {
      if (!alive || !imovel) return;
      setImovelLoaded(true);
      // Se já houver geometry salva, poderia restaurar — neste stub apenas marcamos carregado
    });
    return () => {
      alive = false;
    };
  }, [imovelId]);

  // ---------- efeito: animação de pulso ----------
  useEffect(() => {
    if (activeAvatar) {
      pulseRef.current?.stop();
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      );
      pulseRef.current = anim;
      anim.start();
      // Para a animação ao desmontar/ocultar o avatar (evita leak na thread nativa).
      return () => anim.stop();
    }
    pulseRef.current?.stop();
    pulseAnim.setValue(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAvatar !== null]);

  // ---------- efeito: segue o avatar no mapa (throttled a 1 Hz) ----------
  useEffect(() => {
    if (!activeAvatar || !mapRef.current) return;
    const now = Date.now();
    if (now - lastRegionUpdateRef.current < 1000) return;
    lastRegionUpdateRef.current = now;
    mapRef.current.animateToRegion(
      {
        latitude: activeAvatar.latitude,
        longitude: activeAvatar.longitude,
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
      },
      500,
    );
  }, [activeAvatar]);

  // ---------- APP: cálculo ao vivo com debounce ----------
  // Roda sobre a geometria simplificada (RDP) para performance.
  // Só calcula com >= 3 pontos. Cleanup de timer garantido no retorno do effect.
  useEffect(() => {
    if (activePoints.length < 3) {
      setAppResultado(null);
      return;
    }
    const timer = setTimeout(() => {
      try {
        const simplified = simplifyRDP(activePoints, 3);
        const pts = simplified.length >= 3 ? simplified : activePoints;
        setAppResultado(appDentroDoImovel(pts, APP_CAMADAS_DEMO));
      } catch {
        // Geometria inválida — não quebrar a UI (offline-first)
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [activePoints]);

  // ---------- polígono / polyline ----------

  // Trail estático: só recalcula quando um vértice é marcado (não a cada tick de 30fps).
  const trailBase = useMemo(() => activePoints.map(toLatLng), [activePoints]);

  // Último vértice marcado — ponto de origem do segmento vivo (O(1), sem useMemo).
  const lastTrailPt = trailBase.length > 0 ? trailBase[trailBase.length - 1] : undefined;

  const polygonCoords = useMemo(() => {
    if (activePoints.length < 3) return null;
    return activePoints.map(toLatLng);
  }, [activePoints]);

  // ---------- stats derivadas ----------
  const area = useMemo(() => areaHectares(activePoints), [activePoints]);
  const perimeter = useMemo(() => perimeterM(activePoints), [activePoints]);
  const validations = useMemo(() => validatePerimeterLocal(activePoints), [activePoints]);

  // ---------- handlers ----------

  const handleModeChange = useCallback(
    (m: Mode) => {
      if (m === mode) return;
      sim.reset();
      tracker.reset();
      setMode(m);
    },
    [mode, sim, tracker],
  );

  const handleSimStart = useCallback(() => {
    sim.start(selectedRouteId);
  }, [sim, selectedRouteId]);

  const handleClear = useCallback(() => {
    sim.reset();
    tracker.reset();
  }, [sim, tracker]);

  const handleSave = useCallback(async () => {
    if (activePoints.length < 3) return;
    setSaving(true);
    try {
      await updateImovel(imovelId, {
        geometry: {
          points: activePoints,
          area_ha: area,
          perimetro_m: perimeter,
        },
      });
      navigate({ name: 'documentos', imovelId });
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar a demarcação. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }, [activePoints, area, perimeter, imovelId, navigate]);

  const handleGpsStart = useCallback(() => {
    tracker.start();
  }, [tracker]);

  // ---------- render do painel de controle ----------

  const simPanel = (
    <View>
      {/* Seletor de rota */}
      <Text style={s.panelLabel}>Rota de demonstração (área real)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.routeScroll}>
        {DEMO_ROUTES.map((route) => {
          const active = selectedRouteId === route.id;
          return (
            <TouchableOpacity
              key={route.id}
              style={[s.routeChip, active && s.routeChipActive]}
              onPress={() => setSelectedRouteId(route.id)}
              disabled={sim.status === 'walking'}
            >
              <Text
                style={[s.routeChipText, active && s.routeChipTextActive]}
                numberOfLines={2}
              >
                {route.nome}
              </Text>
              <Text
                style={[s.routeChipBioma, active && s.routeChipTextActive]}
                numberOfLines={1}
              >
                🌿 {route.bioma}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={s.routeFonte}>
        {DEMO_ROUTES.find((r) => r.id === selectedRouteId)?.fonte ??
          'Bases: SICAR/CAR · INCRA SIGEF · MapBiomas · INPE'}
      </Text>

      {/* Controle de velocidade */}
      <SpeedSelector speed={sim.speed as 1 | 2 | 4} onSelect={sim.setSpeed} />

      {/* Barra de progresso */}
      {sim.status !== 'idle' && (
        <>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { flex: sim.progress }]} />
            <View style={{ flex: 1 - sim.progress }} />
          </View>
          <Text style={s.progressText}>
            {sim.status === 'walking'
              ? `Caminhando… ${Math.round(sim.progress * 100)}%`
              : sim.status === 'paused'
                ? `Pausado em ${Math.round(sim.progress * 100)}%`
                : 'Caminhada concluída'}
          </Text>
        </>
      )}
      {/* O botão de iniciar/pausar/avançar fica no rodapé fixo (sempre visível). */}
    </View>
  );

  const gpsPanel = (
    <View>
      {tracker.status === 'denied' && (
        <Badge tone="aviso">Permissao de localizacao negada. Verifique as configuracoes.</Badge>
      )}
      <Text style={s.gpsHint}>
        {tracker.status === 'tracking'
          ? 'Caminhe rente à divisa. Use “Marcar canto” nas quinas.'
          : 'Toque em “Iniciar caminhada” no rodapé e ande pelo perímetro do imóvel.'}
      </Text>
    </View>
  );

  // ---------- ação principal do rodapé (sempre visível, depende do modo/estado) ----------

  type FooterAction = {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
  };

  let footerPrimary: FooterAction;
  let footerSecondary: FooterAction;

  const canSave = activePoints.length >= 3;
  const saveAction: FooterAction = {
    label: 'Salvar e avancar →',
    onPress: handleSave,
    loading: saving,
  };
  const limparAction: FooterAction = {
    label: 'Limpar',
    onPress: handleClear,
    disabled: activePoints.length === 0 && sim.status === 'idle' && tracker.status === 'idle',
  };

  if (mode === 'sim') {
    if (sim.status === 'idle') {
      footerPrimary = { label: '▶  Iniciar simulacao', onPress: handleSimStart };
      footerSecondary = limparAction;
    } else if (sim.status === 'walking') {
      footerPrimary = { label: '⏸  Pausar', onPress: sim.pause };
      footerSecondary = { label: '↺ Recomecar', onPress: handleSimStart };
    } else if (sim.status === 'paused') {
      // "Retomar" SEMPRE disponível — nunca deixar o usuário sem caminho para continuar.
      // Se já há >= 3 vértices, "Salvar" ocupa o secundário; senão, "Recomecar".
      footerPrimary = { label: '▶  Retomar', onPress: sim.resume };
      footerSecondary = canSave ? saveAction : { label: '↺ Recomecar', onPress: handleSimStart };
    } else {
      // done
      footerPrimary = canSave ? saveAction : { label: '↺ Recomecar', onPress: handleSimStart };
      footerSecondary = { label: '↺ Recomecar', onPress: handleSimStart };
    }
  } else {
    // GPS real
    if (tracker.status === 'tracking') {
      footerPrimary = { label: '＋ Marcar canto', onPress: tracker.addManualPoint };
      footerSecondary = { label: '⏸ Pausar', onPress: tracker.pause };
    } else if (tracker.status === 'requesting') {
      footerPrimary = { label: 'Aguardando GPS…', onPress: () => {}, disabled: true };
      footerSecondary = limparAction;
    } else if (canSave) {
      footerPrimary = saveAction;
      footerSecondary = { label: 'Retomar GPS', onPress: tracker.start };
    } else {
      footerPrimary = { label: 'Iniciar caminhada', onPress: handleGpsStart };
      footerSecondary = limparAction;
    }
  }

  // ---------- JSX principal ----------

  return (
    <Screen
      title="Demarcacao"
      subtitle={
        imovelLoaded
          ? mode === 'sim'
            ? 'Simulando caminhada no perimetro'
            : 'Caminhe pelo perimetro do imovel'
          : 'Carregando...'
      }
    >
      <WizardSteps active={1} />

      {/* Mapa */}
      <MapView
        ref={mapRef}
        style={{ height: MAP_HEIGHT }}
        initialRegion={DEFAULT_REGION}
        mapType="satellite"
        showsUserLocation={mode === 'gps'}
        showsCompass
        showsScale
      >
        {/* Hidrografia e APP — só relevantes na rota SORRISO_SOJA (fixtures são localizadas) */}
        {mode === 'sim' && selectedRouteId === DEMO_ROUTES[0]!.id && (
          <>
            {/* APP derivada — polígonos âmbar translúcidos (Código Florestal) */}
            {APP_POLY_COORDS.map((coords, i) =>
              coords.length >= 3 ? (
                <Polygon
                  key={`app-${i}`}
                  coordinates={coords}
                  strokeColor="rgba(138,90,19,0.65)"
                  fillColor="rgba(138,90,19,0.14)"
                  strokeWidth={1.5}
                />
              ) : null,
            )}

            {/* Hidrografia — rio (Polyline azul) e nascente (Circle azul) */}
            {HIDRO_FEATURES.map((feat, i) =>
              feat.isNascente ? (
                <Circle
                  key={`hidro-${i}`}
                  center={feat.center}
                  radius={20}
                  fillColor="rgba(37,121,199,0.45)"
                  strokeColor="#2579c7"
                  strokeWidth={2}
                />
              ) : (
                <Polyline
                  key={`hidro-${i}`}
                  coordinates={feat.coords}
                  strokeColor="#2579c7"
                  strokeWidth={3}
                />
              ),
            )}
          </>
        )}

        {/* Trail estático: vértice a vértice — não muda a cada tick de 30fps */}
        {trailBase.length > 1 && (
          <Polyline
            coordinates={trailBase}
            strokeColor={colors.verdeClaro}
            strokeWidth={3}
            lineDashPattern={[8, 4]}
          />
        )}

        {/* Segmento vivo: último vértice → avatar (apenas 2 pontos pela bridge, 30fps) */}
        {activeAvatar !== null && lastTrailPt !== undefined && (
          <Polyline
            coordinates={[lastTrailPt, toLatLng(activeAvatar)]}
            strokeColor={colors.verdeClaro}
            strokeWidth={3}
            lineDashPattern={[8, 4]}
          />
        )}

        {/* Poligono quando ha vertices suficientes */}
        {polygonCoords && (
          <Polygon
            coordinates={polygonCoords}
            strokeColor={colors.verde}
            fillColor="rgba(27,107,58,0.18)"
            strokeWidth={2}
          />
        )}

        {/* Marcadores dos vertices */}
        {activePoints.map((p, i) => (
          <Marker
            key={`v-${i}`}
            coordinate={toLatLng(p)}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={s.vertexDot}>
              <Text style={s.vertexLabel}>{i + 1}</Text>
            </View>
          </Marker>
        ))}

        {/* Avatar animado */}
        {activeAvatar && (
          <AvatarMarker coordinate={activeAvatar} pulse={pulseAnim} />
        )}
      </MapView>

      {/* Painel inferior */}
      <ScrollView
        style={s.panel}
        contentContainerStyle={s.panelContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ModeToggle mode={mode} onChange={handleModeChange} />

        {/* Controles do modo ativo */}
        <View style={s.section}>{mode === 'sim' ? simPanel : gpsPanel}</View>

        {/* Stats */}
        <View style={s.statsRow}>
          <StatBox
            label="Area (ha)"
            value={activePoints.length >= 3 ? area.toFixed(2) : '--'}
          />
          <View style={s.statsGap} />
          <StatBox
            label="Perimetro (m)"
            value={activePoints.length >= 2 ? Math.round(perimeter).toString() : '--'}
          />
          <View style={s.statsGap} />
          <StatBox label="Vertices" value={activePoints.length.toString()} />
        </View>

        {/* Badges de validacao */}
        {validations.length > 0 && (
          <View style={s.badgeRow}>
            {validations.map((v, i) => (
              <Badge key={i} tone={v.tone}>
                {v.msg}
              </Badge>
            ))}
          </View>
        )}

        {/* Card de APP ao vivo — aparece apos >= 3 vertices + debounce de 500 ms */}
        {appResultado !== null && (
          <View style={s.appCard}>
            <View style={s.appCardHeader}>
              <Text style={s.appCardLabel}>APP dentro do desenho</Text>
              <Text style={s.appCardValor}>
                {appResultado.app_ha.toFixed(2)} ha ({appResultado.porcentagem.toFixed(1)}%)
              </Text>
            </View>
            {appResultado.feicoes.length > 0 ? (
              appResultado.feicoes.map((f, i) => (
                <Text key={i} style={s.appFeicao}>
                  {f.tipo === 'nascente' ? 'Nascente' : 'Margem de rio'}: {f.ha.toFixed(2)} ha
                </Text>
              ))
            ) : (
              <Text style={s.appZero}>Nenhuma APP detectada no desenho atual</Text>
            )}
            <Text style={s.appDisclaimer}>
              Estimativa de campo — nao substitui a APP oficial homologada
            </Text>
          </View>
        )}

        {/* Aviso de conclusao da caminhada simulada */}
        {mode === 'sim' && sim.status === 'done' && activePoints.length >= 3 && (
          <View style={s.doneCue}>
            <Text style={s.doneCueText}>
              ✓ Caminhada concluida — {activePoints.length} vertices, {area.toFixed(2)} ha.
              Toque em "Salvar e avancar" abaixo para ir aos documentos.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Rodape fixo: a acao principal fica SEMPRE visivel, conforme o modo/estado */}
      <View style={s.footer}>
        <View style={s.actionRow}>
          <SecondaryButton
            label={footerSecondary.label}
            onPress={footerSecondary.onPress}
            disabled={footerSecondary.disabled}
          />
          <View style={s.btnGap} />
          <PrimaryButton
            label={footerPrimary.label}
            onPress={footerPrimary.onPress}
            disabled={footerPrimary.disabled}
            loading={footerPrimary.loading}
          />
        </View>
      </View>
    </Screen>
  );
}

// ---------- estilos ----------

const s = StyleSheet.create({
  // Modo toggle
  modeRow: {
    flexDirection: 'row',
    backgroundColor: colors.verdeBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    marginBottom: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: colors.verde,
  },
  modeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
  },
  modeBtnTextActive: {
    color: colors.branco,
  },

  // Seletor de velocidade
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  speedLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    marginRight: 4,
  },
  speedBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.verdeBg,
    borderWidth: 1,
    borderColor: colors.line,
    minWidth: 44,
    alignItems: 'center',
  },
  speedBtnActive: {
    backgroundColor: colors.verde,
    borderColor: colors.verde,
  },
  speedBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.muted,
  },
  speedBtnTextActive: {
    color: colors.branco,
  },

  // Seletor de rota
  routeScroll: {
    marginBottom: 4,
  },
  routeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.verdeBg,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: 8,
    maxWidth: 220,
  },
  routeChipBioma: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.verde,
    marginTop: 3,
  },
  routeFonte: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  routeChipActive: {
    backgroundColor: colors.verdeClaro,
    borderColor: colors.verdeClaro,
  },
  routeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  routeChipTextActive: {
    color: colors.branco,
  },

  // Barra de progresso
  progressBar: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    backgroundColor: colors.verdeClaro,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.verde,
    marginBottom: 4,
  },
  gpsHint: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },

  // Painel inferior
  panel: {
    flex: 1,
    backgroundColor: colors.branco,
  },
  panelContent: {
    padding: 14,
    paddingBottom: 28,
  },
  panelLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  section: {
    marginBottom: 12,
  },

  // Botoes
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnGap: {
    width: 10,
  },
  actionRow: {
    flexDirection: 'row',
  },
  footer: {
    padding: 14,
    paddingBottom: 20,
    backgroundColor: colors.branco,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  doneCue: {
    backgroundColor: '#e2f3e8',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  doneCueText: {
    color: colors.verde,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  statsGap: {
    width: 8,
  },

  // Badges
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },

  // Avatar no mapa
  avatarWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.verdeClaro,
  },
  avatarDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.branco,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  avatarEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },

  // Vértices no mapa
  vertexDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.verde,
    borderWidth: 2,
    borderColor: colors.branco,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vertexLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.branco,
  },

  // Card de APP ao vivo
  appCard: {
    backgroundColor: '#fdf6e3',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#d4a843',
  },
  appCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  appCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.aviso,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  appCardValor: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.aviso,
  },
  appFeicao: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 2,
    paddingLeft: 6,
  },
  appZero: {
    fontSize: 12,
    color: colors.verde,
    fontStyle: 'italic',
  },
  appDisclaimer: {
    fontSize: 10,
    color: colors.muted,
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 14,
  },
});
