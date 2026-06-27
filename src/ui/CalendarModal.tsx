// Calendário de agendamento (grade de mês, JS puro — sem dependência nativa, não
// exige rebuild do dev build). Usado para marcar/reagendar visitas de campo.
// UX rural: alvos de toque grandes, contraste alto, período manhã/tarde.
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Zera horas — compara só o dia. */
function inicioDoDia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export type Periodo = 'manha' | 'tarde';

export function CalendarModal({
  visible,
  title = 'Agendar visita',
  subtitle,
  confirmLabel = 'Confirmar',
  initialTs,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  initialTs?: number;
  /** Retorna o dia escolhido (epoch ms) e o período. */
  onConfirm: (ts: number, periodo: Periodo) => void;
  onClose: () => void;
}) {
  const hoje = new Date();
  const hojeMs = inicioDoDia(hoje);
  const base = initialTs ? new Date(initialTs) : hoje;

  const [ano, setAno] = useState(base.getFullYear());
  const [mes, setMes] = useState(base.getMonth()); // 0-11
  const [selecionado, setSelecionado] = useState<number | null>(
    initialTs ? inicioDoDia(new Date(initialTs)) : null,
  );
  const [periodo, setPeriodo] = useState<Periodo>('manha');

  const primeiroDiaSemana = new Date(ano, mes, 1).getDay(); // 0=domingo
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const celulas: (number | null)[] = [
    ...Array(primeiroDiaSemana).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ];

  const irMes = (delta: number) => {
    const m = mes + delta;
    if (m < 0) { setMes(11); setAno((a) => a - 1); }
    else if (m > 11) { setMes(0); setAno((a) => a + 1); }
    else setMes(m);
  };
  // Não deixa voltar para meses inteiramente no passado.
  const podeVoltar = ano > hoje.getFullYear() || (ano === hoje.getFullYear() && mes > hoje.getMonth());

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}

          {/* Cabeçalho de mês */}
          <View style={s.monthRow}>
            <TouchableOpacity
              style={[s.navBtn, !podeVoltar && s.navBtnOff]}
              onPress={() => podeVoltar && irMes(-1)}
              disabled={!podeVoltar}
            >
              <Text style={[s.navTxt, !podeVoltar && { opacity: 0.3 }]}>‹</Text>
            </TouchableOpacity>
            <Text style={s.monthLabel}>{MESES[mes]} {ano}</Text>
            <TouchableOpacity style={s.navBtn} onPress={() => irMes(1)}>
              <Text style={s.navTxt}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Dias da semana */}
          <View style={s.weekRow}>
            {DIAS_SEMANA.map((d, i) => (
              <Text key={i} style={s.weekDay}>{d}</Text>
            ))}
          </View>

          {/* Grade */}
          <View style={s.grid}>
            {celulas.map((dia, i) => {
              if (dia == null) return <View key={i} style={s.cell} />;
              const ts = new Date(ano, mes, dia).getTime();
              const passado = ts < hojeMs;
              const isHoje = ts === hojeMs;
              const isSel = ts === selecionado;
              return (
                <TouchableOpacity
                  key={i}
                  style={s.cell}
                  disabled={passado}
                  activeOpacity={0.7}
                  onPress={() => setSelecionado(ts)}
                >
                  <View style={[s.dayBtn, isSel && s.daySel, isHoje && !isSel && s.dayHoje]}>
                    <Text style={[s.dayTxt, passado && s.dayOff, isSel && s.dayTxtSel]}>{dia}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Período */}
          <View style={s.periodoRow}>
            {(['manha', 'tarde'] as const).map((p) => (
              <TouchableOpacity
                key={p}
                style={[s.periodoBtn, periodo === p && s.periodoBtnOn]}
                onPress={() => setPeriodo(p)}
                activeOpacity={0.85}
              >
                <Text style={[s.periodoTxt, periodo === p && s.periodoTxtOn]}>
                  {p === 'manha' ? '🌅 Manhã' : '🌇 Tarde'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Ações */}
          <View style={s.actions}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={s.cancelTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.okBtn, selecionado == null && s.okBtnOff]}
              disabled={selecionado == null}
              onPress={() => selecionado != null && onConfirm(selecionado, periodo)}
              activeOpacity={0.85}
            >
              <Text style={s.okTxt}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Formata o agendamento para exibição (ex.: "qui, 02/07 · manhã"). */
export function formatarVisita(ts: number, periodo?: Periodo): string {
  const d = new Date(ts);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const semana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()];
  const per = periodo === 'tarde' ? ' · tarde' : periodo === 'manha' ? ' · manhã' : '';
  return `${semana}, ${dia}/${mes}${per}`;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.branco,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 34,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 6 },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 8 },
  navBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.verdeBg },
  navBtnOff: { backgroundColor: colors.branco },
  navTxt: { fontSize: 26, fontWeight: '800', color: colors.verde, lineHeight: 28 },
  monthLabel: { fontSize: 16, fontWeight: '800', color: colors.ink },

  weekRow: { flexDirection: 'row', marginTop: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: colors.muted },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dayBtn: { width: '92%', height: '88%', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  daySel: { backgroundColor: colors.verde },
  dayHoje: { borderWidth: 1.5, borderColor: colors.verde },
  dayTxt: { fontSize: 16, fontWeight: '700', color: colors.ink },
  dayTxtSel: { color: colors.branco, fontWeight: '800' },
  dayOff: { color: colors.line },

  periodoRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  periodoBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.line, alignItems: 'center', backgroundColor: colors.branco },
  periodoBtnOn: { backgroundColor: colors.verdeBg, borderColor: colors.verde, borderWidth: 2 },
  periodoTxt: { fontSize: 14, fontWeight: '800', color: colors.muted },
  periodoTxtOn: { color: colors.verde },

  actions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  cancelBtn: { flex: 1, paddingVertical: 15, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  cancelTxt: { fontSize: 15, fontWeight: '800', color: colors.muted },
  okBtn: { flex: 2, paddingVertical: 15, borderRadius: 14, backgroundColor: colors.verde, alignItems: 'center' },
  okBtnOff: { opacity: 0.4 },
  okTxt: { fontSize: 15, fontWeight: '800', color: colors.branco },
});
