import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Screen } from '../app/Screen';
import { useNav } from '../app/navigation';
import { EmptyState } from '../ui';
import { formatarVisita } from '../ui/CalendarModal';
import { colors } from '../theme/colors';
import { listImoveis } from '../lib/store';
import { analisarSobreposicoes } from '../lib/overlay';
import { analisarAlteracaoImovel } from '../lib/alteracao';
import { gerarPainelAvisos, type AvisoConferencia, type PainelAvisos } from '../lib/conferencia';
import { DEMO_CAMADAS } from '../lib/refLayers.demo';
import type { Imovel } from '../types';
import type { Severidade } from '../lib/overlay';

/** Telefone de contato de demonstração (DDD de Sorriso/MT) quando o cadastro não traz um. */
const TELEFONE_DEMO = '66999990000';

interface VisitaItem {
  imovel: Imovel;
  painel: PainelAvisos;
}

const sevPeso: Record<Severidade, number> = { critico: 2, alerta: 1, info: 0 };
const sevColor: Record<Severidade, string> = {
  critico: colors.alerta,
  alerta: colors.aviso,
  info: colors.verde,
};

export function VisitasScreen() {
  const { navigate } = useNav();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);

  const load = useCallback(() => {
    let alive = true;
    listImoveis().then((list) => {
      if (alive) setImoveis(list);
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => load(), [load]);

  // Fila de visitas: imóveis ainda não decididos (não aprovados/reprovados) que
  // geram avisos de campo OU cuja conferência foi pedida pelo produtor.
  const fila = useMemo<VisitaItem[]>(() => {
    const itens: VisitaItem[] = [];
    for (const im of imoveis) {
      if (im.geometry.points.length < 3) continue;
      // Aprovado = resolvido sem pendência → sai da fila. Reprovado permanece:
      // uma medição reprovada por suspeita de invasão/embargo ainda exige visita
      // de campo e, se for o caso, encaminhamento ao órgão responsável.
      if (im.validacao?.status === 'aprovado') continue;
      const analise = analisarSobreposicoes(im.geometry.points, DEMO_CAMADAS, 'offline-demo');
      const alt = analisarAlteracaoImovel(im, DEMO_CAMADAS, 'offline-demo');
      const painel = gerarPainelAvisos(im.geometry.points, analise, alt?.relatorio ?? null);
      if (painel.requerVisita || im.solicitacaoVisita != null) {
        itens.push({ imovel: im, painel });
      }
    }
    return itens.sort((a, b) => {
      const ds = sevPeso[b.painel.severidadeGeral ?? 'info'] - sevPeso[a.painel.severidadeGeral ?? 'info'];
      return ds !== 0 ? ds : b.imovel.updatedAt - a.imovel.updatedAt;
    });
  }, [imoveis]);

  const urgentes = fila.filter((f) => f.painel.severidadeGeral === 'critico').length;

  const agendar = useCallback((im: Imovel) => {
    navigate({ name: 'agendar-visita', imovelId: im.id });
  }, [navigate]);

  const contatarWhatsApp = useCallback((im: VisitaItem) => {
    const tel = (im.imovel.produtor.telefone ?? TELEFONE_DEMO).replace(/\D/g, '');
    const primeiroNome = im.imovel.produtor.nome.split(' ')[0] || 'produtor(a)';
    const nomeImovel = im.imovel.imovel.nome || 'seu imóvel';
    const motivo = im.painel.avisos[0]?.rotulo.toLowerCase() ?? 'um ponto a conferir na medição';
    const msg =
      `Olá ${primeiroNome}, aqui é da equipe de análise do CAR. ` +
      `Sobre o imóvel "${nomeImovel}", identificamos ${motivo}. ` +
      `Podemos agendar uma visita de conferência de terreno?`;
    const url = `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('WhatsApp', 'Não foi possível abrir o WhatsApp neste dispositivo.'),
    );
  }, []);

  return (
    <Screen
      title="Visitas de campo"
      subtitle={
        fila.length === 0
          ? 'Nenhuma visita pendente'
          : `${fila.length} na fila${urgentes ? ` · ${urgentes} urgente${urgentes > 1 ? 's' : ''}` : ''}`
      }
      showBack={false}
    >
      <ScrollView contentContainerStyle={s.content}>
        {fila.length === 0 ? (
          <EmptyState
            title="Sem visitas pendentes"
            hint="As medições que exigem conferência em campo aparecem aqui, já priorizadas por gravidade."
          />
        ) : (
          fila.map(({ imovel, painel }) => (
            <VisitaCard
              key={imovel.id}
              imovel={imovel}
              painel={painel}
              onAgendar={() => agendar(imovel)}
              onWhatsApp={() => contatarWhatsApp({ imovel, painel })}
              onConferir={() => navigate({ name: 'demarcacao', imovelId: imovel.id })}
            />
          ))
        )}
      </ScrollView>

    </Screen>
  );
}

function VisitaCard({
  imovel,
  painel,
  onAgendar,
  onWhatsApp,
  onConferir,
}: {
  imovel: Imovel;
  painel: PainelAvisos;
  onAgendar: () => void;
  onWhatsApp: () => void;
  onConferir: () => void;
}) {
  const sev = painel.severidadeGeral ?? 'info';
  const local = [imovel.imovel.municipio, imovel.imovel.uf].filter(Boolean).join(' · ') || 'Sem localização';
  const topo = painel.avisos.slice(0, 3);
  const restantes = painel.avisos.length - topo.length;

  return (
    <View style={[s.card, { borderLeftColor: sevColor[sev] }]}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.nome} numberOfLines={1}>{imovel.produtor.nome}</Text>
          <Text style={s.sub} numberOfLines={1}>
            {imovel.imovel.nome || 'Imóvel sem nome'} · {local}
          </Text>
        </View>
        <Text style={[s.chip, { color: sevColor[sev], borderColor: sevColor[sev] }]}>
          {sev === 'critico' ? 'Urgente' : sev === 'alerta' ? 'Atenção' : 'Revisar'}
        </Text>
      </View>

      <Text style={s.medicao}>
        Última medição: {imovel.geometry.area_ha.toFixed(1)} ha · {imovel.geometry.points.length} vértices
      </Text>

      <View style={s.avisos}>
        {topo.map((a: AvisoConferencia, i) => (
          <View key={`${a.codigo}-${i}`} style={s.avisoRow}>
            <View style={[s.avisoDot, { backgroundColor: sevColor[a.severidade] }]} />
            <Text style={s.avisoTexto} numberOfLines={2}>
              <Text style={{ fontWeight: '800', color: sevColor[a.severidade] }}>{a.rotulo}</Text>
              {a.detalhe ? <Text style={s.avisoDet}>  ·  {a.detalhe}</Text> : null}
            </Text>
          </View>
        ))}
        {restantes > 0 && <Text style={s.mais}>+{restantes} outro{restantes > 1 ? 's' : ''} aviso{restantes > 1 ? 's' : ''}</Text>}
      </View>

      {imovel.alertaDivergencia && !imovel.alertaDivergencia.visto && (
        <Text style={s.informeNovo}>
          🔔 Sistema detectou divergência ({imovel.alertaDivergencia.delta_ha >= 0 ? '+' : ''}
          {imovel.alertaDivergencia.delta_ha.toFixed(1)} ha) — novo
        </Text>
      )}

      {imovel.solicitacaoVisita && (
        <Text style={s.solicitada}>
          📍 Conferência solicitada pelo produtor
          {imovel.solicitacaoVisita.motivo === 'documentacao' ? ' (documentação)' : ' (nova medição)'}
        </Text>
      )}

      {imovel.visitaAgendada && (
        <Text style={s.agendada}>
          ✓ Visita agendada
          {imovel.visitaAgendada.dataVisita
            ? ` — ${formatarVisita(imovel.visitaAgendada.dataVisita, imovel.visitaAgendada.periodo)}`
            : ''}
        </Text>
      )}

      <View style={s.acoes}>
        <TouchableOpacity style={[s.btn, s.btnAgendar]} activeOpacity={0.85} onPress={onAgendar}>
          <Text style={s.btnAgendarTxt}>{imovel.visitaAgendada ? 'Reagendar' : 'Agendar visita'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnWhats]} activeOpacity={0.85} onPress={onWhatsApp}>
          <Text style={s.btnWhatsTxt}>WhatsApp</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={s.btnConferir} activeOpacity={0.85} onPress={onConferir}>
        <Text style={s.btnConferirTxt}>📐 Fazer nova medição (conferência)</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, gap: 12, flexGrow: 1 },
  card: {
    backgroundColor: colors.branco,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 4,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nome: { fontSize: 16, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  chip: {
    fontSize: 11,
    fontWeight: '800',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  medicao: { fontSize: 13, color: colors.ink, fontWeight: '600', marginTop: 10 },

  avisos: { marginTop: 10, gap: 7 },
  avisoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  avisoDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  avisoTexto: { flex: 1, fontSize: 12.5, lineHeight: 17, color: colors.ink },
  avisoDet: { color: colors.muted, fontWeight: '600' },
  mais: { fontSize: 12, color: colors.muted, marginLeft: 16 },

  solicitada: { fontSize: 12, fontWeight: '800', color: colors.aviso, marginTop: 10 },
  informeNovo: { fontSize: 12, fontWeight: '800', color: colors.alerta, marginTop: 10 },
  agendada: { fontSize: 12, fontWeight: '800', color: colors.verde, marginTop: 10 },

  acoes: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnAgendar: { backgroundColor: colors.verde },
  btnAgendarTxt: { fontSize: 14, fontWeight: '800', color: colors.branco },
  btnWhats: { backgroundColor: '#e7f4ea', borderWidth: 1, borderColor: colors.verde },
  btnWhatsTxt: { fontSize: 14, fontWeight: '800', color: colors.verde },
  btnConferir: {
    marginTop: 10,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: colors.verdeBg,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  btnConferirTxt: { fontSize: 13, fontWeight: '700', color: colors.verde },
});
