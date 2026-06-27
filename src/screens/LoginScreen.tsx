// Tela de login por persona — sem credenciais. Tocar no card entra direto.
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme/colors';

export function LoginScreen() {
  const { loginPersona } = useAuth();
  const [busy, setBusy] = useState<'produtor' | 'analista' | null>(null);

  async function entrar(perfil: 'produtor' | 'analista') {
    if (busy) return;
    setBusy(perfil);
    try {
      await loginPersona(perfil);
    } catch {
      // mock nunca lança; em produção: Alert com mensagem de erro.
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.root}>
        {/* Logo */}
        <View style={s.header}>
          <View style={s.logoMark}>
            <Ionicons name="leaf" size={38} color={colors.branco} />
          </View>
          <Text style={s.appName}>CAR CAMPO</Text>
          <Text style={s.welcome}>Bem-vindo ao CAR Campo</Text>
          <Text style={s.tagline}>Sua terra, sua gestão, em um só lugar.</Text>
        </View>

        {/* Cards de persona */}
        <View style={s.body}>
          <Text style={s.euSou}>Eu sou:</Text>
          <PersonaCard
            titulo="Produtor Rural"
            sub="Demarcar e acompanhar meu imóvel"
            icone="leaf-outline"
            acento={colors.primary}
            busy={busy === 'produtor'}
            onPress={() => entrar('produtor')}
          />
          <PersonaCard
            titulo="Analista de Campo"
            sub="Validar imóveis e agendar visitas"
            icone="clipboard-outline"
            acento={colors.secondary}
            busy={busy === 'analista'}
            onPress={() => entrar('analista')}
          />
        </View>

        {/* Rodapé LGPD */}
        <Text style={s.lgpd}>Seus dados ficam protegidos neste aparelho (LGPD).</Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Subcomponente ───────────────────────────────────────────────────────────

function PersonaCard({
  titulo,
  sub,
  icone,
  acento,
  busy,
  onPress,
}: {
  titulo: string;
  sub: string;
  icone: keyof typeof Ionicons.glyphMap;
  acento: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.card, { borderTopColor: acento }]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={!!busy}
      accessibilityRole="button"
      accessibilityLabel={titulo}
    >
      <View style={[s.cardIcon, { backgroundColor: acento }]}>
        {busy
          ? <ActivityIndicator color={colors.branco} size="small" />
          : <Ionicons name={icone} size={22} color={colors.branco} />
        }
      </View>
      <View style={s.cardText}>
        <Text style={s.cardTitulo}>{titulo}</Text>
        <Text style={s.cardSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </TouchableOpacity>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.neutral },
  root: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
    justifyContent: 'space-between',
  },

  // Header / logo
  header: { alignItems: 'center', paddingTop: 16 },
  logoMark: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 14,
    elevation: 5,
  },
  appName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.mutedText,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  welcome: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.inkText,
    textAlign: 'center',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    color: colors.mutedText,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Cards
  body: { gap: 14 },
  euSou: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.branco,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitulo: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.inkText,
    marginBottom: 3,
  },
  cardSub: {
    fontSize: 13,
    color: colors.mutedText,
    lineHeight: 18,
  },

  // Footer
  lgpd: {
    fontSize: 12,
    color: colors.mutedText,
    textAlign: 'center',
    lineHeight: 18,
  },
});
