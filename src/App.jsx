'use client';

import { AuthActionsProvider } from './context/AuthActionsProvider.jsx';
import { AuthProvider } from './context/AuthProvider.jsx';
import { AppDataProvider } from './context/AppDataProvider.jsx';
import { UIProvider } from './context/UIProvider.jsx';
import AppShell from './components/AppShell.jsx';

export default function App() {
  return (
    <AuthProvider>
      <UIProvider>
        <AppDataProvider>
          <AuthActionsProvider>
            <AppShell />
          </AuthActionsProvider>
        </AppDataProvider>
      </UIProvider>
    </AuthProvider>
  );
}
