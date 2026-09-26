import Modal from './Modal';
import React from 'react';
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
    return (
        <Modal label="Reference preview" onClose={onClose}>
            <div className="modal-content reference-modal" onKeyDown={(event) => {
                if (event.key === 'ArrowRight' && hasNext) onNext?.();
                if (event.key === 'ArrowLeft' && hasPrevious) onPrevious?.();
            }}>
                <button className="modal-close" aria-label="Close reference preview" onClick={onClose}>
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
        </Modal>
    );
};

export default ReferenceImageModal;
