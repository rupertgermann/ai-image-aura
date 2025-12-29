import React, { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface ReferenceImageModalProps {
    imageUrl: string;
    onClose: () => void;
    onNext?: () => void;
    onPrevious?: () => void;
    hasNext: boolean;
    hasPrevious: boolean;
}

const ReferenceImageModal: React.FC<ReferenceImageModalProps> = ({
    imageUrl,
    onClose,
    onNext,
    onPrevious,
    hasNext,
    hasPrevious
}) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight' && hasNext && onNext) onNext();
            if (e.key === 'ArrowLeft' && hasPrevious && onPrevious) onPrevious();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNext, onPrevious, hasNext, hasPrevious]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel reference-modal" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>
                    <X size={20} />
                </button>

                <div className="modal-main centered-image">
                    <div className="modal-image-viewport">
                        <img src={imageUrl} alt="Reference" className="modal-image reference-full-image" />

                        {(hasPrevious && onPrevious) && (
                            <button className="nav-arrow prev" onClick={onPrevious} title="Previous">
                                <ChevronLeft size={32} />
                            </button>
                        )}

                        {(hasNext && onNext) && (
                            <button className="nav-arrow next" onClick={onNext} title="Next">
                                <ChevronRight size={32} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <style>{`
                .reference-modal {
                    max-width: 90vw;
                    max-height: 90vh;
                    width: auto;
                    height: auto;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 0;
                    overflow: hidden;
                }
                .centered-image {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    width: 100%;
                    height: 100%;
                }
                .reference-full-image {
                    max-width: 100%;
                    max-height: 85vh;
                    object-fit: contain;
                    border-radius: 8px;
                }
            `}</style>
        </div>
    );
};

export default ReferenceImageModal;
