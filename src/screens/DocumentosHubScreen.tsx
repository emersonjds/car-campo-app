import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../app/Screen';
import { colors } from '../theme/colors';
import { CHECKLIST_CAR_OFICIAL } from '../lib/checklistCAR';
import { PassoRow } from './DocumentosScreen';

export function DocumentosHubScreen() {
  return (
    <Screen title="Documentos" subtitle="Documentos para o CAR" showBack={false}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.titulo}>Para a emissão oficial do CAR</Text>
        <Text style={s.sub}>
          O que ainda falta para registrar oficialmente. Toque em cada item para ver onde
          obter.
        </Text>
        <View style={s.lista}>
          {CHECKLIST_CAR_OFICIAL.map((passo) => (
            <PassoRow key={passo.id} passo={passo} />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24, gap: 8 },
  titulo: { fontSize: 18, fontWeight: '800', color: colors.inkText },
  sub: { fontSize: 13, color: colors.mutedText, lineHeight: 18, marginBottom: 8 },
  lista: { gap: 8 },
});
