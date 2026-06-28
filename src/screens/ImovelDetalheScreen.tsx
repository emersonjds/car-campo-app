// Tela de detalhe de imóvel — vista pelo produtor ao tocar num card no dashboard.
// Mostra dados cadastrais, medidas, mapa de satélite e histórico de visita técnica.
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Polygon } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { getImovel } from '../lib/store';
import type { LngLat } from '../lib/geo';
import { Card, SecondaryButton, SectionTitle, StatusChip } from '../ui';
import { colors } from '../theme/colors';
import type { Imovel } from '../types';

// ── helpers ────────────────────────────────────────────────────────────────────

// Copiado de HomeScreen — enquadra o polígono com 1.6× de folga.
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
    latitudeDelta: Math.max((maxLat - minLat) * 1.6, 0.008),
    longitudeDelta: Math.max((maxLng - minLng) * 1.6, 0.008),
  };
}

// Copiado de HomeScreen — mesma lógica de derivação de status para o chip.
type ChipStatus = 'regularizado' | 'aviso' | 'critico' | 'info';
function resolveChip(im: Imovel): ChipStatus {
  if (im.validacao?.status === 'aprovado') return 'regularizado';
  if (im.alertaDivergencia?.severidade === 'critico') return 'critico';
  if (im.alertaDivergencia) return 'aviso';
  return im.status === 'enviado' ? 'info' : 'aviso';
}

function fmtDataLonga(ms: number): string {
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Linha rótulo/valor — mesmo padrão de RevisaoScreen.
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ── tela ───────────────────────────────────────────────────────────────────────

export function ImovelDetalheScreen({ imovelId }: { imovelId: string }) {
  const { navigate } = useNav();
  const [im, setIm] = useState<Imovel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getImovel(imovelId).then((data) => {
      if (!alive) return;
      setIm(data);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [imovelId]);

  // ── loading ──
  if (loading) {
    return (
      <Screen title="Carregando" subtitle="Detalhes da propriedade">
        <View style={s.center}>
          <Text style={s.mutedText}>Carregando dados do imóvel…</Text>
        </View>
      </Screen>
    );
  }

  // ── não encontrado ──
  if (!im) {
    return (
      <Screen title="Imóvel" subtitle="Detalhes da propriedade">
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.muted} />
          <Text style={s.errorTitle}>Imóvel não encontrado.</Text>
          <Text style={s.mutedText}>Volte e tente novamente.</Text>
        </View>
      </Screen>
    );
  }

  const { imovel: dados, geometry, visitaAgendada, validacao } = im;
  const areaFormatada = Math.round(geometry.area_ha).toLocaleString('pt-BR');
  const perimetroFormatado = Math.round(geometry.perimetro_m).toLocaleString('pt-BR') + ' m';
  const periodoLabel: Record<string, string> = { manha: 'Manhã', tarde: 'Tarde' };

  return (
    <Screen title={dados.nome} subtitle="Detalhes da propriedade">
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero satélite ── */}
        <View style={s.heroWrap}>
          <MapView
            style={s.mapa}
            mapType="satellite"
            initialRegion={regionForPoints(geometry.points)}
            liteMode
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            pointerEvents="none"
          >
            {geometry.points.length >= 3 && (
              <Polygon
                coordinates={geometry.points}
                strokeColor={colors.branco}
                strokeWidth={2}
                fillColor="rgba(45,90,39,0.35)"
              />
            )}
          </MapView>
          <View style={s.chipOverlay}>
            <StatusChip status={resolveChip(im)} />
          </View>
        </View>

        {/* ── Dados do imóvel ── */}
        <Card style={s.card}>
          <SectionTitle>Dados do Imóvel</SectionTitle>

          {/* CAR em destaque — número mais importante pro produtor */}
          <View style={s.carDestaque}>
            <Text style={s.carLabel}>Número do CAR</Text>
            <Text style={s.carNumero} numberOfLines={2} selectable>
              {dados.carNumero ?? '—'}
            </Text>
          </View>

          <InfoRow label="Município / UF" value={`${dados.municipio} / ${dados.uf}`} />
          <InfoRow label="Uso do solo" value={dados.uso ?? 'Soja'} />
          <InfoRow label="Área" value={`${areaFormatada} ha`} />
          <InfoRow label="Perímetro" value={perimetroFormatado} />
          {dados.matricula ? <InfoRow label="Matrícula" value={dados.matricula} /> : null}
          {dados.modulosFiscais != null ? (
            <InfoRow label="Módulos fiscais" value={String(dados.modulosFiscais)} />
          ) : null}
        </Card>

        {/* ── Última medição ── */}
        <Card style={s.card}>
          <SectionTitle>Última medição</SectionTitle>
          <InfoRow label="Data" value={fmtDataLonga(im.updatedAt)} />
          <View style={s.btnRow}>
            <SecondaryButton
              label="Ver perímetro no mapa"
              onPress={() => navigate({ name: 'demarcacao', imovelId })}
            />
          </View>
        </Card>

        {/* ── Validação aprovada (quando existir) ── */}
        {validacao?.status === 'aprovado' && (
          <View style={s.validacaoOk}>
            <Ionicons name="checkmark-circle" size={20} color={colors.verde} />
            <View style={s.validacaoTexto}>
              <Text style={s.validacaoTitulo}>Perímetro validado</Text>
              {validacao.analista ? (
                <Text style={s.validacaoSub}>
                  por {validacao.analista} em {fmtDataLonga(validacao.updatedAt)}
                </Text>
              ) : null}
            </View>
          </View>
        )}

        {/* ── Acompanhamento técnico ── */}
        <Card style={s.card}>
          <SectionTitle>Acompanhamento técnico</SectionTitle>

          {visitaAgendada ? (
            <>
              {visitaAgendada.analista ? (
                <View style={s.tecnicoRow}>
                  <View style={s.tecnicoIcone}>
                    <Ionicons name="person" size={20} color={colors.branco} />
                  </View>
                  <View style={s.tecnicoInfo}>
                    <Text style={s.tecnicoNome}>{visitaAgendada.analista}</Text>
                    <Text style={s.tecnicoSub}>Técnico responsável</Text>
                  </View>
                </View>
              ) : null}

              {visitaAgendada.dataVisita ? (
                <InfoRow label="Data da visita" value={fmtDataLonga(visitaAgendada.dataVisita)} />
              ) : null}

              {(visitaAgendada.periodo || visitaAgendada.horario) ? (
                <InfoRow
                  label="Período / horário"
                  value={[
                    visitaAgendada.periodo ? periodoLabel[visitaAgendada.periodo] : null,
                    visitaAgendada.horario ?? null,
                  ].filter(Boolean).join(' · ')}
                />
              ) : null}

              {visitaAgendada.observacao ? (
                <View style={s.observacaoWrap}>
                  <Text style={s.infoLabel}>Observação do técnico</Text>
                  <Text style={s.observacaoTexto}>{visitaAgendada.observacao}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <View style={s.semVisita}>
              <Ionicons name="calendar-outline" size={32} color={colors.muted} />
              <Text style={s.semVisitaTexto}>
                Ainda não houve visita técnica neste imóvel.
              </Text>
            </View>
          )}
        </Card>

      </ScrollView>
    </Screen>
  );
}

// ── estilos ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  card:   { marginBottom: 12 },

  // Estados de loading / erro
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  errorTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'center', marginTop: 4 },
  mutedText:  { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },

  // Hero satélite
  heroWrap:   { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  mapa:       { height: 170 },
  chipOverlay: { position: 'absolute', top: 10, right: 10 },

  // Linha label/valor (igual RevisaoScreen)
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  infoLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, flex: 1 },
  infoValue: { fontSize: 13, color: colors.ink, textAlign: 'right', flex: 2, paddingLeft: 12 },

  // CAR em destaque
  carDestaque: {
    backgroundColor: colors.verdeBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  carLabel:   { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  carNumero:  { fontSize: 15, fontWeight: '800', color: colors.inkText, marginTop: 4, lineHeight: 20 },

  // Botão
  btnRow: { marginTop: 10 },

  // Validação aprovada
  validacaoOk: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e2f3e8',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  validacaoTexto:  { flex: 1 },
  validacaoTitulo: { fontSize: 13, fontWeight: '800', color: colors.verde },
  validacaoSub:    { fontSize: 12, color: colors.muted, marginTop: 2 },

  // Técnico responsável
  tecnicoRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  tecnicoIcone: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  tecnicoInfo: { flex: 1 },
  tecnicoNome: { fontSize: 15, fontWeight: '800', color: colors.inkText },
  tecnicoSub:  { fontSize: 12, color: colors.muted, marginTop: 2 },

  // Observação (texto longo)
  observacaoWrap:  { paddingTop: 10 },
  observacaoTexto: { fontSize: 13, color: colors.ink, lineHeight: 20, marginTop: 4 },

  // Estado vazio de visita
  semVisita:      { alignItems: 'center', paddingVertical: 20, gap: 10 },
  semVisitaTexto: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
