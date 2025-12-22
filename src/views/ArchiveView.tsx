import React from 'react';
import ImageCard from '../components/ImageCard';
import type { ArchiveImage } from '../db/types';
import { Image as ImageIcon, Search, Download, Trash2, X } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import ConfirmModal from '../components/ConfirmModal';

interface ArchiveViewProps {
    images: ArchiveImage[];
    onDeleteImage: (id: string) => void;
    onEditImage: (image: ArchiveImage) => void;
    onSelectImage: (image: ArchiveImage) => void;
}

const ArchiveView: React.FC<ArchiveViewProps> = ({ images, onDeleteImage, onEditImage, onSelectImage }) => {
    const [search, setSearch] = useLocalStorage('archive_search', '');
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === filteredImages.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredImages.map(img => img.id)));
        }
    };

    const handleBulkDownload = () => {
        const selectedImages = images.filter(img => selectedIds.has(img.id));
        selectedImages.forEach((img, index) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = img.url;
                link.download = `aura-${img.id}.png`;
                link.click();
            }, index * 200); // Stagger downloads to prevent browser blocking
        });
    };

    const handleBulkDelete = () => {
        selectedIds.forEach(id => onDeleteImage(id));
        setSelectedIds(new Set());
        setIsConfirmOpen(false);
    };

    const filteredImages = images.filter(img =>
        img.prompt.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="archive-container">
            <header className="view-header">
                <div className="header-flex">
                    <div>
                        <h1 className="gradient-text">Archive</h1>
                        <p>Your creative collection across time.</p>
                    </div>
                    <div className="header-actions">
                        <button
                            className={`glass-btn select-all-btn ${selectedIds.size === filteredImages.length && filteredImages.length > 0 ? 'active' : ''}`}
                            onClick={selectAll}
                            disabled={filteredImages.length === 0}
                        >
                            {selectedIds.size === filteredImages.length && filteredImages.length > 0 ? 'Deselect All' : 'Select All'}
                        </button>
                        <div className="search-box glass-panel">
                            <Search size={18} className="search-icon" />
                            <input
                                type="text"
                                placeholder="Search prompts..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </header>

            {images.length === 0 ? (
                <div className="empty-archive">
                    <div className="empty-state glass-panel">
                        <ImageIcon size={48} className="dim-icon" />
                        <h3>No Images Yet</h3>
                        <p>Generated images will appear here after you save them.</p>
                    </div>
                </div>
            ) : (
                <div className="image-grid">
                    {filteredImages.map(img => (
                        <ImageCard
                            key={img.id}
                            image={img}
                            onDelete={onDeleteImage}
                            onEdit={onEditImage}
                            onClick={() => onSelectImage(img)}
                            selected={selectedIds.has(img.id)}
                            onSelect={() => toggleSelect(img.id)}
                        />
                    ))}
                </div>
            )}

            {selectedIds.size > 0 && (
                <div className="bulk-action-bar glass-panel active">
                    <div className="bulk-info">
                        <span className="selection-count">{selectedIds.size}</span>
                        <span>Images Selected</span>
                    </div>
                    <div className="bulk-actions">
                        <button className="glass-btn" onClick={() => setSelectedIds(new Set())}>
                            <X size={18} /> Cancel
                        </button>
                        <button className="glass-btn info" onClick={handleBulkDownload}>
                            <Download size={18} /> Download All
                        </button>
                        <button className="glass-btn danger" onClick={() => setIsConfirmOpen(true)}>
                            <Trash2 size={18} /> Delete All
                        </button>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={isConfirmOpen}
                title={`Delete ${selectedIds.size} Masterpieces?`}
                message={`You are about to permanently remove ${selectedIds.size} images and their binary data. This action cannot be reversed.`}
                confirmText="Delete All"
                type="danger"
                onConfirm={handleBulkDelete}
                onCancel={() => setIsConfirmOpen(false)}
            />
        </div>
    );
};

export default ArchiveView;
