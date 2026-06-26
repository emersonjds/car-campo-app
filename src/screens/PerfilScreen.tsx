// Escolha de perfil na 1ª abertura. Define o tom do app (produtor guiado vs analista).
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { colors } from '../theme/colors';
import type { Perfil } from '../types';

export function PerfilScreen() {
  const { chooseProfile } = useNav();
  return (
    <Screen title="CAR Campo" subtitle="Quem está usando o app?" showBack={false}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.intro}>
          Escolha seu perfil. Isso ajusta a linguagem e as ferramentas. Você pode trocar depois.
        </Text>
        <ProfileCard
          tone="produtor"
          emoji="🌾"
          titulo="Produtor rural"
          descricao="Passo a passo simples para desenhar o seu imóvel caminhando a divisa."
          onPress={() => chooseProfile('produtor')}
        />
        <ProfileCard
          tone="analista"
          emoji="📋"
          titulo="Analista de campo"
          descricao="Cadastro detalhado, validação geométrica e gestão de vários imóveis."
          onPress={() => chooseProfile('analista')}
        />
      </ScrollView>
    </Screen>
  );
}

function ProfileCard({
  emoji,
  titulo,
  descricao,
  onPress,
}: {
  tone: Perfil;
  emoji: string;
  titulo: string;
  descricao: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
      <Text style={s.emoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle}>{titulo}</Text>
        <Text style={s.cardDesc}>{descricao}</Text>
      </View>
      <Text style={s.chev}>›</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  intro: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.branco, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.line },
  emoji: { fontSize: 34 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  cardDesc: { fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 18 },
  chev: { fontSize: 28, color: colors.verde, fontWeight: '300' },
});
