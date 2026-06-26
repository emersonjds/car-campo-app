import { NavigationProvider } from './src/app/navigation';
import { Router } from './src/app/Router';

export default function App() {
  return (
    <NavigationProvider>
      <Router />
    </NavigationProvider>
  );
}
