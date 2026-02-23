import { useState } from 'react';
import { FiLoader } from 'react-icons/fi';
import { useAuthActions } from '../context/AuthActionsProvider.jsx';

export default function Login() {
  const [passCode, setPassCode] = useState('');
  const { loginStatus, loginError, loginBusy, loginWithCode } = useAuthActions();
  const loginLog = (...args) => console.info('[login-ui]', ...args);

  return (
    <div id="loginCard" className="section card">
      <h3>Welcome</h3>
      <p className="muted">Sign in with your 6-digit passCode.</p>
      <div className="login-row" style={{ marginTop: 8 }}>
        <input
          inputMode="numeric"
          maxLength={6}
          placeholder="Enter 6-digit passCode"
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
      <button
        type="button"
        className="btn"
        style={{ marginTop: 10 }}
        onClick={() => {
          const quickCode = '123456';
          setPassCode(quickCode);
          loginLog('quick-login-click', { digits: quickCode.length, loginBusy });
          loginWithCode(quickCode);
        }}
        disabled={loginBusy}
      >
        Quick Login
      </button>
      {loginStatus ? <div className="muted" style={{ marginTop: 8 }}>{loginStatus}</div> : null}
      {loginError ? <div className="muted" style={{ marginTop: 8 }}>{loginError}</div> : null}
    </div>
  );
}
