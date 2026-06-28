import { View } from 'react-native';
import { Router } from './Router';
import { TabBar } from './TabBar';
import { isTabRoot, useNav } from './navigation';

export function AppShell() {
  const { route, perfil, ready } = useNav();
  const showTabBar = ready && !!perfil && isTabRoot(route.name);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Router />
      </View>
      {showTabBar && <TabBar />}
    </View>
  );
}
