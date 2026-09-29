import { Children, isValidElement, useEffectEvent, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

/** Retain removed keyed children until their CSS exit finishes, including reduced motion. */
export default function Presence({ children }: { children: ReactNode }) {
    const incoming = Children.toArray(children).filter(isValidElement);
    const presentKeys = new Set(incoming.map((child) => child.key));
    const [previous, setPrevious] = useState(children);
    const [retained, setRetained] = useState(incoming);

    if (children !== previous) {
        const next = [...incoming];
        retained.forEach((child, index) => {
            if (!presentKeys.has(child.key)) next.splice(index, 0, child);
        });
        setPrevious(children);
        setRetained(next);
    }

    return retained.map((child) => (
        <PresenceItem key={child.key} present={presentKeys.has(child.key)}
            onExit={() => setRetained((items) => items.filter((item) => item.key !== child.key))}>
            {child}
        </PresenceItem>
    ));
}

function PresenceItem({ children, present, onExit }: {
    children: ReactElement;
    present: boolean;
    onExit: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const finish = useEffectEvent(onExit);

    useLayoutEffect(() => {
        const elements = Array.from(ref.current?.children ?? []);
        // Release native modal focus immediately; CSS keeps its top layer visible for the exit.
        elements.forEach((element) => {
            if (element instanceof HTMLElement) element.inert = !present;
            if (element instanceof HTMLDialogElement) {
                if (present && !element.open) element.showModal();
                else if (!present) element.close();
            }
        });
        if (present) return;
        let cancelled = false;
        const animations = elements.flatMap((element) => element.getAnimations());
        void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
            if (!cancelled) finish();
        });
        return () => { cancelled = true; };
    }, [present]);

    return <div ref={ref} className="presence" data-present={present} inert={!present} aria-hidden={!present || undefined}>
        {children}
    </div>;
}
