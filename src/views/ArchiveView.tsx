import React from 'react';
import ImageCard from '../components/ImageCard';
import type { ArchiveImage } from '../db/types';
import { downloadBlob } from '../download/download';
import { Image as ImageIcon, Search, Download, Trash2, X, Loader2 } from 'lucide-react';
import JSZip from 'jszip';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface ArchiveViewProps {
    images: ArchiveImage[];
    selectedIds: Set<string>;
    onDeleteImage: (id: string) => void;
    onEditImage: (image: ArchiveImage) => void;
    onOpenImage: (image: ArchiveImage) => void;
    onToggleSelection: (id: string) => void;
    onToggleSelectAll: (ids: string[]) => void;
    onClearSelection: () => void;
    onDeleteSelected: () => void;
}

const ArchiveView: React.FC<ArchiveViewProps> = ({
    images,
    selectedIds,
    onDeleteImage,
    onEditImage,
    onOpenImage,
    onToggleSelection,
    onToggleSelectAll,
    onClearSelection,
    onDeleteSelected,
}) => {
    const [search, setSearch] = useLocalStorage('archive_search', '');
    const [isZipping, setIsZipping] = React.useState(false);

    const handleBulkDownload = async () => {
        if (selectedIds.size === 0) return;

        setIsZipping(true);
        try {
            const zip = new JSZip();
            const selectedImages = images.filter(img => selectedIds.has(img.id));

            for (const img of selectedImages) {
                // Fetch the image data
                const response = await fetch(img.url);
                const blob = await response.blob();

                // Add to zip with a descriptive name
                const filename = `aura-${img.id}.png`;
                zip.file(filename, blob);
            }

            // Generate and download
            const content = await zip.generateAsync({ type: 'blob' });
            downloadBlob(content, `aura-collection-${new Date().getTime()}.zip`);
        } catch (error) {
            console.error('Failed to create ZIP:', error);
            // Could add a toast here if available in this view
        } finally {
            setIsZipping(false);
        }
    };

    const filteredImages = images.filter(img =>
        img.prompt.toLowerCase().includes(search.toLowerCase())
    );
    const filteredImageIds = filteredImages.map((image) => image.id);
    const allFilteredSelected = filteredImageIds.length > 0 && filteredImageIds.every((id) => selectedIds.has(id));

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
                            className={`aura-btn aura-btn--glass ${allFilteredSelected ? 'aura-btn--primary' : ''}`}
                            onClick={() => onToggleSelectAll(filteredImageIds)}
                            disabled={filteredImages.length === 0}
                        >
                            {allFilteredSelected ? 'Deselect All' : 'Select All'}
                        </button>
                        <div className="search-box glass-panel" style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}>
                            <Search size={18} className="search-icon" style={{ position: 'absolute', left: '1rem', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                placeholder="Search prompts..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="aura-input"
                                style={{ paddingLeft: '3rem' }}
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
                            onClick={() => onOpenImage(img)}
                            selected={selectedIds.has(img.id)}
                            onSelect={() => onToggleSelection(img.id)}
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
                        <button className="aura-btn aura-btn--glass" onClick={onClearSelection}>
                            <X size={18} /> Cancel
                        </button>
                        <button
                            className="aura-btn aura-btn--primary"
                            onClick={handleBulkDownload}
                            disabled={isZipping}
                        >
                            {isZipping ? <Loader2 size={18} className="spin" /> : <Download size={18} />}
                            {isZipping ? 'Generating ZIP...' : 'Download as ZIP'}
                        </button>
                        <button className="aura-btn aura-btn--danger" onClick={onDeleteSelected}>
                            <Trash2 size={18} /> Delete All
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ArchiveView;
