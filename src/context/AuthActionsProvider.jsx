'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { login, me } from '../api/authApi.js';
import { getStoredToken, setStoredToken } from '../api/httpClient.js';
import { clearInMemoryAuth, clearStoredAuth, setStore } from '../state/store.js';
import { useAuth } from './AuthProvider.jsx';
import { useUI } from './UIProvider.jsx';

const authLog = (...args) => console.info('[auth]', ...args);
const authErr = (...args) => console.error('[auth]', ...args);

const AuthActionsContext = createContext({
  loginStatus: '',
  loginError: '',
  loginBusy: false,
  loginWithCode: async () => false,
  logout: () => {},
  passkeySupport: { supported: false, available: false, checking: false, checked: true },
  updatePasskeySupport: async () => ({ supported: false, available: false, checking: false, checked: true })
});

function applyAuthUser(setAuthState, user, token) {
  setStoredToken(token || '');
  setStore({
    role: user?.role || '',
    name: user?.name || '',
    userId: user?.id || '',
    surname: user?.surname || '',
    email: user?.email || '',
    paymentOption: user?.paymentOption || '',
    paymentAmount: Number(user?.paymentAmount || 0),
    isActive: !!user?.isActive,
    token: token || getStoredToken()
  });

  setAuthState({
    user,
    role: user?.role || '',
    name: user?.name || '',
    userId: user?.id || '',
    isAuthed: Boolean(token || getStoredToken()),
    bootstrapped: true
  });
}

export function AuthActionsProvider({ children }) {
  const { setAuthState } = useAuth();
  const { setActiveTab } = useUI();
  const [loginStatus, setLoginStatus] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    authLog('bootstrap:start', { hasToken: Boolean(token) });
    if (!token) {
      authLog('bootstrap:no-token');
      setAuthState((prev) => ({ ...prev, bootstrapped: true }));
      return;
    }

    let mounted = true;
    me()
      .then((user) => {
        if (!mounted) return;
        authLog('bootstrap:me:ok', { userId: user?.id, role: user?.role });
        applyAuthUser(setAuthState, user, token);
      })
      .catch((err) => {
        if (!mounted) return;
        authErr('bootstrap:me:fail', { message: err?.message, code: err?.code });
        setStoredToken('');
        clearInMemoryAuth();
        clearStoredAuth();
        setAuthState({
          user: null,
          role: '',
          name: '',
          userId: '',
          isAuthed: false,
          bootstrapped: true
        });
      });

    return () => {
      mounted = false;
    };
  }, [setAuthState]);

  const loginWithCode = async (code) => {
    const passCode = String(code || '').trim();
    authLog('login:submit', { digits: passCode.length });
    if (!/^\d{6}$/.test(passCode)) {
      authErr('login:invalid-passcode-format');
      setLoginError('PassCode must be exactly 6 digits.');
      return false;
    }

    setLoginBusy(true);
    setLoginError('');
    setLoginStatus('Signing in...');

    try {
      const data = await login(passCode);
      authLog('login:api:ok', { userId: data?.user?.id, role: data?.user?.role, hasToken: Boolean(data?.token) });
      applyAuthUser(setAuthState, data.user, data.token);
      const role = String(data.user?.role || '').toLowerCase();
      const isAdmin = role === 'admin' || role === 'superadmin';
      authLog('login:set-active-tab', { tab: isAdmin ? 'home' : 'clock' });
      setActiveTab(isAdmin ? 'home' : 'clock');
      setLoginStatus('');
      authLog('login:done');
      return true;
    } catch (err) {
      authErr('login:api:fail', { message: err?.message, code: err?.code, details: err?.details });
      setLoginError(err?.message || 'Login failed.');
      setLoginStatus('');
      return false;
    } finally {
      authLog('login:finally');
      setLoginBusy(false);
    }
  };

  const logout = () => {
    setStoredToken('');
    clearInMemoryAuth();
    clearStoredAuth();
    setAuthState({
      user: null,
      role: '',
      name: '',
      userId: '',
      isAuthed: false,
      bootstrapped: true
    });
    setActiveTab('home');
  };

  const value = useMemo(() => ({
    loginStatus,
    loginError,
    loginBusy,
    loginWithCode,
    loginWithPasskey: async () => false,
    logout,
    adminOtpState: { otpId: '' },
    adminOtpValue: '',
    setAdminOtpValue: () => {},
    adminOtpMsg: '',
    adminOtpBusy: false,
    verifyAdminOtp: async () => false,
    cancelAdminOtp: () => {},
    passkeySupport: { supported: false, available: false, checking: false, checked: true },
    passkeyPromptVisible: false,
    passkeyPromptMsg: '',
    passkeyPromptBusy: false,
    registerPasskey: async () => ({ ok: false, canceled: true }),
    dismissPasskeyPrompt: () => {},
    updatePasskeySupport: async () => ({ supported: false, available: false, checking: false, checked: true })
  }), [loginStatus, loginError, loginBusy]);

  return <AuthActionsContext.Provider value={value}>{children}</AuthActionsContext.Provider>;
}

export function useAuthActions() {
  return useContext(AuthActionsContext);
}
