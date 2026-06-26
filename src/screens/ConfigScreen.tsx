// Aba "Perfil" — mostra o perfil atual e permite alternar entre Produtor e
// Analista (assim dá para explorar as duas experiências no mesmo aparelho).
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { Card, SectionTitle } from '../ui';
import { colors } from '../theme/colors';
import type { Perfil } from '../types';

export function ConfigScreen() {
  const { perfil, chooseProfile } = useNav();

  return (
    <Screen title="Perfil" subtitle="Como você está usando o app" showBack={false}>
      <ScrollView contentContainerStyle={s.content}>
        <Card>
          <SectionTitle>Perfil atual</SectionTitle>
          <View style={s.current}>
            <Text style={s.currentEmoji}>{perfil === 'analista' ? '📋' : '🌾'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.currentName}>
                {perfil === 'analista' ? 'Analista de campo' : 'Produtor rural'}
              </Text>
              <Text style={s.currentDesc}>
                {perfil === 'analista'
                  ? 'Cadastra vários imóveis, valida geometria e cuida das pendências.'
                  : 'Demarca o próprio imóvel caminhando (ou simulando) a divisa.'}
              </Text>
            </View>
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <SectionTitle>Trocar de perfil</SectionTitle>
          <Text style={s.hint}>
            Use para alternar a experiência. O produtor entra com gov.br; o analista, com matrícula.
          </Text>
          <ProfileOption
            emoji="🌾"
            titulo="Produtor rural"
            ativo={perfil === 'produtor'}
            onPress={() => chooseProfile('produtor')}
          />
          <ProfileOption
            emoji="📋"
            titulo="Analista de campo"
            ativo={perfil === 'analista'}
            onPress={() => chooseProfile('analista')}
          />
        </Card>

        <Text style={s.lgpd}>
          🔒 Seus dados ficam neste aparelho (offline-first). Dados pessoais são protegidos pela LGPD.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function ProfileOption({
  emoji,
  titulo,
  ativo,
  onPress,
}: {
  emoji: string;
  titulo: string;
  ativo: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.option, ativo && s.optionAtivo]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={ativo}
    >
      <Text style={s.optionEmoji}>{emoji}</Text>
      <Text style={[s.optionTitulo, ativo && s.optionTituloAtivo]}>{titulo}</Text>
      <Text style={[s.optionTag, ativo && s.optionTagAtivo]}>{ativo ? 'Atual' : 'Trocar'}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  content: { padding: 16 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  currentEmoji: { fontSize: 36 },
  currentName: { fontSize: 18, fontWeight: '800', color: colors.ink },
  currentDesc: { fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 18 },
  hint: { fontSize: 13, color: colors.muted, marginBottom: 12, lineHeight: 18 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
    backgroundColor: colors.branco,
  },
  optionAtivo: { borderColor: colors.verde, backgroundColor: colors.verdeBg },
  optionEmoji: { fontSize: 24 },
  optionTitulo: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  optionTituloAtivo: { color: colors.verde },
  optionTag: { fontSize: 12, fontWeight: '800', color: colors.muted },
  optionTagAtivo: { color: colors.verde },
  lgpd: { fontSize: 12, color: colors.muted, marginTop: 18, lineHeight: 18, textAlign: 'center' },
});
