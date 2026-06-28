import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { colors } from '../theme/colors';
import { text } from '../theme/typography';
import { Card, Button } from '../ui';
import { CalendarPicker } from '../ui/CalendarModal';
import { getImovel, updateImovel } from '../lib/store';
import { analisarSobreposicoes } from '../lib/overlay';
import { analisarAlteracaoImovel } from '../lib/alteracao';
import { gerarPainelAvisos } from '../lib/conferencia';
import { DEMO_CAMADAS } from '../lib/refLayers.demo';
import type { Imovel } from '../types';

// ponytail: slots hardcoded — não há API de disponibilidade real; trocar por fetch quando tiver.
const SLOTS = [
  { id: '08:00', label: '08:00 AM', disabled: false },
  { id: '09:30', label: '09:30 AM', disabled: false },
  { id: '11:00', label: '11:00 AM', disabled: false },
  { id: '14:30', label: '02:30 PM', disabled: false },
  { id: '16:00', label: '04:00 PM', disabled: false },
  { id: '17:30', label: '05:30 PM', disabled: true },
] as const;

function periodoDeSlot(slot: string): 'manha' | 'tarde' {
  return parseInt(slot.split(':')[0]!, 10) < 12 ? 'manha' : 'tarde';
}

function labelData(ts: number): string {
  const d = new Date(ts);
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `Para ${dias[d.getDay()]}, ${d.getDate()} de ${meses[d.getMonth()]}`;
}

export function AgendarVisitaScreen({ imovelId }: { imovelId: string }) {
  const { goBack } = useNav();
  const [imovel, setImovel] = useState<Imovel | null>(null);
  const [dataSel, setDataSel] = useState<number | null>(null);
  const [slotSel, setSlotSel] = useState<string | null>(null);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    getImovel(imovelId).then((im) => {
      setImovel(im);
      if (im?.visitaAgendada?.dataVisita) setDataSel(im.visitaAgendada.dataVisita);
      if (im?.visitaAgendada?.horario) setSlotSel(im.visitaAgendada.horario);
      if (im?.visitaAgendada?.observacao) setObs(im.visitaAgendada.observacao);
    });
  }, [imovelId]);

  // Reutiliza mesma lógica de análise da fila para exibir a divergência principal.
  const painel = useMemo(() => {
    if (!imovel || imovel.geometry.points.length < 3) return null;
    const analise = analisarSobreposicoes(imovel.geometry.points, DEMO_CAMADAS, 'offline-demo');
    const alt = analisarAlteracaoImovel(imovel, DEMO_CAMADAS, 'offline-demo');
    return gerarPainelAvisos(imovel.geometry.points, analise, alt?.relatorio ?? null);
  }, [imovel]);

  const confirmar = useCallback(async () => {
    if (!imovel || !dataSel || !slotSel) return;
    setSalvando(true);
    try {
      await updateImovel(imovel.id, {
        visitaAgendada: {
          agendadaEm: Date.now(),
          dataVisita: dataSel,
          periodo: periodoDeSlot(slotSel),
          horario: slotSel,
          observacao: obs.trim() || undefined,
          analista: 'Analista',
        },
      });
      goBack();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar o agendamento. Tente novamente.');
      setSalvando(false);
    }
  }, [imovel, dataSel, slotSel, obs, goBack]);

  const nomeLocal = imovel?.imovel.nome || 'Imóvel';
  const endLocal = [imovel?.imovel.municipio, imovel?.imovel.uf].filter(Boolean).join(' · ') || 'Sem localização cadastrada';

  const divergenciaTexto = (() => {
    if (painel?.avisos[0]) {
      const a = painel.avisos[0];
      return `${a.rotulo}${a.detalhe ? ` (${a.detalhe})` : ''}`;
    }
    if (imovel?.alertaDivergencia) {
      const d = imovel.alertaDivergencia;
      return `Divergência: ${d.delta_ha >= 0 ? '+' : ''}${d.delta_ha.toFixed(1)} ha`;
    }
    return null;
  })();

  const podeConfirmar = dataSel != null && slotSel != null && !salvando;

  if (!imovel) {
    return (
      <Screen title="Agendar Visita" subtitle="Carregando...">
        <View style={s.loading}>
          <ActivityIndicator color={colors.verde} size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title={imovel.visitaAgendada ? 'Reagendar Visita' : 'Agendar Visita'}
      subtitle={`${imovel.produtor.nome} · ${nomeLocal}`}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.banner}>
          <Text style={s.bannerLabel}>AÇÃO NECESSÁRIA</Text>
          <Text style={s.bannerTitulo}>Agendar Visita Técnica</Text>
          <Text style={s.bannerSub}>
            Selecione uma data e horário para a avaliação presencial do analista na gleba identificada com divergência.
          </Text>
        </View>

        <Card style={s.calCard}>
          <CalendarPicker
            value={dataSel}
            onChange={setDataSel}
            initialTs={imovel.visitaAgendada?.dataVisita}
          />
        </Card>

        <Card style={s.section}>
          <Text style={s.sectionLabel}>Observações sobre a Divergência</Text>
          <TextInput
            style={s.textarea}
            multiline
            numberOfLines={4}
            placeholder="Descreva os detalhes da divergência encontrada para orientar o analista durante a visita técnica..."
            placeholderTextColor={colors.muted}
            value={obs}
            onChangeText={setObs}
            textAlignVertical="top"
          />
        </Card>

        <Card style={s.section}>
          <Text style={s.sectionLabel}>Horários Disponíveis</Text>
          <Text style={s.dataLabel}>
            {dataSel ? labelData(dataSel) : 'Selecione uma data no calendário'}
          </Text>
          <View style={s.slotsGrid}>
            {SLOTS.map((slot) => {
              const isSel = slotSel === slot.id;
              return (
                <TouchableOpacity
                  key={slot.id}
                  style={[s.slot, isSel && s.slotSel, slot.disabled && s.slotDis]}
                  disabled={slot.disabled}
                  onPress={() => setSlotSel(slot.id)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.slotTxt, isSel && s.slotTxtSel, slot.disabled && s.slotTxtDis]}>
                    {slot.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        <View style={s.localCard}>
          <View style={s.localHeader}>
            <Text style={s.localChip}>LOCAL DA VISITA</Text>
            <Text style={s.localNome}>{nomeLocal}</Text>
          </View>
          <View style={s.localBody}>
            <View style={s.localRow}>
              <Text style={s.localIcon}>📍</Text>
              <Text style={s.localTxt}>{endLocal}</Text>
            </View>
            {divergenciaTexto && (
              <View style={s.localRow}>
                <Text style={s.localIcon}>⚠</Text>
                <Text style={s.localTxt}>Divergência: {divergenciaTexto}</Text>
              </View>
            )}
          </View>
        </View>

        <Button
          label={salvando ? 'Salvando...' : 'Confirmar Agendamento'}
          onPress={confirmar}
          variant="primary"
          disabled={!podeConfirmar}
          loading={salvando}
          style={s.btnConfirmar}
        />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 14, paddingBottom: 36 },

  banner: { paddingVertical: 4 },
  bannerLabel: {
    ...text.label,
    color: colors.alerta,
    marginBottom: 6,
  },
  bannerTitulo: {
    ...text.headline,
    color: colors.ink,
    marginBottom: 8,
  },
  bannerSub: {
    ...text.body,
    color: colors.muted,
    lineHeight: 22,
  },

  calCard: { padding: 16 },
  section: { padding: 16, gap: 10 },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },

  textarea: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
    backgroundColor: colors.neutral,
  },

  dataLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },

  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  slot: {
    width: '47%',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    backgroundColor: colors.branco,
    // alvos ≥ 44pt garantidos pelo paddingVertical 14 + fontSize 14 = ~42px; OK.
  },
  slotSel: {
    borderColor: colors.verde,
    borderWidth: 2,
    backgroundColor: colors.verdeBg,
  },
  slotDis: {
    backgroundColor: colors.neutral,
    borderColor: colors.line,
    opacity: 0.5,
  },
  slotTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  slotTxtSel: {
    color: colors.verde,
  },
  slotTxtDis: {
    color: colors.muted,
  },

  localCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
  localHeader: {
    backgroundColor: colors.primary,
    padding: 18,
    paddingBottom: 20,
  },
  localChip: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 6,
  },
  localNome: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.branco,
  },
  localBody: {
    backgroundColor: colors.branco,
    padding: 14,
    gap: 10,
  },
  localRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  localIcon: {
    fontSize: 15,
    marginTop: 1,
  },
  localTxt: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
    fontWeight: '500',
  },

  btnConfirmar: {
    flex: undefined,
    marginTop: 4,
  },
});
