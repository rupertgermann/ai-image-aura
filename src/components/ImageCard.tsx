import React from 'react';
import { Download, Trash2, Edit2, Clock } from 'lucide-react';
import type { ArchiveImage } from '../db/types';

interface ImageCardProps {
    image: ArchiveImage;
    onDelete: (id: string) => void;
    onEdit: (image: ArchiveImage) => void;
    onClick: () => void;
    selected?: boolean;
    onSelect?: (selected: boolean) => void;
}

const ImageCard: React.FC<ImageCardProps> = ({
    image, onDelete, onEdit, onClick, selected = false, onSelect
}) => {
    const dateStr = new Date(image.timestamp).toLocaleDateString();

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        const link = document.createElement('a');
        link.href = image.url;
        link.download = `aura-${image.id}.png`;
        link.click();
    };

    return (
        <div className={`image-card glass-panel ${selected ? 'selected' : ''}`} onClick={onClick}>
            <div className="card-image-wrapper">
                {onSelect && (
                    <div
                        className={`card-selector ${selected ? 'active' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(!selected);
                        }}
                    >
                        <div className="selector-inner">
                            {selected && <div className="selector-check" />}
                        </div>
                    </div>
                )}
                <img src={image.url} alt={image.prompt} className="card-image" loading="lazy" />
                <div className="card-overlay">
                    <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="aura-btn aura-btn--icon aura-btn--glass" onClick={() => onEdit(image)} title="Edit">
                            <Edit2 size={16} />
                        </button>
                        <button className="aura-btn aura-btn--icon aura-btn--glass" onClick={handleDownload} title="Download">
                            <Download size={16} />
                        </button>
                        <button className="aura-btn aura-btn--icon aura-btn--danger" onClick={() => onDelete(image.id)} title="Delete">
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="card-info">
                <p className="card-prompt" title={image.prompt}>{image.prompt}</p>
                <div className="card-meta">
                    <span className="card-tag">{image.quality.toUpperCase()}</span>
                    <div className="card-date">
                        <Clock size={12} />
                        <span>{dateStr}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageCard;
