import React from 'react';
import { Download, Trash2, Edit2, Clock, Star } from 'lucide-react';
import type { ArchiveImage } from '../db/types';
import { downloadArchiveImage } from '../download/download';

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

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        downloadArchiveImage(image);
    };

    return (
        <div className={`image-card ${selected ? 'selected' : ''}`} onClick={onClick}>
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
                <img src={image.url} alt={image.prompt} className="card-image" loading="lazy" />
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
