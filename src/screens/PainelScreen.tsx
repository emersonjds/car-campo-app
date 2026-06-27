// Aba "Painel" (analista) — dashboard de números. A fila de visitas em si vive na
// aba "Visitas"; aqui ficam só os indicadores (a métrica "Requer visita" leva até lá).
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { Card, SectionTitle } from '../ui';
import { colors } from '../theme/colors';
import { listImoveis } from '../lib/store';
import { validatePerimeter } from '../lib/geo';
import { analisarAlteracaoImovel } from '../lib/alteracao';
import { analisarSobreposicoes } from '../lib/overlay';
import { gerarPainelAvisos } from '../lib/conferencia';
import { DEMO_CAMADAS } from '../lib/refLayers.demo';
import type { Imovel } from '../types';

export function PainelScreen() {
  const { switchTab } = useNav();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);

  useEffect(() => {
    listImoveis().then(setImoveis);
  }, []);

  const m = useMemo(() => {
    const total = imoveis.length;
    const areaTotal = imoveis.reduce((acc, i) => acc + (i.geometry.area_ha || 0), 0);
    const enviados = imoveis.filter((i) => i.status === 'enviado').length;
    const aprovados = imoveis.filter((i) => i.validacao?.status === 'aprovado').length;
    const reprovados = imoveis.filter((i) => i.validacao?.status === 'reprovado').length;
    const comProblema = imoveis.filter((i) => !validatePerimeter(i.geometry.points).ok).length;
    const pendentes = total - aprovados - reprovados;
    const docsTotal = imoveis.reduce((acc, i) => acc + i.documentos.length, 0);

    // Requer visita: mesma regra da aba Visitas (avisos de campo ou pedido do produtor),
    // ignorando os já decididos.
    let requerVisita = 0;
    for (const im of imoveis) {
      if (im.geometry.points.length < 3) continue;
      if (im.validacao?.status === 'aprovado') continue;
      const analise = analisarSobreposicoes(im.geometry.points, DEMO_CAMADAS, 'offline-demo');
      const alt = analisarAlteracaoImovel(im, DEMO_CAMADAS, 'offline-demo');
      const painel = gerarPainelAvisos(im.geometry.points, analise, alt?.relatorio ?? null);
      if (painel.requerVisita || im.solicitacaoVisita != null) requerVisita++;
    }

    return { total, areaTotal, enviados, aprovados, reprovados, pendentes, comProblema, docsTotal, requerVisita };
  }, [imoveis]);

  return (
    <Screen title="Painel" subtitle="Visão geral da carteira" showBack={false}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.grid}>
          <Metric value={String(m.total)} label="Imóveis" />
          <Metric value={`${m.areaTotal.toFixed(1)}`} label="Hectares (total)" />
          <Metric value={String(m.enviados)} label="Enviados" />
          <Metric
            value={String(m.requerVisita)}
            label="Requer visita"
            tone={m.requerVisita > 0 ? 'aviso' : 'verde'}
            onPress={m.requerVisita > 0 ? () => switchTab({ name: 'visitas' }) : undefined}
          />
        </View>

        {m.requerVisita > 0 && (
          <Text style={s.dica}>Toque em “Requer visita” para abrir a fila e agendar/contatar o produtor.</Text>
        )}

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
            Nenhum imóvel ainda. Os imóveis enviados pelos produtores aparecem na aba “Triagem”.
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function Metric({
  value,
  label,
  tone = 'verde',
  onPress,
}: {
  value: string;
  label: string;
  tone?: 'verde' | 'aviso';
  onPress?: () => void;
}) {
  const color = tone === 'aviso' ? colors.aviso : colors.verde;
  const inner = (
    <View style={[s.metric, onPress && s.metricLink]}>
      <Text style={[s.metricValue, { color }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}{onPress ? '  ›' : ''}</Text>
    </View>
  );
  return onPress ? (
    <TouchableOpacity style={s.metricWrap} activeOpacity={0.85} onPress={onPress}>{inner}</TouchableOpacity>
  ) : (
    <View style={s.metricWrap}>{inner}</View>
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
  metricWrap: { flexBasis: '47%', flexGrow: 1 },
  metric: {
    backgroundColor: colors.branco,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 18,
    alignItems: 'center',
  },
  metricLink: { borderColor: colors.aviso },
  metricValue: { fontSize: 28, fontWeight: '800' },
  metricLabel: { fontSize: 12, color: colors.muted, marginTop: 4 },
  dica: { fontSize: 12, color: colors.muted, marginTop: 10, lineHeight: 17 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  linhaLabel: { fontSize: 14, color: colors.ink },
  linhaValue: { fontSize: 16, fontWeight: '800' },
  empty: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 20, lineHeight: 19 },
});
