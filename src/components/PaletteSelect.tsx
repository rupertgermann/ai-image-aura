import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';

const PALETTE_COLORS: Record<string, string[]> = {
    'copper + teal + cream': ['#b87333', '#009688', '#f5f0e8'],
    'cobalt + vermilion + bone': ['#0047ab', '#e34234', '#e8dcc8'],
    'sage + sand + charcoal': ['#9caf88', '#c2b280', '#36454f'],
    'magenta + midnight blue + silver': ['#cc00cc', '#003366', '#c0c0c0'],
    'emerald + burgundy + gold': ['#2e8b57', '#800020', '#d4af37'],
    'dusty rose + slate + ivory': ['#c4a4a4', '#708090', '#fffff0'],
    'burnt orange + navy + warm white': ['#cc5500', '#002147', '#faf9f0'],
};
const PALETTES = ['none', ...Object.keys(PALETTE_COLORS)];

function PalettePreview({ value }: { value: string }) {
    return <span className="palette-preview">
        {PALETTE_COLORS[value] && <span className="palette-swatches" aria-hidden="true">
            {PALETTE_COLORS[value].map((color) => <span key={color} style={{ backgroundColor: color }} />)}
        </span>}
        <span>{value === 'none' ? 'None' : value}</span>
    </span>;
}

export default function PaletteSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const id = useId();
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const selectedIndex = Math.max(0, PALETTES.indexOf(value));
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(selectedIndex);

    useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, [open]);

    useEffect(() => {
        if (open) document.getElementById(`${id}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
    }, [open, activeIndex, id]);

    const select = (index: number) => {
        onChange(PALETTES[index]);
        setOpen(false);
        trigger.current?.focus();
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        const current = open ? activeIndex : selectedIndex;
        let next = current;
        switch (event.key) {
            case 'ArrowDown': next = open ? Math.min(current + 1, PALETTES.length - 1) : current; break;
            case 'ArrowUp': next = open ? Math.max(current - 1, 0) : current; break;
            case 'Home': next = 0; break;
            case 'End': next = PALETTES.length - 1; break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                if (open) select(current);
                else { setActiveIndex(selectedIndex); setOpen(true); }
                return;
            case 'Escape': setOpen(false); event.preventDefault(); return;
            case 'Tab': setOpen(false); return;
            default: {
                if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
                const match = PALETTES.findIndex((_, offset) => PALETTES[(current + offset + 1) % PALETTES.length].startsWith(event.key.toLowerCase()));
                if (match < 0) return;
                next = (current + match + 1) % PALETTES.length;
            }
        }
        event.preventDefault();
        setActiveIndex(next);
        setOpen(true);
    };

    return <div ref={root} className="palette-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
        <button ref={trigger} type="button" className="palette-trigger" role="combobox" aria-label="Palette"
            aria-expanded={open} aria-controls={id} aria-haspopup="listbox"
            aria-activedescendant={open ? `${id}-${activeIndex}` : undefined}
            onClick={() => { setActiveIndex(selectedIndex); setOpen(!open); }} onKeyDown={handleKeyDown}>
            <PalettePreview value={value} /><ChevronDown size={16} aria-hidden="true" />
        </button>
        {open && <div id={id} className="palette-options" role="listbox" aria-label="Palette">
            {PALETTES.map((palette, index) => <button key={palette} id={`${id}-${index}`} type="button"
                role="option" aria-selected={index === activeIndex} tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()} onMouseMove={() => setActiveIndex(index)} onClick={() => select(index)}>
                <PalettePreview value={palette} />
            </button>)}
        </div>}
    </div>;
}
