// Painel do Analista — redesign AgroMedição v2 (A1).
// Dados reais do store local (offline-first); sem chamadas a motores pesados aqui —
// usa alertaDivergencia (já persistido pelo produtor) para não travar a UI.
// ponytail: alertaDivergencia é o campo certo; analisarAlteracaoImovel fica no lab.
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { Card, SectionTitle, StatusChip } from '../ui';
import { colors } from '../theme/colors';
import { listImoveis } from '../lib/store';
import type { Imovel } from '../types';

// ─── helpers ──────────────────────────────────────────────────────────────────

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
const PESO_SEV: Record<string, number> = { critico: 3, alto: 2, medio: 1, baixo: 0 };

function semanaAtual(): Date[] {
  const hoje = new Date();
  const dom = new Date(hoje);
  dom.setDate(hoje.getDate() - hoje.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dom);
    d.setDate(dom.getDate() + i);
    return d;
  });
}

function tempoAtras(ts: number): string {
  const d = Date.now() - ts;
  const h = Math.floor(d / 3_600_000);
  if (h < 1) return 'Agora';
  if (h < 24) return `Há ${h}h`;
  const dias = Math.floor(d / 86_400_000);
  return dias === 1 ? 'Ontem' : `Há ${dias}d`;
}

// ─── componente ───────────────────────────────────────────────────────────────

export function PainelScreen() {
  const { navigate } = useNav();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);

  useEffect(() => {
    listImoveis().then(setImoveis);
  }, []);

  const m = useMemo(() => {
    const comAlerta = imoveis.filter((i) => i.alertaDivergencia);

    const nCriticos = comAlerta.filter(
      (i) => i.alertaDivergencia!.severidade === 'critico',
    ).length;

    // Mais urgente: crítico primeiro, depois maior delta_pct absoluto.
    const maisUrgente =
      [...comAlerta].sort((a, b) => {
        const ds =
          (PESO_SEV[b.alertaDivergencia!.severidade] ?? 0) -
          (PESO_SEV[a.alertaDivergencia!.severidade] ?? 0);
        return ds !== 0
          ? ds
          : Math.abs(b.alertaDivergencia!.delta_pct) - Math.abs(a.alertaDivergencia!.delta_pct);
      })[0] ?? null;

    const mediaDiv = comAlerta.length
      ? comAlerta.reduce((s, i) => s + Math.abs(i.alertaDivergencia!.delta_pct), 0) /
        comAlerta.length
      : 0;

    // Pendências: enviados sem aprovação definitiva.
    const pendencias = imoveis.filter(
      (i) => i.status === 'enviado' && i.validacao?.status !== 'aprovado',
    );
    const nNovos = pendencias.filter(
      (i) => i.alertaDivergencia && !i.alertaDivergencia.visto,
    ).length;

    const visitasAgendadas = imoveis.filter((i) => i.visitaAgendada);

    return { nCriticos, maisUrgente, mediaDiv, pendencias, nNovos, visitasAgendadas, nComAlerta: comAlerta.length };
  }, [imoveis]);

  const semana = useMemo(semanaAtual, []);
  const hoje = new Date();

  const subtitulo =
    m.nCriticos > 0
      ? `Você tem ${m.nCriticos} alerta${m.nCriticos !== 1 ? 's' : ''} crítico${m.nCriticos !== 1 ? 's' : ''} hoje.`
      : 'Nenhum alerta crítico no momento.';

  return (
    <Screen title="Painel do Analista" subtitle={subtitulo} showBack={false}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Filtrar + Nova Medição ── */}
        <View style={s.acoes}>
          <TouchableOpacity style={s.btnFiltrar} activeOpacity={0.8}>
            <Ionicons name="filter-outline" size={16} color={colors.inkText} />
            <Text style={s.btnFiltrarText}>Filtrar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.btnNovaMedicao}
            onPress={() => navigate({ name: 'conferencia-lab' })}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color={colors.branco} />
            <Text style={s.btnNovaMedicaoText}>Nova Medição</Text>
          </TouchableOpacity>
        </View>

        {/* ── Alertas de Divergência ── */}
        {m.maisUrgente ? (
          <View style={s.cardAlertas}>
            <View style={s.alertasTop}>
              <View style={s.alertasIconBox}>
                <Ionicons name="alert-circle-outline" size={20} color={colors.critico} />
              </View>
            </View>
            <Text style={s.alertasTitle}>Alertas de Divergência</Text>
            <Text style={s.alertasDesc}>
              {'Divergência detectada na '}
              <Text style={s.bold}>{m.maisUrgente.imovel.nome}</Text>
              {' (Produtor: '}
              {m.maisUrgente.produtor.nome}
              {'). Diferença de '}
              <Text style={s.bold}>
                {Math.abs(m.maisUrgente.alertaDivergencia!.delta_pct).toFixed(0)}% vs INCRA
              </Text>
              {'.'}
            </Text>
            <TouchableOpacity
              style={s.btnAgendarVisita}
              onPress={() => navigate({ name: 'visitas' })}
              activeOpacity={0.85}
            >
              <Ionicons name="calendar-outline" size={16} color={colors.branco} />
              <Text style={s.btnAgendarVisitaText}>Agendar Visita Técnica</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.btnVerDetalhes}
              onPress={() => navigate({ name: 'alteracao-detalhe', imovelId: m.maisUrgente.id })}
              activeOpacity={0.85}
            >
              <Text style={s.btnVerDetalhesText}>Ver Detalhes do Lote</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Média de Divergência ── */}
        <Card style={s.cardMedia}>
          <Text style={s.mediaLabel}>MÉDIA DE DIVERGÊNCIA</Text>
          <View style={s.mediaRow}>
            <Text style={s.mediaValue}>{m.mediaDiv.toFixed(1)}%</Text>
            {m.mediaDiv > 0 ? (
              <Ionicons name="trending-down-outline" size={28} color={colors.verde} />
            ) : (
              <Ionicons name="checkmark-circle-outline" size={28} color={colors.verde} />
            )}
          </View>
          <Text style={s.mediaHint}>
            {m.nComAlerta > 0
              ? `Calculado sobre ${m.nComAlerta} imóvel${m.nComAlerta !== 1 ? 'is' : ''} com alerta`
              : 'Sem alertas de divergência no momento'}
          </Text>
        </Card>

        {/* ── Pendências de Validação ── */}
        <Card style={s.cardSection}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitleText}>Pendências de Validação</Text>
            {m.nNovos > 0 && (
              <StatusChip
                status="info"
                label={`${m.nNovos} Novo${m.nNovos !== 1 ? 's' : ''}`}
              />
            )}
          </View>

          {m.pendencias.length === 0 ? (
            <Text style={s.emptyText}>Nenhuma pendência no momento.</Text>
          ) : (
            m.pendencias.slice(0, 3).map((im) => (
              <TouchableOpacity
                key={im.id}
                style={s.pendenciaItem}
                onPress={() => navigate({ name: 'revisao', imovelId: im.id })}
                activeOpacity={0.8}
              >
                <View style={s.pendenciaIconBox}>
                  <Ionicons name="map-outline" size={22} color={colors.mutedText} />
                </View>
                <View style={s.pendenciaInfo}>
                  <Text style={s.pendenciaNome} numberOfLines={1}>
                    {im.imovel.nome}
                  </Text>
                  <Text style={s.pendenciaDetalhe} numberOfLines={1}>
                    {`Enviado por: ${im.produtor.nome} • ${tempoAtras(im.updatedAt)}`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />
              </TouchableOpacity>
            ))
          )}

          {m.pendencias.length > 0 && (
            <TouchableOpacity
              style={s.verTodasBtn}
              onPress={() => navigate({ name: 'conferencia-lab' })}
              activeOpacity={0.8}
            >
              <Text style={s.verTodasText}>Ver todas as pendências</Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* ── Visitas Agendadas ── */}
        <Card style={s.cardSection}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitleText}>Visitas Agendadas</Text>
            <View style={s.calNavRow}>
              <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-back" size={20} color={colors.inkText} />
              </TouchableOpacity>
              <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-forward" size={20} color={colors.inkText} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Mini-calendário */}
          <View style={s.calendario}>
            {semana.map((d, i) => {
              const isHoje =
                d.getDate() === hoje.getDate() &&
                d.getMonth() === hoje.getMonth() &&
                d.getFullYear() === hoje.getFullYear();
              return (
                <View key={i} style={[s.diaWrap, isHoje && s.diaHojeWrap]}>
                  {isHoje && <Text style={s.diaHojeLabel}>HOJE</Text>}
                  <Text style={[s.diaNome, isHoje && s.diaHojeText]}>
                    {DIAS_SEMANA[d.getDay()]}
                  </Text>
                  <Text style={[s.diaNum, isHoje && s.diaHojeText]}>{d.getDate()}</Text>
                </View>
              );
            })}
          </View>

          {/* Itens de visita */}
          {m.visitasAgendadas.length === 0 ? (
            <Text style={s.emptyText}>Nenhuma visita agendada esta semana.</Text>
          ) : (
            m.visitasAgendadas.map((im) => (
              <View key={im.id} style={s.visitaItem}>
                <View style={s.visitaBar} />
                <View style={s.visitaInfo}>
                  <Text style={s.visitaHorario}>
                    {im.visitaAgendada!.periodo === 'manha'
                      ? 'Manhã'
                      : im.visitaAgendada!.periodo === 'tarde'
                        ? 'Tarde'
                        : '—'}
                  </Text>
                  <Text style={s.visitaNome}>{im.imovel.nome}</Text>
                  <Text style={s.visitaLocal}>
                    Local: {im.imovel.municipio}/{im.imovel.uf}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>

        <View style={s.bottomSpacer} />
      </ScrollView>
    </Screen>
  );
}

// ─── estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  content: { padding: 16 },

  // Ações
  acoes: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  btnFiltrar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: colors.branco,
  },
  btnFiltrarText: { fontSize: 15, fontWeight: '700', color: colors.inkText },
  btnNovaMedicao: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  btnNovaMedicaoText: { fontSize: 15, fontWeight: '800', color: colors.branco },

  // Card Alertas (fundo vermelho claro)
  cardAlertas: {
    backgroundColor: '#fbeae9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f0c4c2',
    padding: 16,
    marginBottom: 14,
  },
  alertasTop: { marginBottom: 10 },
  alertasIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f8d7d6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertasTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.critico,
    marginBottom: 6,
  },
  alertasDesc: { fontSize: 14, color: colors.critico, lineHeight: 20, marginBottom: 14 },
  bold: { fontWeight: '800' },
  btnAgendarVisita: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.critico,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 10,
  },
  btnAgendarVisitaText: { fontSize: 15, fontWeight: '800', color: colors.branco },
  btnVerDetalhes: {
    borderWidth: 1.5,
    borderColor: colors.critico,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnVerDetalhesText: { fontSize: 15, fontWeight: '700', color: colors.critico },

  // Média de Divergência
  cardMedia: { marginBottom: 14 },
  mediaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.mutedText,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mediaValue: { fontSize: 38, fontWeight: '800', color: colors.inkText },
  mediaHint: { fontSize: 12, color: colors.mutedText, marginTop: 6 },

  // Seções genéricas
  cardSection: { marginBottom: 14 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleText: { fontSize: 17, fontWeight: '800', color: colors.ink },

  // Pendências
  pendenciaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  pendenciaIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.neutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendenciaInfo: { flex: 1 },
  pendenciaNome: { fontSize: 14, fontWeight: '700', color: colors.inkText },
  pendenciaDetalhe: { fontSize: 12, color: colors.mutedText, marginTop: 2 },
  verTodasBtn: {
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 4,
  },
  verTodasText: { fontSize: 14, fontWeight: '700', color: colors.primary },

  // Calendário
  calNavRow: { flexDirection: 'row', gap: 8 },
  calendario: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 4,
  },
  diaWrap: { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 4, minWidth: 36 },
  diaHojeWrap: { backgroundColor: colors.primary, borderRadius: 10 },
  diaHojeLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.branco,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  diaNome: { fontSize: 11, fontWeight: '600', color: colors.mutedText },
  diaNum: { fontSize: 16, fontWeight: '800', color: colors.inkText, marginTop: 2 },
  diaHojeText: { color: colors.branco },

  // Visitas
  visitaItem: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  visitaBar: { width: 3, borderRadius: 2, backgroundColor: colors.primary },
  visitaInfo: { flex: 1 },
  visitaHorario: { fontSize: 12, fontWeight: '700', color: colors.mutedText },
  visitaNome: { fontSize: 14, fontWeight: '700', color: colors.inkText, marginTop: 2 },
  visitaLocal: { fontSize: 12, color: colors.mutedText, marginTop: 1 },

  emptyText: {
    fontSize: 13,
    color: colors.mutedText,
    textAlign: 'center',
    paddingVertical: 16,
  },
  bottomSpacer: { height: 16 },
});
