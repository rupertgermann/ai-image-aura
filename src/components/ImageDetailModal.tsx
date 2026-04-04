import React, { useState } from 'react';
import { X, Download, Edit2, Trash2, Calendar, Layout, Sparkles, Layers, ChevronRight, ChevronLeft, Copy, Check, Wand2, GitBranch, History } from 'lucide-react';
import type { ArchiveImage } from '../db/types';
import { downloadArchiveImage } from '../download/download';
import { lineageStore } from '../lineage/LineageStore';
import { loadLineageTimeline, type LineageTimelineData } from '../lineage/loadLineageTimeline';
import { isEditorReplayable, isGenerateReplayable } from '../lineage/replayLineageStep';

interface ImageDetailModalProps {
    image: ArchiveImage;
    images: ArchiveImage[];
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onCreateSimilar: () => void;
    onReplayGenerate: (stepId: string) => void;
    onReplayEditor: (stepId: string) => void;
    onForkFromStep: (stepId: string) => void;
    onNext: () => void;
    onPrevious: () => void;
}

const ImageDetailModal: React.FC<ImageDetailModalProps> = ({
    image, images, onClose, onEdit, onDelete, onCreateSimilar, onReplayGenerate, onReplayEditor, onForkFromStep, onNext, onPrevious
}) => {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [copied, setCopied] = useState(false);
    const [timeline, setTimeline] = useState<LineageTimelineData | null>(null);
    const [timelineLoading, setTimelineLoading] = useState(true);
    const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

    const dateStr = new Date(image.timestamp).toLocaleString();

    const copyPrompt = () => {
        navigator.clipboard.writeText(image.prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadImage = () => {
        downloadArchiveImage(image);
    };

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') onNext();
            if (e.key === 'ArrowLeft') onPrevious();
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onNext, onPrevious, onClose]);

    React.useEffect(() => {
        let cancelled = false;

        setTimelineLoading(true);
        loadLineageTimeline(image.id, lineageStore)
            .then((nextTimeline) => {
                if (!cancelled) {
                    setTimeline(nextTimeline);
                    setSelectedStepId(nextTimeline.entries[0]?.id ?? null);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setTimeline({
                        entries: [],
                        parent: null,
                        descendantCount: 0,
                    });
                    setSelectedStepId(null);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setTimelineLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [image.id]);

    const selectedEntry = timeline?.entries.find((entry) => entry.id === selectedStepId) ?? null;
    const comparisonImage = selectedEntry ? images.find((entryImage) => entryImage.id === selectedEntry.archiveImageId) ?? null : null;
    const comparisonError = selectedEntry && !comparisonImage
        ? 'Selected step image is no longer available locally.'
        : null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className={`modal-content glass-panel ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`} onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>
                    <X size={20} />
                </button>

                <div className="modal-main">
                    <div className="modal-image-viewport">
                        {selectedEntry && comparisonImage && comparisonImage.id !== image.id ? (
                            <div className="comparison-view">
                                <div className="comparison-pane">
                                    <span className="comparison-label">Selected Step</span>
                                    <img src={comparisonImage.url} alt={selectedEntry.summary} className="modal-image comparison-image" />
                                </div>
                                <div className="comparison-pane">
                                    <span className="comparison-label">Current Image</span>
                                    <img src={image.url} alt={image.prompt} className="modal-image comparison-image" />
                                </div>
                            </div>
                        ) : (
                            <img src={image.url} alt={image.prompt} className="modal-image" />
                        )}

                        {comparisonError && <div className="comparison-error glass-panel">{comparisonError}</div>}

                        <div className="floating-actions">
                            <button className="aura-btn aura-btn--primary" onClick={downloadImage}>
                                <Download size={18} /> Download
                            </button>
                            <button className="aura-btn aura-btn--glass" onClick={onEdit}>
                                <Edit2 size={18} /> Edit
                            </button>
                        </div>

                        <button className="nav-arrow prev" onClick={onPrevious} title="Previous (Left Arrow)">
                            <ChevronLeft size={32} />
                        </button>
                        <button className="nav-arrow next" onClick={onNext} title="Next (Right Arrow)">
                            <ChevronRight size={32} />
                        </button>
                    </div>

                    <button
                        className="sidebar-toggle"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        title={sidebarOpen ? "Hide Studio Info" : "Show Studio Info"}
                    >
                        {sidebarOpen ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                    </button>
                </div>

                <aside className="modal-sidebar">
                    <div className="sidebar-inner">
                        <header className="sidebar-header">
                            <h2 className="gradient-text">Studio Info</h2>
                        </header>

                        <div className="sidebar-section">
                            <label className="section-label">PROMPT</label>
                            <div className="prompt-container glass-inset">
                                <p>{image.prompt}</p>
                                <button className="copy-btn" onClick={copyPrompt}>
                                    {copied ? <Check size={14} className="success-icon" /> : <Copy size={14} />}
                                </button>
                            </div>
                        </div>

                        <div className="sidebar-grid">
                            <div className="info-cell">
                                <label><Calendar size={12} /> CREATED</label>
                                <span>{dateStr}</span>
                            </div>
                            <div className="info-cell">
                                <label><Sparkles size={12} /> MODEL</label>
                                <span>{image.model || 'gpt-image-1.5'}</span>
                            </div>
                            <div className="info-cell">
                                <label><Layers size={12} /> QUALITY</label>
                                <span className="status-badge">{image.quality}</span>
                            </div>
                            <div className="info-cell">
                                <label><Layout size={12} /> SIZE</label>
                                <span>{image.aspectRatio}</span>
                            </div>
                            {image.style && image.style !== 'none' && (
                                <div className="info-cell">
                                    <label><Wand2 size={12} /> STYLE</label>
                                    <span className="status-badge">{image.style}</span>
                                </div>
                            )}
                        </div>

                        {image.references && image.references.length > 0 && (
                            <div className="sidebar-section">
                                <label className="section-label">REFERENCES</label>
                                <div className="reference-grid mini">
                                    {image.references.map((dataUrl, idx) => (
                                        <div key={idx} className="reference-preview mini glass-panel">
                                            <img src={dataUrl} alt={`Reference ${idx + 1}`} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="sidebar-section">
                            <div className="lineage-header-row">
                                <label className="section-label" style={{ marginBottom: 0 }}>LINEAGE</label>
                                {timeline && timeline.descendantCount > 0 && (
                                    <span className="status-badge lineage-badge">{timeline.descendantCount} version{timeline.descendantCount === 1 ? '' : 's'} from this image</span>
                                )}
                            </div>

                            {timelineLoading ? (
                                <div className="lineage-empty glass-inset">Loading history...</div>
                            ) : timeline && timeline.entries.length > 0 ? (
                                <div className="lineage-panel glass-inset">
                                    {timeline.parent && (
                                        <div className={`lineage-origin ${timeline.parent.missing ? 'missing' : ''}`}>
                                            <GitBranch size={14} />
                                            <span>From: {timeline.parent.label}</span>
                                        </div>
                                    )}

                                    <div className="lineage-list">
                                        {timeline.entries.map((entry) => (
                                            <article key={entry.id} className={`lineage-entry ${selectedStepId === entry.id ? 'selected' : ''}`}>
                                                <div className="lineage-entry-header">
                                                    <button className="status-badge lineage-type lineage-select" onClick={() => setSelectedStepId(entry.id)}>{entry.label}</button>
                                                    <span className="lineage-time">{new Date(entry.timestamp).toLocaleString()}</span>
                                                </div>
                                                <p className="lineage-summary">{entry.summary}</p>
                                                <div className="lineage-actions-row">
                                                    {isGenerateReplayable(entry) && (
                                                        <button className="aura-btn aura-btn--glass lineage-action-btn" onClick={() => onReplayGenerate(entry.id)}>Replay into Generate</button>
                                                    )}
                                                    {isEditorReplayable(entry) && (
                                                        <button className="aura-btn aura-btn--glass lineage-action-btn" onClick={() => onReplayEditor(entry.id)}>Replay into Editor</button>
                                                    )}
                                                    <button className="aura-btn aura-btn--glass lineage-action-btn" onClick={() => onForkFromStep(entry.id)}>Fork from this step</button>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="lineage-empty glass-inset">
                                    <History size={16} />
                                    <span>No history recorded</span>
                                </div>
                            )}
                        </div>

                        <div className="sidebar-actions">
                            <button className="aura-btn aura-btn--primary" onClick={onCreateSimilar} style={{ width: '100%', padding: '1rem' }}>
                                <Wand2 size={18} /> Create Similar
                            </button>
                            <button className="aura-btn aura-btn--glass" onClick={copyPrompt} style={{ width: '100%', padding: '1rem' }}>
                                <Copy size={18} /> Copy Prompt
                            </button>
                            <div className="divider" style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '1rem 0' }} />
                            <button className="aura-btn aura-btn--danger" onClick={onDelete} style={{ width: '100%', padding: '1rem' }}>
                                <Trash2 size={18} /> Delete Permanently
                            </button>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default ImageDetailModal;
