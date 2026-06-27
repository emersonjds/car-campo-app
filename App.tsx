import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { AuthProviderComponent } from './src/auth/AuthContext';
import { NavigationProvider } from './src/app/navigation';
import { AppShell } from './src/app/AppShell';

export default function App() {
  const [fontsLoaded, fontsError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // ponytail: null enquanto carrega; splash nativo segura a tela nesse intervalo.
  // fontsError → continua com system font (não trava o app).
  if (!fontsLoaded && !fontsError) return null;

  return (
    <AuthProviderComponent>
      <NavigationProvider>
        <AppShell />
      </NavigationProvider>
    </AuthProviderComponent>
  );
}
