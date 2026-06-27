import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Screen } from '../app/Screen';
import { useAuth } from '../auth/AuthContext';
import { Card, Field, PrimaryButton } from '../ui';
import { colors } from '../theme/colors';

const GOVBR_BLUE = '#1351B4';

function mascaraCpf(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function LoginScreen() {
  const { loginGovBr, loginMatricula } = useAuth();

  // ponytail: pré-preenchido com as credenciais de demo para facilitar o teste.
  const [cpf, setCpf] = useState('123.456.789-09');
  const [senhaProd, setSenhaProd] = useState('demo');
  const [erroProd, setErroProd] = useState<string | null>(null);

  // Passo 1: escolher a persona. Só depois aparece o login dela.
  const [persona, setPersona] = useState<'produtor' | 'analista' | null>(null);
  const [matricula, setMatricula] = useState('12345');
  const [senha, setSenha] = useState('car2026');

  const [busy, setBusy] = useState(false);

  function handleCpf(text: string) {
    setCpf(mascaraCpf(text));
    if (erroProd) setErroProd(null);
  }

  async function entrarGovBr() {
    const rawCpf = cpf.replace(/\D/g, '');
    if (rawCpf.length !== 11) {
      setErroProd('Digite um CPF válido com 11 dígitos.');
      return;
    }
    if (!senhaProd.trim()) {
      setErroProd('Digite sua senha gov.br.');
      return;
    }
    setBusy(true);
    setErroProd(null);
    try {
      await loginGovBr(rawCpf);
    } catch (e) {
      setErroProd(e instanceof Error ? e.message : 'Falha ao autenticar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function entrarMatricula() {
    setBusy(true);
    try {
      await loginMatricula(matricula, senha);
    } catch (e) {
      Alert.alert('Login', e instanceof Error ? e.message : 'Falha no login.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="CAR Campo" subtitle="Entre para demarcar seu imóvel" showBack={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.flex}
      >
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {/* Passo 1 — escolher quem é */}
          {persona === null && (
            <View style={s.chooserWrap}>
              <Text style={s.escolhaTitulo}>Como você quer entrar?</Text>
              <PersonaCard
                variant="produtor"
                titulo="Sou produtor rural"
                sub="Entrar com a sua conta gov.br"
                onPress={() => setPersona('produtor')}
              />
              <PersonaCard
                variant="analista"
                titulo="Sou analista"
                sub="Entrar com matrícula e senha"
                onPress={() => setPersona('analista')}
              />
            </View>
          )}

          {/* Passo 2a — produtor (gov.br) */}
          {persona === 'produtor' && (
            <>
              <TrocarPersona onPress={() => setPersona(null)} />
              <View style={s.govbrCard}>
                <Text style={s.logo}>
                  <Text style={s.logoGov}>gov</Text>
                  <Text style={s.logoBr}>.br</Text>
                </Text>
                <Text style={s.govbrSub}>Entre com o CPF e senha da sua conta gov.br</Text>

                <Field
                  label="CPF"
                  value={cpf}
                  onChangeText={handleCpf}
                  placeholder="000.000.000-00"
                  keyboardType="number-pad"
                  autoCapitalize="none"
                />
                <Field
                  label="Senha"
                  value={senhaProd}
                  onChangeText={(t) => {
                    setSenhaProd(t);
                    if (erroProd) setErroProd(null);
                  }}
                  placeholder="Senha da conta gov.br"
                  secureTextEntry
                />

                {erroProd ? <Text style={s.erro}>{erroProd}</Text> : null}

                <TouchableOpacity
                  style={[s.btnGovBr, busy && s.btnDisabled]}
                  onPress={entrarGovBr}
                  disabled={busy}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Entrar com gov.br"
                >
                  {busy ? (
                    <ActivityIndicator color={colors.branco} />
                  ) : (
                    <Text style={s.btnGovBrText}>Entrar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Passo 2b — analista (matrícula) */}
          {persona === 'analista' && (
            <>
              <TrocarPersona onPress={() => setPersona(null)} />
              <Card>
                <Field
                  label="Matrícula"
                  value={matricula}
                  onChangeText={setMatricula}
                  placeholder="Ex: 12345"
                  keyboardType="numeric"
                />
                <Field
                  label="Senha"
                  value={senha}
                  onChangeText={setSenha}
                  placeholder="Sua senha"
                  secureTextEntry
                />
                <PrimaryButton label="Entrar" onPress={entrarMatricula} loading={busy} />
                {__DEV__ && (
                  <Text style={s.demo}>Demo: matrícula 12345 · senha car2026</Text>
                )}
              </Card>
            </>
          )}
        </ScrollView>

        {/* Rodapé LGPD — fixo abaixo do scroll, sempre visível */}
        <View style={s.lgpdFooter}>
          <Text style={s.lgpd}>Seus dados ficam protegidos neste aparelho (LGPD).</Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function PersonaCard({
  variant,
  titulo,
  sub,
  onPress,
}: {
  variant: 'produtor' | 'analista';
  titulo: string;
  sub: string;
  onPress: () => void;
}) {
  const cardStyle = variant === 'produtor' ? s.personaCardProdutor : s.personaCardAnalista;

  return (
    <TouchableOpacity
      style={[s.personaCardBase, cardStyle]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Text style={s.personaTitulo}>{titulo}</Text>
      <Text style={s.personaSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

function TrocarPersona({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={s.trocar} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <Text style={s.trocarTxt}>‹ Trocar tipo de acesso</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },

  // Conjunto da escolha centralizado verticalmente na tela.
  chooserWrap: { flex: 1, justifyContent: 'center' },
  escolhaTitulo: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 20,
    textAlign: 'center',
  },

  // Card base — branco, limpo, centrado, alvo grande.
  personaCardBase: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.branco,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginBottom: 14,
    minHeight: 100,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  // Tira fina de identidade no topo (sem cor de fundo berrante).
  personaCardProdutor: { borderTopWidth: 3, borderTopColor: colors.verde },
  personaCardAnalista: { borderTopWidth: 3, borderTopColor: colors.terra },

  personaTitulo: { fontSize: 19, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: 6 },
  personaSub: { fontSize: 14, fontWeight: '600', color: colors.muted, textAlign: 'center' },

  trocar: { paddingVertical: 8, marginBottom: 4 },
  trocarTxt: { fontSize: 14, fontWeight: '800', color: colors.verde },

  content: { padding: 16, paddingBottom: 8, flexGrow: 1 },

  govbrCard: {
    backgroundColor: colors.branco,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    marginBottom: 8,
  },
  logo: { fontSize: 28, fontWeight: '900', marginBottom: 6 },
  logoGov: { color: '#333333' },
  logoBr: { color: GOVBR_BLUE },
  govbrSub: { fontSize: 14, color: colors.muted, marginBottom: 16, lineHeight: 20 },
  erro: { fontSize: 13, color: colors.alerta, marginBottom: 10, lineHeight: 18 },
  btnGovBr: {
    backgroundColor: GOVBR_BLUE,
    borderRadius: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnGovBrText: { color: colors.branco, fontSize: 16, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },
  demo: { fontSize: 12, color: colors.muted, marginTop: 10, textAlign: 'center' },

  // Rodapé LGPD
  lgpdFooter: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.verdeBg,
    alignItems: 'center',
  },
  lgpd: { fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18 },
});
