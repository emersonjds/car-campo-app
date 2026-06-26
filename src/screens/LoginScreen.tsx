import { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useAuth } from '../auth/AuthContext';
import { Card, Field, PrimaryButton, SecondaryButton } from '../ui';
import { colors } from '../theme/colors';

const GOVBR_BLUE = '#1351B4';

export function LoginScreen() {
  const { loginGovBr, loginMatricula } = useAuth();
  const [consent, setConsent] = useState(false);
  const [analista, setAnalista] = useState(false);
  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false);

  async function autorizarGovBr() {
    setBusy(true);
    try { await loginGovBr(); }
    catch (e) { Alert.alert('gov.br', e instanceof Error ? e.message : 'Falha ao autenticar.'); }
    finally { setBusy(false); setConsent(false); }
  }

  async function entrarMatricula() {
    setBusy(true);
    try { await loginMatricula(matricula, senha); }
    catch (e) { Alert.alert('Login', e instanceof Error ? e.message : 'Falha no login.'); }
    finally { setBusy(false); }
  }

  return (
    <Screen title="CAR Campo" subtitle="Entre para demarcar seu imóvel" showBack={false}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.intro}>Produtor rural? Entre com sua conta gov.br.</Text>
        <TouchableOpacity style={[s.govbr, busy && { opacity: 0.6 }]} onPress={() => setConsent(true)} disabled={busy} activeOpacity={0.85}>
          <Text style={s.govbrText}>Entrar com <Text style={s.govbrBold}>gov.br</Text></Text>
        </TouchableOpacity>

        <View style={s.sep}><Text style={s.sepText}>ou</Text></View>

        {!analista ? (
          <SecondaryButton label="Sou analista — entrar com matrícula" onPress={() => setAnalista(true)} />
        ) : (
          <Card>
            <Field label="Matrícula" value={matricula} onChangeText={setMatricula} placeholder="Ex: 12345" keyboardType="numeric" />
            <Field label="Senha" value={senha} onChangeText={setSenha} placeholder="Sua senha" secureTextEntry />
            <PrimaryButton label="Entrar" onPress={entrarMatricula} loading={busy} />
            {__DEV__ && <Text style={s.demo}>Demo: matrícula 12345 · senha car2026</Text>}
          </Card>
        )}

        <Text style={s.lgpd}>🔒 Seus dados ficam protegidos neste aparelho (LGPD).</Text>
      </ScrollView>

      {/* Consentimento estilo gov.br (mock do fluxo OIDC) */}
      <Modal visible={consent} transparent animationType="slide" onRequestClose={() => setConsent(false)}>
        <View style={s.modalWrap}>
          <View style={s.modalCard}>
            <Text style={s.modalGov}><Text style={{ color: GOVBR_BLUE }}>gov</Text>.br</Text>
            <Text style={s.modalTitle}>CAR Campo quer acessar:</Text>
            {['Nome completo', 'CPF', 'Selo de confiabilidade'].map((scope) => (
              <Text key={scope} style={s.scope}>• {scope}</Text>
            ))}
            <Text style={s.modalHint}>Você entrará como produtor rural.</Text>
            <PrimaryButton label="Autorizar" onPress={autorizarGovBr} loading={busy} />
            <View style={{ height: 8 }} />
            <SecondaryButton label="Cancelar" onPress={() => setConsent(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: 16 },
  intro: { fontSize: 14, color: colors.muted, marginBottom: 12, lineHeight: 20 },
  govbr: { backgroundColor: GOVBR_BLUE, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  govbrText: { color: colors.branco, fontSize: 17, fontWeight: '700' },
  govbrBold: { fontWeight: '900' },
  sep: { alignItems: 'center', marginVertical: 18 },
  sepText: { color: colors.muted, fontSize: 13 },
  demo: { fontSize: 12, color: colors.muted, marginTop: 10, textAlign: 'center' },
  lgpd: { fontSize: 12, color: colors.muted, marginTop: 24, textAlign: 'center', lineHeight: 18 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.branco, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 22 },
  modalGov: { fontSize: 26, fontWeight: '900', color: colors.ink, marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  scope: { fontSize: 14, color: colors.muted, marginVertical: 3 },
  modalHint: { fontSize: 13, color: colors.muted, marginTop: 12, marginBottom: 16 },
});
