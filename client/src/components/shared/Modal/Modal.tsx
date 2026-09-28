import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "../Icon";
import "./Modal.css";

interface ModalProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  /** Action buttons, right-aligned at the bottom. */
  footer?: ReactNode;
  /** Set false while a save is in flight so Esc or a backdrop click can't abandon it. */
  dismissible?: boolean;
  dataCy?: string;
}

/**
 * The only sanctioned way to ask the user for a decision (standard section 20); never
 * window.confirm. Built on the HTML <dialog> element, which is a styleable page element, not
 * a native browser dialog: it gives focus trapping, Esc handling and an inert background for
 * free. Open/closed is ordinary React state owned by the parent.
 */
export function Modal({ open, title, description, onClose, children, footer, dismissible = true, dataCy }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const requestClose = () => {
    if (dismissible) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-cy={dataCy}
      // Esc fires "cancel": keep React state as the source of truth instead of letting it close.
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      {open && (
        <div className="modal__panel">
          <header className="modal__header">
            <div>
              <h2 id={titleId} className="modal__title">
                {title}
              </h2>
              {description && (
                <div id={descriptionId} className="modal__description">
                  {description}
                </div>
              )}
            </div>
            <button
              type="button"
              className="modal__close"
              onClick={requestClose}
              disabled={!dismissible}
              aria-label="Close"
            >
              <Icon name="close" size={18} />
            </button>
          </header>
          {children && <div className="modal__body">{children}</div>}
          {footer && <footer className="modal__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
