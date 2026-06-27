// Barra de navegação inferior — 4 abas por persona.
//  • Produtor rural: Dashboard · Medições · Documentos · Perfil
//  • Analista de campo: Painel · Medições · Documentos · Perfil
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { useNav, type Route, type RouteName } from './navigation';
import type { Perfil } from '../types';

type IoniconName = keyof typeof Ionicons.glyphMap;
interface Tab {
  route: Route;
  name: RouteName;
  icon: IoniconName;
  iconActive: IoniconName;
  label: string;
}

const TABS_PRODUTOR: Tab[] = [
  { route: { name: 'dashboard' },      name: 'dashboard',      icon: 'home-outline',          iconActive: 'home',          label: 'Dashboard' },
  { route: { name: 'medicoes' },       name: 'medicoes',       icon: 'map-outline',           iconActive: 'map',           label: 'Medições' },
  { route: { name: 'documentos-hub' }, name: 'documentos-hub', icon: 'document-text-outline', iconActive: 'document-text', label: 'Documentos' },
  { route: { name: 'perfil' },         name: 'perfil',         icon: 'person-outline',        iconActive: 'person',        label: 'Perfil' },
];

const TABS_ANALISTA: Tab[] = [
  { route: { name: 'painel' },         name: 'painel',         icon: 'stats-chart-outline',   iconActive: 'stats-chart',   label: 'Painel' },
  { route: { name: 'medicoes' },       name: 'medicoes',       icon: 'reader-outline',        iconActive: 'reader',        label: 'Medições' },
  { route: { name: 'documentos-hub' }, name: 'documentos-hub', icon: 'document-text-outline', iconActive: 'document-text', label: 'Documentos' },
  { route: { name: 'perfil' },         name: 'perfil',         icon: 'person-outline',        iconActive: 'person',        label: 'Perfil' },
];

export function tabsForPerfil(perfil: Perfil | null): Tab[] {
  return perfil === 'analista' ? TABS_ANALISTA : TABS_PRODUTOR;
}

export function TabBar() {
  const { route, perfil, switchTab } = useNav();
  const tabs = tabsForPerfil(perfil);

  return (
    <View style={s.bar}>
      {tabs.map((tab) => {
        const active = route.name === tab.name;
        return (
          <TouchableOpacity
            key={tab.name}
            style={s.tab}
            onPress={() => !active && switchTab(tab.route)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
          >
            {/* Pill verde ao redor do ícone quando ativo */}
            <View style={active ? s.pill : s.pillEmpty}>
              <Ionicons
                name={active ? tab.iconActive : tab.icon}
                size={22}
                color={active ? colors.verde : colors.muted}
              />
            </View>
            <Text style={[s.label, active && s.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.branco,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 6,
    paddingBottom: 26, // safe area iOS
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // ponytail: pill só muda o fundo — evita refluxo de layout com paddingEmpty.
  pill: {
    backgroundColor: colors.verdeBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 2,
  },
  pillEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 2,
  },
  label:       { fontSize: 11, color: colors.muted,  marginTop: 1, fontWeight: '600' },
  labelActive: { fontSize: 11, color: colors.verde,  marginTop: 1, fontWeight: '800' },
});
