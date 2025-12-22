import React from 'react';
import { Download, Trash2, Edit2, Clock } from 'lucide-react';
import type { ArchiveImage } from '../db/types';

interface ImageCardProps {
    image: ArchiveImage;
    onDelete: (id: string) => void;
    onEdit: (image: ArchiveImage) => void;
}

const ImageCard: React.FC<ImageCardProps> = ({ image, onDelete, onEdit }) => {
    const dateStr = new Date(image.timestamp).toLocaleDateString();

    return (
        <div className="image-card glass-panel">
            <div className="card-image-wrapper">
                <img src={image.url} alt={image.prompt} className="card-image" loading="lazy" />
                <div className="card-overlay">
                    <div className="card-actions">
                        <button className="card-action-btn" onClick={() => onEdit(image)} title="Edit">
                            <Edit2 size={16} />
                        </button>
                        <button className="card-action-btn" title="Download">
                            <Download size={16} />
                        </button>
                        <button className="card-action-btn danger" onClick={() => onDelete(image.id)} title="Delete">
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
