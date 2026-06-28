import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useAuth } from '../auth/AuthContext';
import { Badge, Card, SecondaryButton, SectionTitle } from '../ui';
import { colors } from '../theme/colors';
import type { Selo } from '../auth/types';

function maskCpf(v: string): string {
  const d = v.replace(/\D/g, '');
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '***';
}

function seloTone(selo: Selo): 'ok' | 'aviso' | 'neutro' {
  if (selo === 'ouro' || selo === 'prata') return 'ok';
  if (selo === 'bronze') return 'aviso';
  return 'neutro';
}

export function ConfigScreen() {
  const { sessao, logout } = useAuth();

  function confirmarSaida() {
    Alert.alert('Sair', 'Encerrar a sessão neste aparelho?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => logout() },
    ]);
  }

  return (
    <Screen title="Perfil" subtitle="Sua identidade no app" showBack={false}>
      <ScrollView contentContainerStyle={s.content}>
        <Card>
          <SectionTitle>Identidade</SectionTitle>
          {sessao ? (
            <View style={s.identity}>
              <Text style={s.nome}>{sessao.nome}</Text>
              {sessao.cpf ? (
                <Text style={s.detalhe}>CPF: {maskCpf(sessao.cpf)}</Text>
              ) : null}
              {sessao.selo ? (
                <View style={s.badgeWrap}>
                  <Badge tone={seloTone(sessao.selo)}>
                    gov.br {sessao.selo}
                  </Badge>
                </View>
              ) : null}
            </View>
          ) : null}
        </Card>

        <Card style={{ marginTop: 14 }}>
          <SectionTitle>Conta</SectionTitle>
          <SecondaryButton label="Sair" onPress={confirmarSaida} />
        </Card>

        <Text style={s.lgpd}>
          Seus dados ficam neste aparelho (offline-first). Dados pessoais sao protegidos pela LGPD.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: 16 },
  identity: { gap: 6 },
  nome: { fontSize: 18, fontWeight: '800', color: colors.ink },
  detalhe: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  badgeWrap: { marginTop: 4 },
  lgpd: { fontSize: 12, color: colors.muted, marginTop: 18, lineHeight: 18, textAlign: 'center' },
});
