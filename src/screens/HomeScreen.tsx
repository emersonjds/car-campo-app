// Dashboard do Produtor — CAR Campo v2 (AgroMedição).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Polygon } from 'react-native-maps';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { useAuth } from '../auth/AuthContext';
import { Card, EmptyState, StatusChip } from '../ui';
import { colors } from '../theme/colors';
import { text } from '../theme/typography';
import { listImoveis } from '../lib/store';
import type { LngLat } from '../lib/geo';
import type { Imovel } from '../types';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtData(ms: number): string {
  return new Date(ms).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const DOC_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  matricula:    'document-text-outline',
  ccir:         'receipt-outline',
  car:          'leaf-outline',
  rg:           'card-outline',
  'foto-divisa': 'camera-outline',
  outro:        'document-outline',
};

const DOC_LABEL: Record<string, string> = {
  matricula:    'Matrícula',
  ccir:         'CCIR',
  car:          'CAR – Cadastro Ambiental Rural',
  rg:           'RG',
  'foto-divisa': 'Foto de Divisa',
  outro:        'Documento',
};

// Região de satélite que enquadra o perímetro do imóvel (ou um fallback em MT).
function regionForPoints(points: LngLat[]) {
  if (points.length === 0) {
    return { latitude: -12.545, longitude: -55.711, latitudeDelta: 0.02, longitudeDelta: 0.02 };
  }
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    // 1.6× de folga ao redor do polígono; mínimo evita zoom absurdo em terreno pequeno.
    latitudeDelta: Math.max((maxLat - minLat) * 1.6, 0.008),
    longitudeDelta: Math.max((maxLng - minLng) * 1.6, 0.008),
  };
}

/** Hero do card: satélite real do terreno, estático (sem gestos), com o perímetro. */
function TerrenoHero({ points }: { points: LngLat[] }) {
  const region = regionForPoints(points);
  return (
    <MapView
      style={s.satelite}
      mapType="satellite"
      initialRegion={region}
      liteMode
      scrollEnabled={false}
      zoomEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      pointerEvents="none"
    >
      {points.length >= 3 && (
        <Polygon
          coordinates={points}
          strokeColor={colors.branco}
          strokeWidth={2}
          fillColor="rgba(45,90,39,0.35)"
        />
      )}
    </MapView>
  );
}

type ChipStatus = 'regularizado' | 'aviso' | 'critico' | 'info';

function resolveChip(im: Imovel): ChipStatus {
  if (im.validacao?.status === 'aprovado') return 'regularizado';
  if (im.alertaDivergencia?.severidade === 'critico') return 'critico';
  if (im.alertaDivergencia) return 'aviso';
  return im.status === 'enviado' ? 'info' : 'aviso';
}

/** Card de um imóvel — usado no carrossel horizontal "Meus Terrenos". */
function TerrenoCard({ im, width, onPress }: { im: Imovel; width: number; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Ver detalhes de ${im.imovel.nome}`}>
    <Card style={[s.terrenoCard, { width }]}>
      <View style={s.satWrap}>
        <TerrenoHero points={im.geometry.points} />
        <View style={s.chipWrap}>
          <StatusChip status={resolveChip(im)} />
        </View>
      </View>

      <View style={s.terrenoRow}>
        <View style={s.terrenoLeft}>
          <Text style={s.terrenoNome} numberOfLines={2}>{im.imovel.nome}</Text>
          <Text style={s.terrenoLoc}>
            {[im.imovel.municipio, im.imovel.uf].filter(Boolean).join(', ')}
          </Text>
        </View>
        <View style={s.hectaresBox}>
          <Text style={s.hectaresLbl}>HECTARES</Text>
          <Text style={s.hectaresVal}>{Math.round(im.geometry.area_ha)}</Text>
        </View>
      </View>

      <View style={s.metaRow}>
        <View style={s.metaCol}>
          <Text style={s.metaLbl}>Solo</Text>
          <Text style={s.metaVal}>{im.imovel.uso ?? 'Soja'}</Text>
        </View>
        <View style={s.metaSep} />
        <View style={s.metaCol}>
          <Text style={s.metaLbl}>Última Medição</Text>
          <Text style={s.metaVal}>{fmtData(im.updatedAt)}</Text>
        </View>
        <View style={s.metaSep} />
        <View style={s.metaCol}>
          <Text style={s.metaLbl}>CAR</Text>
          <Text style={s.metaVal}>{im.status === 'enviado' ? 'Ativo' : 'Rascunho'}</Text>
        </View>
      </View>
    </Card>
    </TouchableOpacity>
  );
}

// Botão de ação com ícone — exclusivo do dashboard.
// ponytail: mantido local; exportar para ui/index quando outra tela precisar.
function ActionBtn({
  icon,
  label,
  onPress,
  primary = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.actionBtn, primary && s.actionBtnPrimary]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[s.actionIconCircle, primary && s.actionIconCirclePrimary]}>
        <Ionicons
          name={icon}
          size={20}
          color={primary ? colors.branco : colors.secondary}
        />
      </View>
      <Text style={[s.actionLabel, primary && s.actionLabelPrimary]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Tela ───────────────────────────────────────────────────────────────────────

export function HomeScreen() {
  const { navigate, switchTab } = useNav();
  const { sessao } = useAuth();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);

  const load = useCallback(() => {
    listImoveis().then(setImoveis);
  }, []);
  // Remonta ao voltar (Router troca de rota) — efeito de montagem suficiente.
  useEffect(() => load(), [load]);

  const primario = imoveis[0] ?? null;
  // Documentos do imóvel principal, limitado a 3 para não sobrecarregar.
  const docs = primario?.documentos.slice(0, 3) ?? [];
  // Histórico: imóveis com geometria demarcada.
  const medicoes = imoveis.filter((im) => im.geometry.points.length >= 3);

  // Carrossel "Meus Terrenos" — largura proporcional à tela, com peek do próximo.
  const { width: winW } = useWindowDimensions();
  const GAP = 12;
  const CARD_W = winW - 32; // deixa ~16px do próximo card aparecendo (afordância de swipe)
  const [terrenoIdx, setTerrenoIdx] = useState(0);
  const onTerrenoScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setTerrenoIdx(Math.round(e.nativeEvent.contentOffset.x / (CARD_W + GAP)));
  };

  return (
    <Screen showBack={false}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Saudação ───────────────────────────────────────── */}
        <View style={s.greeting}>
          <Text style={s.greetingSub}>Bem-vindo ao seu painel,</Text>
          <Text style={s.greetingName}>
            Olá, {sessao?.nome?.split(' ')[0] ?? 'Produtor'}
          </Text>
        </View>

        {imoveis.length === 0 ? (
          <EmptyState
            title="Nenhum imóvel cadastrado"
            hint="Toque em + para cadastrar e desenhar o perímetro do seu terreno caminhando."
          />
        ) : (
          <>
            {/* ── Meus Terrenos ───────────────────────────────── */}
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Meus Terrenos</Text>
              {imoveis.length > 1 && (
                <TouchableOpacity
                  onPress={() => switchTab({ name: 'medicoes' })}
                  hitSlop={8}
                  accessibilityLabel="Ver todos os imóveis"
                >
                  <Text style={s.verTodos}>Ver todos</Text>
                </TouchableOpacity>
              )}
            </View>

            {imoveis.length === 1 ? (
              <TerrenoCard
                im={imoveis[0]!}
                width={CARD_W}
                onPress={() => navigate({ name: 'imovel-detalhe', imovelId: imoveis[0]!.id })}
              />
            ) : (
              <>
                <FlatList
                  data={imoveis}
                  keyExtractor={(im) => im.id}
                  renderItem={({ item }) => (
                    <TerrenoCard
                      im={item}
                      width={CARD_W}
                      onPress={() => navigate({ name: 'imovel-detalhe', imovelId: item.id })}
                    />
                  )}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={CARD_W + GAP}
                  decelerationRate="fast"
                  snapToAlignment="start"
                  ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
                  onMomentumScrollEnd={onTerrenoScroll}
                  style={s.carousel}
                  contentContainerStyle={s.carouselContent}
                />
                {/* Pontinhos indicadores de página */}
                <View style={s.dots}>
                  {imoveis.map((im, i) => (
                    <View key={im.id} style={[s.dot, i === terrenoIdx && s.dotActive]} />
                  ))}
                </View>
              </>
            )}

            {/* ── Ações Rápidas ────────────────────────────────── */}
            <Text style={[s.sectionTitle, s.sectionMt]}>Ações Rápidas</Text>
            <ActionBtn
              icon="locate-outline"
              label="Iniciar Nova Medição"
              primary
              onPress={() =>
                navigate(imoveis.length > 1 ? { name: 'selecionar-imovel' } : { name: 'cadastro' })
              }
            />
            <ActionBtn
              icon="document-text-outline"
              label="Consultar Documentos"
              onPress={() => switchTab({ name: 'documentos-hub' })}
            />
            <ActionBtn
              icon="map-outline"
              label="Visualizar Mapas"
              onPress={() =>
                primario
                  ? navigate({ name: 'demarcacao', imovelId: primario.id })
                  : navigate({ name: 'cadastro' })
              }
            />

            {/* ── Documentos Recentes ──────────────────────────── */}
            <Text style={[s.sectionTitle, s.sectionMt]}>Documentos Recentes</Text>

            {docs.length === 0 ? (
              <Card>
                <Text style={s.emptyCard}>Nenhum documento anexado ainda.</Text>
              </Card>
            ) : (
              <Card>
                {docs.map((d, i) => (
                  <View key={d.id}>
                    {i > 0 && <View style={s.divider} />}
                    <View style={s.docRow}>
                      <Ionicons
                        name={DOC_ICON[d.tipo] ?? 'document-outline'}
                        size={22}
                        color={colors.mutedText}
                      />
                      <View style={s.docInfo}>
                        <Text style={s.docNome} numberOfLines={1}>
                          {d.nome || DOC_LABEL[d.tipo] || 'Documento'}
                        </Text>
                        <Text style={s.docMeta}>
                          {DOC_LABEL[d.tipo] ?? 'Doc'} · {fmtData(d.createdAt)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        hitSlop={12}
                        onPress={() =>
                          primario &&
                          navigate({ name: 'documentos', imovelId: primario.id })
                        }
                        accessibilityLabel="Ver documento"
                      >
                        <Ionicons
                          name="download-outline"
                          size={20}
                          color={colors.primary}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </Card>
            )}

            {/* ── Histórico de Medições ────────────────────────── */}
            <Text style={[s.sectionTitle, s.sectionMt]}>Histórico de Medições</Text>

            {medicoes.length === 0 ? (
              <Card>
                <Text style={s.emptyCard}>Nenhuma medição demarcada ainda.</Text>
              </Card>
            ) : (
              medicoes.slice(0, 3).map((im) => (
                <Card key={im.id} style={s.historicoCard}>
                  <View style={s.historicoHead}>
                    <View style={s.historicoIcon}>
                      <Ionicons
                        name="git-branch-outline"
                        size={22}
                        color={colors.primary}
                      />
                    </View>
                    <View style={s.historicoInfo}>
                      <Text style={s.historicoNome}>{im.imovel.nome}</Text>
                      <Text style={s.historicoSub}>
                        {im.imovel.municipio}
                        {im.imovel.uf ? ` · ${im.imovel.uf}` : ''}
                      </Text>
                    </View>
                    <Text style={s.historicoData}>{fmtData(im.updatedAt)}</Text>
                  </View>
                  <View style={s.statusRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={colors.primary}
                    />
                    <Text style={s.statusText}>STATUS: OK</Text>
                  </View>
                  <TouchableOpacity
                    style={s.detalheBtn}
                    onPress={() => navigate({ name: 'revisao', imovelId: im.id })}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Ver Detalhes do Perímetro"
                  >
                    <Text style={s.detalheBtnText}>Ver Detalhes do Perímetro</Text>
                  </TouchableOpacity>
                </Card>
              ))
            )}
          </>
        )}

        <View style={s.fabSpace} />
      </ScrollView>
    </Screen>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  scroll: { padding: 16, flexGrow: 1 },

  // Saudação
  greeting:     { marginBottom: 20 },
  greetingSub:  { ...text.body, color: colors.mutedText },
  greetingName: { ...text.headline, color: colors.inkText, marginTop: 2 },

  // Cabeçalho de seção
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { ...text.headlineSm, color: colors.inkText },
  sectionMt:    { marginTop: 24, marginBottom: 10 },
  verTodos:     { ...text.bodySemibold, color: colors.primary },

  // Carrossel horizontal — sangra além do padding da scroll p/ mostrar peek do próximo card.
  carousel: { marginHorizontal: -16 },
  carouselContent: { paddingHorizontal: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10, marginBottom: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
  dotActive: { backgroundColor: colors.primary, width: 18 },

  // Card Meus Terrenos — padding zerado para a imagem sangrar até a borda.
  terrenoCard: { padding: 0, overflow: 'hidden', marginBottom: 16 },
  satWrap: { height: 120, backgroundColor: colors.primary },
  satelite: { ...StyleSheet.absoluteFill },
  chipWrap: { position: 'absolute', top: 12, right: 12 },
  terrenoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    paddingBottom: 0,
  },
  terrenoLeft:  { flex: 1 },
  terrenoNome:  { ...text.headlineSm, fontSize: 18, lineHeight: 23, color: colors.inkText, flexShrink: 1 },
  terrenoLoc:   { ...text.caption, color: colors.mutedText, marginTop: 2 },

  // Bloco de hectares compacto (substitui o MetricBlock grande).
  hectaresBox: {
    backgroundColor: colors.verdeBg,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  hectaresLbl: { fontSize: 10, fontWeight: '700', color: colors.mutedText, letterSpacing: 0.5 },
  hectaresVal: { fontSize: 20, fontWeight: '800', color: colors.inkText, marginTop: 1 },

  // Linha Solo / Última Medição / CAR
  metaRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: colors.line,
    marginTop: 12,
  },
  metaCol: { flex: 1 },
  metaSep: { width: 1, backgroundColor: colors.line, marginHorizontal: 8 },
  metaLbl: { ...text.caption, color: colors.mutedText, marginBottom: 2 },
  metaVal: { ...text.bodySemibold, color: colors.inkText },

  // Ações Rápidas
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.branco,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 10,
    minHeight: 56,
    gap: 12,
  },
  actionBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.verdeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconCirclePrimary: { backgroundColor: 'rgba(255,255,255,0.18)' },
  actionLabel:        { ...text.bodySemibold, color: colors.inkText, flex: 1 },
  actionLabelPrimary: { color: colors.branco },

  // Documentos Recentes
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 10 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  docInfo: { flex: 1 },
  docNome:  { ...text.bodySemibold, color: colors.inkText },
  docMeta:  { ...text.caption, color: colors.mutedText, marginTop: 2 },
  emptyCard: {
    ...text.body,
    color: colors.mutedText,
    textAlign: 'center',
    paddingVertical: 8,
  },

  // Histórico de Medições
  historicoCard: { marginBottom: 10 },
  historicoHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  historicoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.verdeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historicoInfo: { flex: 1 },
  historicoNome: { ...text.bodySemibold, color: colors.inkText },
  historicoSub:  { ...text.caption, color: colors.mutedText, marginTop: 2 },
  historicoData: { ...text.caption, color: colors.mutedText },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  statusText: { ...text.label, color: colors.primary },
  detalheBtn: {
    backgroundColor: colors.inkText,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  detalheBtnText: { ...text.bodySemibold, color: colors.branco },

  // Espaço sob o FAB (60px botão + 24px bottom offset + buffer)
  fabSpace: { height: 100 },
});
