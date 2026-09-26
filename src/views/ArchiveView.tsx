import React from 'react';
import ImageCard from '../components/ImageCard';
import type { ArchiveImage } from '../db/types';
import { Image as ImageIcon, Search, Download, Trash2, X, Loader2, Star } from 'lucide-react';

interface ArchiveViewProps {
    images: ArchiveImage[];
    filteredImages: ArchiveImage[];
    search: string;
    onSearchChange: (value: string) => void;
    favoritesOnly: boolean;
    onFavoritesOnlyChange: (value: boolean) => void;
    loading: boolean;
    error: Error | null;
    onRetry: () => void;
    onOpenGenerate: () => void;
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
    images, filteredImages, search, onSearchChange, favoritesOnly, onFavoritesOnlyChange,
    loading, error, onRetry, onOpenGenerate,
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
    const [isZipping, setIsZipping] = React.useState(false);

    const handleBulkDownload = async () => {
        if (selectedIds.size === 0) return;

        setIsZipping(true);
        try {
            const { downloadArchiveImagesAsZip } = await import('../archive/ArchiveExport');
            await downloadArchiveImagesAsZip(images.filter((image) => selectedIds.has(image.id)));
        } catch (error) {
            onBulkDownloadError(error instanceof Error ? error : new Error('Failed to create ZIP archive'));
        } finally {
            setIsZipping(false);
        }
    };

    const filteredImageIds = filteredImages.map((image) => image.id);
    const allFilteredSelected = filteredImageIds.length > 0 && filteredImageIds.every((id) => selectedIds.has(id));
    const hiddenSelectedCount = selectedIds.size - filteredImageIds.filter((id) => selectedIds.has(id)).length;

    return (
        <div className="archive-container">
            <header className="view-header">
                <div className="header-flex">
                    <div>
                        <h1>Archive</h1>
                        <p>{images.length === 0 ? '0 images' : `${filteredImages.length} of ${images.length} image${images.length === 1 ? '' : 's'}`}</p>
                    </div>
                    <div className="header-actions archive-toolbar">
                        <button
                            className="btn-ghost"
                            onClick={() => onToggleSelectAll(filteredImageIds)}
                            disabled={filteredImages.length === 0}
                        >
                            {allFilteredSelected ? 'Deselect All' : 'Select All'}
                        </button>
                        <button
                            className={`btn-ghost archive-filter-toggle ${favoritesOnly ? 'active' : ''}`}
                            onClick={() => onFavoritesOnlyChange(!favoritesOnly)}
                            aria-pressed={favoritesOnly}
                            title={favoritesOnly ? 'Show all archive images' : 'Show favorites only'}
                        >
                            <Star size={18} />
                            Favorites
                        </button>
                        <div className="search-box archive-search-box glass-panel">
                            <Search size={18} className="search-icon archive-search-icon" />
                            <input
                                type="search"
                                aria-label="Search archive prompts"
                                placeholder="Search prompts…"
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="aura-input"
                            />
                        </div>
                    </div>
                </div>
            </header>

            {error && <div className="error-message" role="alert">{error.message} <button className="inline-link" onClick={onRetry}>Try again</button></div>}
            {loading && images.length === 0 ? (
                <div className="empty-state" role="status"><Loader2 className="spin" size={28} /><p>Loading your archive…</p></div>
            ) : error && images.length === 0 ? null : images.length === 0 ? (
                <div className="empty-archive">
                    <div className="empty-state glass-panel">
                        <ImageIcon size={48} className="dim-icon" />
                        <h3>No Images Yet</h3>
                        <p>Save a generated image to start your collection.</p>
                        <button className="btn-primary" onClick={onOpenGenerate}>Create an image</button>
                    </div>
                </div>
            ) : filteredImages.length === 0 ? (
                <div className="empty-archive">
                    <div className="empty-state glass-panel">
                        <Search size={48} className="dim-icon" />
                        <h3>No Matches</h3>
                        <p>No archived images match the current filters.</p>
                        <button className="btn-ghost" onClick={() => { onSearchChange(''); onFavoritesOnlyChange(false); }}>
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
                        <span>{selectedIds.size === 1 ? 'image selected' : 'images selected'}</span>
                        {hiddenSelectedCount > 0 && <span>({hiddenSelectedCount} hidden by filters)</span>}
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
                        <button className="btn-ghost" onClick={onDeleteSelected}>
                            <Trash2 size={18} /> Delete selected
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ArchiveView;
