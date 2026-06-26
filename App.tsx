import { AuthProviderComponent } from './src/auth/AuthContext';
import { NavigationProvider } from './src/app/navigation';
import { AppShell } from './src/app/AppShell';

export default function App() {
  return (
    <AuthProviderComponent>
      <NavigationProvider>
        <AppShell />
      </NavigationProvider>
    </AuthProviderComponent>
  );
}
