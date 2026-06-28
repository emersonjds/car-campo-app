// Dados reais do store local (offline-first); sem chamadas a motores pesados aqui —
// usa alertaDivergencia (já persistido pelo produtor) para não travar a UI.
// ponytail: alertaDivergencia é o campo certo; analisarAlteracaoImovel fica no lab.
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { Card, SectionTitle, StatusChip } from '../ui';
import { colors } from '../theme/colors';
import { listImoveis } from '../lib/store';
import type { Imovel } from '../types';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

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

export function PainelScreen() {
  const { navigate } = useNav();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  // Modal de Nova Medição: analista informa o CAR antes de cair no mapa.
  const [carModal, setCarModal] = useState(false);
  const [carInput, setCarInput] = useState('');

  useEffect(() => {
    listImoveis().then(setImoveis);
  }, []);

  const iniciarMedicao = () => {
    const car = carInput.trim();
    setCarModal(false);
    setCarInput('');
    navigate({ name: 'conferencia-lab', car: car || undefined });
  };

  const m = useMemo(() => {
    const comAlerta = imoveis.filter((i) => i.alertaDivergencia);

    const nCriticos = comAlerta.filter(
      (i) => i.alertaDivergencia!.severidade === 'critico',
    ).length;

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

    return { nCriticos, mediaDiv, pendencias, nNovos, visitasAgendadas, nComAlerta: comAlerta.length };
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

        <View style={s.acoes}>
          <TouchableOpacity style={s.btnFiltrar} activeOpacity={0.8}>
            <Ionicons name="filter-outline" size={16} color={colors.inkText} />
            <Text style={s.btnFiltrarText}>Filtrar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.btnNovaMedicao}
            onPress={() => setCarModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color={colors.branco} />
            <Text style={s.btnNovaMedicaoText}>Nova Medição</Text>
          </TouchableOpacity>
        </View>

        {/* Alertas de Divergência agora moram na central de Notificações (sino). */}

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

          {m.visitasAgendadas.length === 0 ? (
            <Text style={s.emptyText}>Nenhuma visita agendada esta semana.</Text>
          ) : (
            m.visitasAgendadas.map((im) => {
              const va = im.visitaAgendada!;
              const horario =
                va.horario && va.horaFim
                  ? `${va.horario} - ${va.horaFim}`
                  : va.periodo === 'manha'
                    ? 'Manhã'
                    : va.periodo === 'tarde'
                      ? 'Tarde'
                      : '—';
              const online = va.modalidade === 'online';
              const onde = online
                ? `Online / ${va.plataforma ?? 'Teams'}`
                : `Local: ${im.imovel.municipio}/${im.imovel.uf}`;
              return (
                <View key={im.id} style={s.visitaItem}>
                  <View style={[s.visitaBar, online && s.visitaBarOnline]} />
                  <View style={s.visitaInfo}>
                    <Text style={s.visitaHorario}>{horario}</Text>
                    <Text style={s.visitaNome}>
                      {va.titulo ? `${va.titulo} · ${im.imovel.nome}` : im.imovel.nome}
                    </Text>
                    <Text style={s.visitaLocal}>{onde}</Text>
                  </View>
                </View>
              );
            })
          )}
        </Card>

        <View style={s.bottomSpacer} />
      </ScrollView>

      <Modal visible={carModal} transparent animationType="slide" onRequestClose={() => setCarModal(false)}>
        <Pressable style={s.mBackdrop} onPress={() => setCarModal(false)}>
          <Pressable style={s.mSheet} onPress={() => {}}>
            <View style={s.mHandle} />
            <Text style={s.mTitle}>Nova Medição</Text>
            <Text style={s.mDesc}>
              Informe o número do CAR da propriedade. Em seguida você cai no mapa para iniciar a medição.
            </Text>
            <Text style={s.mLabel}>Número do CAR</Text>
            <TextInput
              style={s.mInput}
              placeholder="UF-IBGE-..."
              placeholderTextColor={colors.mutedText}
              value={carInput}
              onChangeText={setCarInput}
              autoCapitalize="characters"
              autoFocus
            />
            <View style={s.mActions}>
              <TouchableOpacity style={s.mCancel} onPress={() => setCarModal(false)} activeOpacity={0.8}>
                <Text style={s.mCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.mOk, !carInput.trim() && s.mOkDisabled]}
                onPress={iniciarMedicao}
                disabled={!carInput.trim()}
                activeOpacity={0.85}
              >
                <Text style={s.mOkTxt}>Iniciar medição</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: 16 },

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

  mBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  mSheet: {
    backgroundColor: colors.branco,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 34,
  },
  mHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 12 },
  mTitle: { fontSize: 19, fontWeight: '800', color: colors.primary },
  mDesc: { fontSize: 13, color: colors.mutedText, lineHeight: 19, marginTop: 8 },
  mLabel: { fontSize: 12, fontWeight: '800', color: colors.mutedText, marginTop: 16, marginBottom: 6 },
  mInput: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.inkText,
  },
  mActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  mCancel: { flex: 1, paddingVertical: 15, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  mCancelTxt: { fontSize: 15, fontWeight: '800', color: colors.mutedText },
  mOk: { flex: 2, paddingVertical: 15, borderRadius: 14, alignItems: 'center', backgroundColor: colors.primary },
  mOkDisabled: { opacity: 0.45 },
  mOkTxt: { fontSize: 15, fontWeight: '800', color: colors.branco },

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

  cardSection: { marginBottom: 14 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleText: { fontSize: 17, fontWeight: '800', color: colors.ink },

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

  visitaItem: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  visitaBar: { width: 3, borderRadius: 2, backgroundColor: colors.aviso },
  visitaBarOnline: { backgroundColor: colors.tertiary },
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
