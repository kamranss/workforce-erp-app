import { useUI } from '../context/UIProvider.jsx';

export default function Toast() {
  const { toast } = useUI();
  return (
    <div
      id="toast"
      className={`toast toast-${toast.type || 'info'}${toast.visible ? '' : ' hidden'}`}
      role="status"
      aria-live="polite"
    >
      <span className="toast-dot" aria-hidden="true"></span>
      <span>{toast.message}</span>
    </div>
  );
}
