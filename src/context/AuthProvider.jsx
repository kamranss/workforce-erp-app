import { createContext, useContext, useMemo, useState } from 'react';

const AuthContext = createContext({
  user: null,
  role: '',
  name: '',
  userId: '',
  isAuthed: false,
  bootstrapped: false,
  setAuthState: () => {}
});

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    user: null,
    role: '',
    name: '',
    userId: '',
    isAuthed: false,
    bootstrapped: false
  });

  const value = useMemo(() => ({
    ...state,
    setAuthState: setState
  }), [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
