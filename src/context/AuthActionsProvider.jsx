'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  login,
  me,
  passkeyDelete,
  passkeyList,
  passkeyLoginOptions,
  passkeyLoginVerify,
  passkeyRegisterOptions,
  passkeyRegisterVerify
} from '../api/authApi.js';
import { getStoredToken, setStoredToken } from '../api/httpClient.js';
import { clearInMemoryAuth, clearStoredAuth, setStore } from '../state/store.js';
import { useAuth } from './AuthProvider.jsx';
import { useUI } from './UIProvider.jsx';

const authLog = (...args) => console.info('[auth]', ...args);
const authErr = (...args) => console.error('[auth]', ...args);
const PASSKEY_FEATURE_ENABLED = ['true', '1', 'yes', 'on'].includes(
  String(process.env.NEXT_PUBLIC_PASSKEY_ENABLED || process.env.NEXT_PUBLIC_FEATURE_PASSKEY_AUTH || '').trim().toLowerCase()
);

function resolveWebAuthnOptions(payload) {
  if (payload && typeof payload === 'object' && payload.challenge) return payload;
  if (payload?.options && typeof payload.options === 'object') return payload.options;
  if (payload?.data && typeof payload.data === 'object') return payload.data;
  return payload;
}

function toPlainCredential(credential) {
  try {
    return JSON.parse(JSON.stringify(credential));
  } catch {
    return credential;
  }
}

function isPasskeyDisabledError(err) {
  return String(err?.code || '').toUpperCase() === 'PASSKEY_DISABLED';
}

const AuthActionsContext = createContext({
  loginStatus: '',
  loginError: '',
  loginBusy: false,
  loginWithCode: async () => false,
  loginWithPasskey: async () => false,
  logout: () => {},
  passkeySupport: { supported: false, available: false, checking: false, checked: true },
  passkeyPromptVisible: false,
  passkeyPromptMsg: '',
  passkeyPromptBusy: false,
  registerPasskey: async () => ({ ok: false, canceled: true }),
  listPasskeys: async () => [],
  deletePasskey: async () => false,
  dismissPasskeyPrompt: () => {},
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
  const [passkeySupport, setPasskeySupport] = useState({ supported: false, available: false, checking: false, checked: false });
  const [passkeyPromptVisible, setPasskeyPromptVisible] = useState(false);
  const [passkeyPromptMsg, setPasskeyPromptMsg] = useState('');
  const [passkeyPromptBusy, setPasskeyPromptBusy] = useState(false);

  const disablePasskeyUi = () => {
    setPasskeySupport({ supported: false, available: false, checking: false, checked: true });
  };

  const updatePasskeySupport = async () => {
    if (!PASSKEY_FEATURE_ENABLED) {
      const next = { supported: false, available: false, checking: false, checked: true };
      setPasskeySupport(next);
      return next;
    }
    if (typeof window === 'undefined') {
      const fallback = { supported: false, available: false, checking: false, checked: true };
      setPasskeySupport(fallback);
      return fallback;
    }
    setPasskeySupport((prev) => ({ ...prev, checking: true }));
    try {
      const supported = typeof window.PublicKeyCredential !== 'undefined';
      if (!supported) {
        const next = { supported: false, available: false, checking: false, checked: true };
        setPasskeySupport(next);
        return next;
      }
      let available = false;
      if (typeof window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        available = Boolean(await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
      }
      const next = { supported, available, checking: false, checked: true };
      setPasskeySupport(next);
      return next;
    } catch {
      const next = { supported: false, available: false, checking: false, checked: true };
      setPasskeySupport(next);
      return next;
    }
  };

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

  useEffect(() => {
    updatePasskeySupport().catch(() => {});
  }, []);

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

  const loginWithPasskey = async () => {
    if (!PASSKEY_FEATURE_ENABLED) {
      setLoginError('Face ID sign-in is temporarily unavailable. Use your 6-digit passCode.');
      setLoginStatus('');
      return false;
    }
    setLoginBusy(true);
    setLoginError('');
    setLoginStatus('Waiting for Face ID / Passkey...');
    try {
      const options = resolveWebAuthnOptions(await passkeyLoginOptions());
      const { startAuthentication } = await import('@simplewebauthn/browser');
      const credential = await startAuthentication({ optionsJSON: options });
      const data = await passkeyLoginVerify(toPlainCredential(credential));
      authLog('passkey:login:ok', { userId: data?.user?.id, role: data?.user?.role, hasToken: Boolean(data?.token) });
      applyAuthUser(setAuthState, data.user, data.token);
      const role = String(data.user?.role || '').toLowerCase();
      const isAdmin = role === 'admin' || role === 'superadmin';
      setActiveTab(isAdmin ? 'home' : 'clock');
      setLoginStatus('');
      return true;
    } catch (err) {
      const canceled = err?.name === 'NotAllowedError';
      if (canceled) {
        setLoginError('Face ID sign-in was canceled or timed out. Please try again.');
      } else if (isPasskeyDisabledError(err)) {
        disablePasskeyUi();
        setLoginError('Face ID sign-in is temporarily unavailable. Use your 6-digit passCode.');
      } else {
        setLoginError(err?.message || 'Face ID login failed.');
      }
      setLoginStatus('');
      return false;
    } finally {
      setLoginBusy(false);
    }
  };

  const registerPasskey = async () => {
    if (!PASSKEY_FEATURE_ENABLED) {
      setPasskeyPromptVisible(false);
      setPasskeyPromptBusy(false);
      setPasskeyPromptMsg('');
      return { ok: false, canceled: true };
    }
    setPasskeyPromptVisible(true);
    setPasskeyPromptBusy(true);
    setPasskeyPromptMsg('Waiting for Face ID / Passkey...');
    try {
      const options = resolveWebAuthnOptions(await passkeyRegisterOptions());
      const { startRegistration } = await import('@simplewebauthn/browser');
      const credential = await startRegistration({ optionsJSON: options });
      await passkeyRegisterVerify(toPlainCredential(credential));
      setPasskeyPromptMsg('Face ID enabled successfully.');
      await updatePasskeySupport();
      return { ok: true, canceled: false };
    } catch (err) {
      const canceled = err?.name === 'NotAllowedError';
      if (canceled) {
        setPasskeyPromptMsg('Face ID setup canceled.');
        return { ok: false, canceled: true };
      }
      if (isPasskeyDisabledError(err)) {
        disablePasskeyUi();
        setPasskeyPromptMsg('Face ID setup is temporarily unavailable.');
        return { ok: false, canceled: false };
      }
      setPasskeyPromptMsg(err?.message || 'Failed to enable Face ID.');
      return { ok: false, canceled: false };
    } finally {
      setPasskeyPromptBusy(false);
    }
  };

  const listPasskeys = async () => {
    if (!PASSKEY_FEATURE_ENABLED) return [];
    try {
      const data = await passkeyList();
      return Array.isArray(data?.items) ? data.items : [];
    } catch (err) {
      if (isPasskeyDisabledError(err)) {
        disablePasskeyUi();
        return [];
      }
      throw err;
    }
  };

  const deletePasskey = async (id) => {
    if (!PASSKEY_FEATURE_ENABLED) return false;
    try {
      await passkeyDelete(id);
      return true;
    } catch (err) {
      if (isPasskeyDisabledError(err)) {
        disablePasskeyUi();
        return false;
      }
      throw err;
    }
  };

  const dismissPasskeyPrompt = () => {
    setPasskeyPromptVisible(false);
    setPasskeyPromptMsg('');
    setPasskeyPromptBusy(false);
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
    loginWithPasskey,
    logout,
    adminOtpState: { otpId: '' },
    adminOtpValue: '',
    setAdminOtpValue: () => {},
    adminOtpMsg: '',
    adminOtpBusy: false,
    verifyAdminOtp: async () => false,
    cancelAdminOtp: () => {},
    passkeySupport,
    passkeyPromptVisible,
    passkeyPromptMsg,
    passkeyPromptBusy,
    registerPasskey,
    listPasskeys,
    deletePasskey,
    dismissPasskeyPrompt,
    updatePasskeySupport
  }), [loginStatus, loginError, loginBusy, passkeySupport, passkeyPromptVisible, passkeyPromptMsg, passkeyPromptBusy]);

  return <AuthActionsContext.Provider value={value}>{children}</AuthActionsContext.Provider>;
}

export function useAuthActions() {
  return useContext(AuthActionsContext);
}
