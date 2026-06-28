import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../app/Screen';
import { WizardSteps } from '../app/WizardSteps';
import { useNav } from '../app/navigation';
import { Card, Field, PrimaryButton, SecondaryButton } from '../ui';
import { colors } from '../theme/colors';
import { getImovel, upsertImovel } from '../lib/store';
import type { Imovel } from '../types';
import { useAuth } from '../auth/AuthContext';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO';

export function CadastroScreen({ imovelId }: { imovelId?: string }) {
  const { perfil, navigate, replace, switchTab } = useNav();
  const { sessao } = useAuth();

  const [loaded, setLoaded] = useState(false);
  const [existing, setExisting] = useState<Imovel | null>(null);
  // ponytail: pré-preenchido com dados de demo (sobrescrito ao editar um imóvel existente).
  const [nome, setNome] = useState('Sítio Boa Esperança');
  const [municipio, setMunicipio] = useState('Sorriso');
  const [uf, setUf] = useState('MT');
  const [matricula, setMatricula] = useState('');
  const [modulos, setModulos] = useState('');
  const [produtorNome, setProdutorNome] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [carNumero, setCarNumero] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!imovelId && sessao?.method === 'govbr') {
      setProdutorNome((v) => v || sessao.nome);
      setCpfCnpj((v) => v || (sessao.cpf ?? ''));
    }
  }, [imovelId, sessao]);

  useEffect(() => {
    if (!imovelId) {
      setLoaded(true);
      return;
    }
    getImovel(imovelId).then((im) => {
      if (im) {
        setExisting(im);
        setNome(im.imovel.nome);
        setMunicipio(im.imovel.municipio);
        setUf(im.imovel.uf);
        setMatricula(im.imovel.matricula ?? '');
        setModulos(im.imovel.modulosFiscais ? String(im.imovel.modulosFiscais) : '');
        setCarNumero(im.imovel.carNumero ?? '');
        setProdutorNome(im.produtor.nome);
        setCpfCnpj(im.produtor.cpfCnpj);
      }
      setLoaded(true);
    });
  }, [imovelId]);

  function validate(): string | null {
    if (!nome.trim()) return 'Informe o nome do imóvel.';
    if (!produtorNome.trim()) return 'Informe o nome do produtor.';
    if (!municipio.trim()) return 'Informe o município.';
    if (uf && !UFS.includes(uf.toUpperCase())) return 'UF inválida (ex: MT, PA, GO).';
    return null;
  }

  async function handleNext() {
    const err = validate();
    if (err) {
      Alert.alert('Faltou um dado', err);
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertImovel(imovelId ?? null, {
        perfil: perfil ?? 'produtor',
        produtor: { nome: produtorNome.trim(), cpfCnpj: cpfCnpj.trim() },
        imovel: {
          nome: nome.trim(),
          municipio: municipio.trim(),
          uf: uf.trim().toUpperCase(),
          matricula: matricula.trim() || undefined,
          modulosFiscais: modulos ? Number(modulos.replace(',', '.')) : undefined,
          carNumero: carNumero.trim() || undefined,
          uso: existing?.imovel.uso,
        },
        geometry: existing?.geometry ?? { points: [], area_ha: 0, perimetro_m: 0 },
        documentos: existing?.documentos ?? [],
      });
      // Substitui a rota para não empilhar cadastro→cadastro ao voltar da demarcação.
      replace({ name: 'cadastro', imovelId: saved.id });
      navigate({ name: 'demarcacao', imovelId: saved.id });
    } catch {
      Alert.alert('Erro ao salvar', 'Não foi possível salvar o imóvel. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <Screen title="Cadastro"><View /></Screen>;

  return (
    <Screen title="Cadastro" subtitle="Dados do imóvel e do produtor">
      <WizardSteps active={0} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={s.group}>Imóvel</Text>
            <Field label="Nome do imóvel" value={nome} onChangeText={setNome} placeholder="Ex: Sítio Boa Esperança" autoCapitalize="words" />
            <View style={s.row}>
              <View style={{ flex: 2 }}>
                <Field label="Município" value={municipio} onChangeText={setMunicipio} placeholder="Ex: Sorriso" autoCapitalize="words" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="UF" value={uf} onChangeText={(t) => setUf(t.toUpperCase().slice(0, 2))} placeholder="MT" autoCapitalize="characters" />
              </View>
            </View>
            <Field label="Número do CAR (opcional)" value={carNumero} onChangeText={setCarNumero} placeholder="UF-IBGE-..." autoCapitalize="characters" />
            <View style={s.row}>
              <View style={{ flex: 2 }}>
                <Field label="Matrícula (opcional)" value={matricula} onChangeText={setMatricula} placeholder="Nº da matrícula" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Módulos fiscais" value={modulos} onChangeText={setModulos} placeholder="Ex: 4" keyboardType="numeric" />
              </View>
            </View>
          </Card>

          <Card style={{ marginTop: 14 }}>
            <Text style={s.group}>Produtor</Text>
            <Field label="Nome do produtor" value={produtorNome} onChangeText={setProdutorNome} placeholder="Nome completo" autoCapitalize="words" />
            <Field label="CPF ou CNPJ" value={cpfCnpj} onChangeText={setCpfCnpj} placeholder="Somente números" keyboardType="numeric" />
            <Text style={s.lgpd}>🔒 Dado pessoal protegido (LGPD). Fica somente no seu aparelho.</Text>
          </Card>

          <View style={s.actions}>
            <SecondaryButton label="Cancelar" onPress={() => switchTab({ name: 'home' })} />
            <PrimaryButton label="Avançar" onPress={handleNext} loading={saving} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  group: { fontSize: 13, fontWeight: '800', color: colors.verde, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10 },
  lgpd: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
});
