import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Native dialogs keep keyboard focus inside and restore it when closed. */
export default function Modal({ label, onClose, className = '', children }: {
    label: string;
    onClose: () => void;
    className?: string;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDialogElement>(null);

    useLayoutEffect(() => {
        const dialog = ref.current!;
        const previousFocus = document.activeElement;
        dialog.showModal();
        return () => {
            dialog.close();
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
        };
    }, []);

    return (
        <dialog
            ref={ref}
            className={`modal-overlay ${className}`}
            aria-label={label}
            onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
            onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            {children}
        </dialog>
    );
}
