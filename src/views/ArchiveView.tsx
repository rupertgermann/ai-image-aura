import React from 'react';
import { downloadArchiveImagesAsZip } from '../archive/ArchiveExport';
import ImageCard from '../components/ImageCard';
import type { ArchiveImage } from '../db/types';
import { Image as ImageIcon, Search, Download, Trash2, X, Loader2, Star } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { filterArchiveImages } from '../hooks/useImageArchive';

interface ArchiveViewProps {
    images: ArchiveImage[];
    selectedIds: Set<string>;
    onDeleteImage: (id: string) => void;
    onEditImage: (image: ArchiveImage) => void;
    onOpenImage: (image: ArchiveImage) => void;
    onToggleFavorite: (image: ArchiveImage) => void;
    onToggleSelection: (id: string) => void;
    onToggleSelectAll: (ids: string[]) => void;
    onClearSelection: () => void;
    onDeleteSelected: () => void;
    onBulkDownloadError: (error: Error) => void;
}

const ArchiveView: React.FC<ArchiveViewProps> = ({
    images,
    selectedIds,
    onDeleteImage,
    onEditImage,
    onOpenImage,
    onToggleFavorite,
    onToggleSelection,
    onToggleSelectAll,
    onClearSelection,
    onDeleteSelected,
    onBulkDownloadError,
}) => {
    const [search, setSearch] = useLocalStorage('archive_search', '');
    const [favoritesOnly, setFavoritesOnly] = useLocalStorage('archive_favorites_only', false);
    const [isZipping, setIsZipping] = React.useState(false);

    const handleBulkDownload = async () => {
        if (selectedIds.size === 0) return;

        setIsZipping(true);
        try {
            await downloadArchiveImagesAsZip(images.filter((image) => selectedIds.has(image.id)));
        } catch (error) {
            onBulkDownloadError(error instanceof Error ? error : new Error('Failed to create ZIP archive'));
        } finally {
            setIsZipping(false);
        }
    };

    const filteredImages = filterArchiveImages(images, { search, favoritesOnly });
    const filteredImageIds = filteredImages.map((image) => image.id);
    const allFilteredSelected = filteredImageIds.length > 0 && filteredImageIds.every((id) => selectedIds.has(id));

    return (
        <div className="archive-container">
            <header className="view-header">
                <div className="header-flex">
                    <div>
                        <h1>Archive</h1>
                        <p>Your creative collection across time.</p>
                    </div>
                    <div className="header-actions">
                        <button
                            className="btn-ghost"
                            onClick={() => onToggleSelectAll(filteredImageIds)}
                            disabled={filteredImages.length === 0}
                        >
                            {allFilteredSelected ? 'Deselect All' : 'Select All'}
                        </button>
                        <button
                            className={`btn-ghost archive-filter-toggle ${favoritesOnly ? 'active' : ''}`}
                            onClick={() => setFavoritesOnly((current) => !current)}
                            aria-pressed={favoritesOnly}
                            title={favoritesOnly ? 'Show all archive images' : 'Show favorites only'}
                        >
                            <Star size={18} />
                            Favorites
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
            ) : filteredImages.length === 0 ? (
                <div className="empty-archive">
                    <div className="empty-state glass-panel">
                        <Search size={48} className="dim-icon" />
                        <h3>No Matches</h3>
                        <p>No archived images match the current filters.</p>
                        <button className="btn-ghost" onClick={() => { setSearch(''); setFavoritesOnly(false); }}>
                            <X size={18} /> Clear Filters
                        </button>
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
                            onToggleFavorite={onToggleFavorite}
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
                        <button className="btn-ghost" onClick={onClearSelection}>
                            <X size={18} /> Cancel
                        </button>
                        <button
                            className="btn-primary"
                            onClick={handleBulkDownload}
                            disabled={isZipping}
                        >
                            {isZipping ? <Loader2 size={18} className="spin" /> : <Download size={18} />}
                            {isZipping ? 'Generating ZIP...' : 'Download as ZIP'}
                        </button>
                        <button className="btn-amber" onClick={onDeleteSelected}>
                            <Trash2 size={18} /> Delete All
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ArchiveView;
