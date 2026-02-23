import { useUI } from '../context/UIProvider.jsx';

export default function GlobalLoader() {
  const { globalLoader, hideGlobalLoader } = useUI();
  const showChip = globalLoader.visible;

  return (
    <>
      <div id="globalLoader" className={`global-loader${showChip ? '' : ' hidden'}`}>
        <div className="loader-panel">
          <div className="loader-spinner"></div>
          <div id="globalLoaderMsg" className="loader-msg">{globalLoader.message || 'Loading...'}</div>
          <button id="globalLoaderClose" className="loader-close" onClick={() => hideGlobalLoader(true)}>Dismiss</button>
        </div>
      </div>
    </>
  );
}
