import { useState } from 'react';
import { FiKey, FiLoader } from 'react-icons/fi';
import { useAuthActions } from '../context/AuthActionsProvider.jsx';

export default function Login() {
  const [passCode, setPassCode] = useState('');
  const { loginStatus, loginError, loginBusy, loginWithCode, loginWithPasskey, passkeySupport } = useAuthActions();
  const loginLog = (...args) => console.info('[login-ui]', ...args);
  const quickLogin = (code, role) => {
    if (loginBusy) return;
    setPassCode(code);
    loginLog('quick-login', { role, loginBusy });
    loginWithCode(code);
  };

  return (
    <div id="loginCard" className="section card">
      <h3>Welcome</h3>
      <p className="muted">Sign in with your 6-digit passCode.</p>
      <div className="login-row" style={{ marginTop: 8 }}>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder="Enter 6-digit passCode"
          autoComplete="off"
          value={passCode}
          onChange={(event) => setPassCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              loginLog('enter-pressed', { digits: String(passCode || '').trim().length, loginBusy });
              loginWithCode(passCode);
            }
          }}
          disabled={loginBusy}
        />
        <button
          type="button"
          className="icon-btn primary"
          onClick={() => {
            loginLog('button-click', { digits: String(passCode || '').trim().length, loginBusy });
            loginWithCode(passCode);
          }}
          disabled={loginBusy}
          aria-label="Sign in"
        >
          {loginBusy ? <FiLoader className="login-spinner" aria-hidden="true" /> : 'Go'}
        </button>
      </div>
      <div className="login-row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="ghost"
          onClick={() => quickLogin('444444', 'user')}
          disabled={loginBusy}
          style={{ flex: 1 }}
        >
          User Quick Login
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => quickLogin('123456', 'admin')}
          disabled={loginBusy}
          style={{ flex: 1 }}
        >
          Admin Quick Login
        </button>
      </div>
      {passkeySupport?.checked && passkeySupport?.available ? (
        <div className="login-row" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="login-passkey-btn"
            onClick={() => {
              loginLog('passkey-click', { loginBusy });
              loginWithPasskey();
            }}
            disabled={loginBusy}
          >
            {loginBusy ? <FiLoader className="login-spinner" aria-hidden="true" /> : <FiKey aria-hidden="true" />}
            <span>{loginBusy ? 'Checking Face ID...' : 'Sign in with Face ID'}</span>
          </button>
        </div>
      ) : null}
      {loginStatus ? <div className="muted" style={{ marginTop: 8 }}>{loginStatus}</div> : null}
      {loginError ? <div className="muted" style={{ marginTop: 8 }}>{loginError}</div> : null}
    </div>
  );
}
