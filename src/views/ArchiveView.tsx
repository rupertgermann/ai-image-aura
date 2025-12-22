import React from 'react';
import ImageCard from '../components/ImageCard';
import type { ArchiveImage } from '../db/types';
import { Image as ImageIcon, Search } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface ArchiveViewProps {
    images: ArchiveImage[];
    onDeleteImage: (id: string) => void;
    onEditImage: (image: ArchiveImage) => void;
    onSelectImage: (image: ArchiveImage) => void;
}

const ArchiveView: React.FC<ArchiveViewProps> = ({ images, onDeleteImage, onEditImage, onSelectImage }) => {
    const [search, setSearch] = useLocalStorage('archive_search', '');

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
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default ArchiveView;
