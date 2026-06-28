import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

const STEPS = ['Cadastro', 'Demarcação', 'Documentos', 'Revisão'];

export function WizardSteps({ active }: { active: 0 | 1 | 2 | 3 }) {
  return (
    <View style={s.row}>
      {STEPS.map((label, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <View key={label} style={s.item}>
            <View style={[s.dot, (done || current) && s.dotActive]}>
              <Text style={[s.dotText, (done || current) && s.dotTextActive]}>
                {done ? '✓' : i + 1}
              </Text>
            </View>
            <Text style={[s.label, current && s.labelActive]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.branco, borderBottomWidth: 1, borderBottomColor: colors.line },
  item: { flex: 1, alignItems: 'center' },
  dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.verdeBg, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  dotActive: { backgroundColor: colors.verde, borderColor: colors.verde },
  dotText: { fontSize: 12, fontWeight: '800', color: colors.muted },
  dotTextActive: { color: colors.branco },
  label: { fontSize: 10, color: colors.muted, marginTop: 4 },
  labelActive: { color: colors.verde, fontWeight: '800' },
});
