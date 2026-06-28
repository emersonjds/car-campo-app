// Feed informativo agrupado em HOJE / ANTERIORES: licenças liberadas, documentos
// aprovados, visita confirmada, sistema e lembretes. Itens de demonstração que
// ilustram o que o produtor recebe ao longo do processo.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../app/Screen';
import { useNav, type Route } from '../app/navigation';
import { colors } from '../theme/colors';

type Tipo = 'documento' | 'visita' | 'sistema' | 'lembrete';

interface Notif {
  id: string;
  tipo: Tipo;
  titulo: string;
  descricao: string;
  quando: string;
  grupo: 'hoje' | 'anteriores';
  rota?: Route;
}

// Ícone + cor por tipo (o fundo do ícone é a cor com baixa opacidade).
const TIPO: Record<Tipo, { cor: string; icon: keyof typeof Ionicons.glyphMap }> = {
  documento: { cor: colors.tertiary, icon: 'document-text' },
  visita: { cor: colors.primary, icon: 'checkmark-circle' },
  sistema: { cor: colors.mutedText, icon: 'cloud-download' },
  lembrete: { cor: colors.aviso, icon: 'alarm' },
};

// Feed informativo de demonstração — licenças/documentos liberados, visita, etc.
const DEMO: Notif[] = [
  {
    id: 'demo-licenca',
    tipo: 'documento',
    titulo: 'Licença ambiental liberada',
    descricao:
      'A licença ambiental da Propriedade Vale Verde foi liberada pelo órgão estadual.',
    quando: '11:28',
    grupo: 'hoje',
    rota: { name: 'documentos-hub' },
  },
  {
    id: 'demo-doc',
    tipo: 'documento',
    titulo: 'Documento aprovado',
    descricao: 'O laudo técnico ambiental foi aprovado e anexado ao seu processo.',
    quando: '10:02',
    grupo: 'hoje',
    rota: { name: 'documentos-hub' },
  },
  {
    id: 'demo-visita',
    tipo: 'visita',
    titulo: 'Visita técnica confirmada',
    descricao: 'O técnico confirmou a visita de campo para a medição oficial.',
    quando: '09:14',
    grupo: 'hoje',
    rota: { name: 'visitas' },
  },
  {
    id: 'demo-sistema',
    tipo: 'sistema',
    titulo: 'CAR em análise',
    descricao:
      'A inscrição no SICAR está em análise no órgão ambiental — já vale para crédito rural.',
    quando: 'Ontem, 18:30',
    grupo: 'anteriores',
  },
  {
    id: 'demo-lembrete',
    tipo: 'lembrete',
    titulo: 'Lembrete',
    descricao: 'Leve o PDF da medição preliminar na visita do técnico.',
    quando: '21 Mai',
    grupo: 'anteriores',
  },
];

export function NotificacoesScreen() {
  const { navigate } = useNav();
  const [lidas, setLidas] = useState<Set<string>>(new Set());

  const hoje = DEMO.filter((n) => n.grupo === 'hoje');
  const anteriores = DEMO.filter((n) => n.grupo === 'anteriores');

  // "Anteriores" já nascem lidas; as de hoje viram lidas ao tocar ou no "marcar todas".
  const isLida = (n: Notif) => n.grupo === 'anteriores' || lidas.has(n.id);
  const marcarTodas = () => setLidas(new Set(DEMO.map((n) => n.id)));

  const abrir = (n: Notif) => {
    setLidas((prev) => new Set(prev).add(n.id));
    if (n.rota) navigate(n.rota);
  };

  const renderItem = (n: Notif) => {
    const t = TIPO[n.tipo];
    const lida = isLida(n);
    return (
      <TouchableOpacity
        key={n.id}
        style={[s.card, !lida && { borderLeftWidth: 4, borderLeftColor: t.cor }]}
        activeOpacity={n.rota ? 0.85 : 1}
        onPress={() => abrir(n)}
      >
        <View style={[s.iconBox, { backgroundColor: `${t.cor}1f` }]}>
          <Ionicons name={t.icon} size={20} color={t.cor} />
        </View>
        <View style={s.body}>
          <View style={s.headRow}>
            <Text style={[s.titulo, lida && s.tituloLida]} numberOfLines={1}>
              {n.titulo}
            </Text>
            <Text style={s.quando}>{n.quando}</Text>
          </View>
          <Text style={s.descricao} numberOfLines={2}>
            {n.descricao}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Screen
      title="Notificações"
      subtitle="Acompanhe licenças, documentos e visitas"
      right={<View />} // já estamos nas notificações: sem sino auto-referente
    >
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={s.marcarTodas} onPress={marcarTodas} activeOpacity={0.7}>
          <Ionicons name="checkmark-done" size={16} color={colors.primary} />
          <Text style={s.marcarTodasTxt}>Marcar todas como lidas</Text>
        </TouchableOpacity>

        {hoje.length > 0 && <Text style={s.grupo}>HOJE</Text>}
        {hoje.map(renderItem)}

        {anteriores.length > 0 && <Text style={s.grupo}>ANTERIORES</Text>}
        {anteriores.map(renderItem)}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, paddingBottom: 28 },

  marcarTodas: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginBottom: 8 },
  marcarTodasTxt: { fontSize: 13, fontWeight: '700', color: colors.primary },

  grupo: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.mutedText,
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 8,
  },

  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.branco,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  iconBox: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  titulo: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.inkText },
  tituloLida: { color: colors.mutedText },
  quando: { fontSize: 11, color: colors.mutedText },
  descricao: { fontSize: 13, color: colors.mutedText, lineHeight: 18, marginTop: 3 },
});
