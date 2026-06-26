import { NavigationProvider } from './src/app/navigation';
import { AppShell } from './src/app/AppShell';

export default function App() {
  return (
    <NavigationProvider>
      <AppShell />
    </NavigationProvider>
  );
}
