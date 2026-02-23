import { useEffect } from 'react';
import { FiX } from 'react-icons/fi';

export default function SimpleModal({ open, title, onClose, children, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('modal-open');
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="simple-modal-overlay" onClick={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <div className={`simple-modal simple-modal-${size}`} role="dialog" aria-modal="true" aria-label={title || 'Modal'}>
        <div className="simple-modal-head">
          <h3>{title || 'Modal'}</h3>
          <button type="button" className="ghost simple-modal-close" onClick={onClose} aria-label="Close">
            <FiX />
          </button>
        </div>
        <div className="simple-modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
