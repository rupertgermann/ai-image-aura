import React from 'react';
import { Download, Trash2, Edit2, Clock, Star } from 'lucide-react';
import type { ArchiveImage } from '../db/types';
import { downloadArchiveImage } from '../download/download';
import { getApiCostSummaryLabel } from './CostSummaryPanel';

interface ImageCardProps {
    image: ArchiveImage;
    onDelete: (id: string) => void;
    onEdit: (image: ArchiveImage) => void;
    onToggleFavorite: (image: ArchiveImage) => void;
    onClick: () => void;
    selected?: boolean;
    onSelect?: (selected: boolean) => void;
}

const ImageCard: React.FC<ImageCardProps> = ({
    image, onDelete, onEdit, onToggleFavorite, onClick, selected = false, onSelect
}) => {
    const dateStr = new Date(image.timestamp).toLocaleDateString();
    const costLabel = getApiCostSummaryLabel(image.costLedger);

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        downloadArchiveImage(image);
    };

    return (
        <article className={`image-card ${selected ? 'selected' : ''}`}>
            <div className="card-image-wrapper">
                {onSelect && (
                    <button
                        type="button"
                        aria-label={`${selected ? 'Deselect' : 'Select'} image: ${image.prompt}`}
                        aria-pressed={selected}
                        className={`card-selector ${selected ? 'active' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(!selected);
                        }}
                    >
                        <div className="selector-inner">
                            {selected && <div className="selector-check" />}
                        </div>
                    </button>
                )}
                <button
                    className={`card-favorite-toggle ${image.favorite ? 'active' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(image);
                    }}
                    aria-pressed={!!image.favorite}
                    title={image.favorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                    <Star size={16} />
                </button>
                <button className="card-open" onClick={onClick} aria-label={`Open image: ${image.prompt}`}>
                    <img src={image.url} alt={image.prompt} className="card-image" loading="lazy" decoding="async" />
                </button>
                <div className="card-overlay">
                    <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="btn-ghost btn-icon" onClick={() => onEdit(image)} title="Edit">
                            <Edit2 size={16} />
                        </button>
                        <button className="btn-ghost btn-icon" onClick={handleDownload} title="Download">
                            <Download size={16} />
                        </button>
                        <button className="btn-amber btn-icon" onClick={() => onDelete(image.id)} title="Delete">
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="card-info">
                <button className="card-prompt" onClick={onClick} tabIndex={-1} title={image.prompt}>{image.prompt}</button>
                <div className="card-meta">
                    <span className="card-tag">{image.quality.toUpperCase()}</span>
                    {costLabel && <span className="card-cost">{costLabel}</span>}
                    <div className="card-date">
                        <Clock size={12} />
                        <span>{dateStr}</span>
                    </div>
                </div>
            </div>
        </article>
    );
};

export default ImageCard;
