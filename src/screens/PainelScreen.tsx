// Aba "Painel" (analista) — visão geral dos imóveis cadastrados no aparelho.
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../app/Screen';
import { Card, SectionTitle } from '../ui';
import { colors } from '../theme/colors';
import { listImoveis } from '../lib/store';
import { validatePerimeter } from '../lib/geo';
import type { Imovel } from '../types';

export function PainelScreen() {
  const [imoveis, setImoveis] = useState<Imovel[]>([]);

  useEffect(() => {
    listImoveis().then(setImoveis);
  }, []);

  const m = useMemo(() => {
    const total = imoveis.length;
    const areaTotal = imoveis.reduce((acc, i) => acc + (i.geometry.area_ha || 0), 0);
    const enviados = imoveis.filter((i) => i.status === 'enviado').length;
    const rascunhos = total - enviados;
    const aprovados = imoveis.filter((i) => i.validacao?.status === 'aprovado').length;
    const reprovados = imoveis.filter((i) => i.validacao?.status === 'reprovado').length;
    // Pendente = sem validação OU com problema geométrico não resolvido.
    const comProblema = imoveis.filter(
      (i) => !validatePerimeter(i.geometry.points).ok,
    ).length;
    const pendentes = total - aprovados - reprovados;
    const docsTotal = imoveis.reduce((acc, i) => acc + i.documentos.length, 0);
    return { total, areaTotal, enviados, rascunhos, aprovados, reprovados, pendentes, comProblema, docsTotal };
  }, [imoveis]);

  return (
    <Screen title="Painel" subtitle="Visão geral dos imóveis" showBack={false}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.grid}>
          <Metric value={String(m.total)} label="Imóveis" tone="verde" />
          <Metric value={`${m.areaTotal.toFixed(1)}`} label="Hectares (total)" tone="verde" />
          <Metric value={String(m.enviados)} label="Enviados" tone="ok" />
          <Metric value={String(m.rascunhos)} label="Rascunhos" tone="aviso" />
        </View>

        <Card style={{ marginTop: 14 }}>
          <SectionTitle>Validação</SectionTitle>
          <Linha label="Aprovados" value={m.aprovados} color={colors.verde} />
          <Linha label="Reprovados" value={m.reprovados} color={colors.alerta} />
          <Linha label="Pendentes de análise" value={m.pendentes} color={colors.aviso} />
          <Linha label="Com problema geométrico" value={m.comProblema} color={colors.alerta} />
        </Card>

        <Card style={{ marginTop: 14 }}>
          <SectionTitle>Documentos</SectionTitle>
          <Linha label="Anexos no total" value={m.docsTotal} color={colors.ink} />
        </Card>

        {m.total === 0 && (
          <Text style={s.empty}>
            Nenhum imóvel ainda. Cadastre o primeiro pela aba “Imóveis”.
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function Metric({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: 'verde' | 'ok' | 'aviso';
}) {
  const color = tone === 'aviso' ? colors.aviso : colors.verde;
  return (
    <View style={s.metric}>
      <Text style={[s.metricValue, { color }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function Linha({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.linha}>
      <Text style={s.linhaLabel}>{label}</Text>
      <Text style={[s.linhaValue, { color }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  content: { padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.branco,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 18,
    alignItems: 'center',
  },
  metricValue: { fontSize: 28, fontWeight: '800' },
  metricLabel: { fontSize: 12, color: colors.muted, marginTop: 4 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  linhaLabel: { fontSize: 14, color: colors.ink },
  linhaValue: { fontSize: 16, fontWeight: '800' },
  empty: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 20, lineHeight: 19 },
});
