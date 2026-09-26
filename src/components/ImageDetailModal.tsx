/* eslint-disable react-refresh/only-export-components -- Image detail helpers share this module with the modal. */
import Modal from './Modal';
import React, { useState } from 'react';
import { X, Download, Edit2, Trash2, Calendar, Layout, Sparkles, Layers, ChevronRight, ChevronLeft, Copy, Check, Wand2, GitBranch, History, Star } from 'lucide-react';
import type { ArchiveImage } from '../db/types';
import { downloadArchiveImage } from '../download/download';
import { lineageStore } from '../lineage/LineageStore';
import { buildLineageCostLedger } from '../lineage/lineageCostLedger';
import { loadLineageTimeline, type LineageTimelineData } from '../lineage/loadLineageTimeline';
import { isEditorReplayable, isGenerateReplayable } from '../lineage/replayLineageStep';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { NANO_BANANA_PRO_IMAGE_MODEL, OPENAI_IMAGE_MODEL, OPENAI_SUNBURST_IMAGE_MODEL, QWEN_IMAGE_2_1_IMAGE_MODEL, FLUX_2_KLEIN_4B_IMAGE_MODEL, assertNever, isStoredImageModelSlug, getImageModelLabel, type StoredImageModelSlug } from '../utils/openaiModels';
import ActualParametersPanel from './ActualParametersPanel';
import CostSummaryPanel from './CostSummaryPanel';
import {
    buildActualParameterDetails,
    getRequestedArchiveParameters,
} from '../generate-session/actualParameters';

interface ImageDetailModalProps {
    image: ArchiveImage;
    images: ArchiveImage[];
    hasNext: boolean;
    hasPrevious: boolean;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onCreateSimilar: () => void;
    onToggleFavorite: () => void;
    onReplayGenerate: (stepId: string) => void;
    onReplayEditor: (stepId: string) => void;
    onForkFromStep: (stepId: string) => void;
    onNext: () => void;
    onPrevious: () => void;
}

const ImageDetailModal: React.FC<ImageDetailModalProps> = ({
    image, images, hasNext, hasPrevious, onClose, onEdit, onDelete, onCreateSimilar, onToggleFavorite, onReplayGenerate, onReplayEditor, onForkFromStep, onNext, onPrevious
}) => {
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState<string | null>(null);
    const [timeline, setTimeline] = useState<LineageTimelineData | null>(null);
    const [timelineLoading, setTimelineLoading] = useState(true);
    const [timelineError, setTimelineError] = useState(false);
    const [timelineRetry, setTimelineRetry] = useState(0);
    const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
    const [lineageCollapsed, setLineageCollapsed] = useLocalStorage('archive_detail_lineage_collapsed', false);

    const dateStr = new Date(image.timestamp).toLocaleString();
    const imageModel = isStoredImageModelSlug(image.model) ? image.model : OPENAI_IMAGE_MODEL;
    const modelLabel = getImageModelLabel(imageModel);
    const requestedParameters = getImageDetailRequestedParameters(imageModel, image);
    const actualParameterDetails = buildActualParameterDetails({
        actualParameters: image.actualParameters,
        requestedParameters: getRequestedArchiveParameters(image),
    });
    const detailCostLedger = resolveImageDetailCostLedger(image.costLedger, timeline?.entries ?? []);

    const copyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(image.prompt);
            setCopied(true);
            setCopyError(null);
        } catch {
            setCopyError('Could not copy. Select the prompt text to copy it manually.');
        }
    };

    const downloadImage = () => {
        downloadArchiveImage(image);
    };

    React.useEffect(() => {
        let cancelled = false;

        setTimelineLoading(true);
        setTimelineError(false);
        setTimeline(null);
        setSelectedStepId(null);
        setCopied(false);
        setCopyError(null);
        loadLineageTimeline(image.id, lineageStore)
            .then((nextTimeline) => {
                if (!cancelled) {
                    setTimeline(nextTimeline);
                    setSelectedStepId(nextTimeline.entries.at(-1)?.id ?? null);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setTimelineError(true);
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
    }, [image.id, timelineRetry]);

    const selectedEntry = timeline?.entries.find((entry) => entry.id === selectedStepId) ?? null;
    const selectedImage = selectedEntry ? images.find((entryImage) => entryImage.id === selectedEntry.archiveImageId) ?? null : null;
    const displayedImageUrl = selectedImage?.url ?? selectedEntry?.replayImageDataUrl ?? image.url;
    const displayedImageLabel = selectedEntry?.label ?? 'Current Image';
    const comparisonError = selectedEntry && !selectedImage && !selectedEntry.replayImageDataUrl
        ? 'Selected step image is no longer available locally.'
        : null;

    return (
        <Modal label="Image details" onClose={onClose}>
            <div className="modal-content" onKeyDown={(event) => {
                if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;
                if (event.key === 'ArrowRight') onNext();
                if (event.key === 'ArrowLeft') onPrevious();
            }}>
                <button className="modal-close" aria-label="Close image details" onClick={onClose}>
                    <X size={20} />
                </button>

                <div className="modal-main">
                    <div className="modal-image-viewport">
                        <span className="comparison-label single-image-label">{displayedImageLabel}</span>
                        <img src={displayedImageUrl} alt={selectedEntry?.summary ?? image.prompt} className="modal-image" />

                        {comparisonError && <div className="comparison-error">{comparisonError}</div>}



                        <button className="nav-arrow prev" disabled={!hasPrevious} onClick={onPrevious} title="Previous (Left Arrow)">
                            <ChevronLeft size={32} />
                        </button>
                        <button className="nav-arrow next" disabled={!hasNext} onClick={onNext} title="Next (Right Arrow)">
                            <ChevronRight size={32} />
                        </button>
                    </div>

                        <div className="image-detail-actions">
                            <button
                                className={`btn-ghost favorite-action ${image.favorite ? 'active' : ''}`}
                                onClick={onToggleFavorite}
                                aria-pressed={!!image.favorite}
                            >
                                <Star size={18} /> {image.favorite ? 'Favorited' : 'Favorite'}
                            </button>
                            <button className="btn-primary" onClick={downloadImage}>
                                <Download size={18} /> Download
                            </button>
                            <button className="btn-ghost" onClick={onEdit}>
                                <Edit2 size={18} /> Edit
                            </button>
                        </div>

                </div>

                <aside className="modal-sidebar">
                    <div className="sidebar-inner">
                        <header className="sidebar-header">
                            <h2>Image details</h2>
                        </header>

                        <div className="sidebar-section">
                            <label className="section-label">PROMPT</label>
                            <div className="prompt-container">
                                <p>{image.prompt}</p>
                                <button className="copy-btn" aria-label={copied ? 'Prompt copied' : 'Copy prompt'} onClick={copyPrompt}>
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
                                <span>{modelLabel}</span>
                            </div>
                            {requestedParameters.map(({ label, value, badge, Icon }) => (
                                <div className="info-cell" key={label}>
                                    <label><Icon size={12} /> {label}</label>
                                    <span className={badge ? 'status-badge' : undefined}>{value}</span>
                                </div>
                            ))}
                            {image.style && image.style !== 'none' && (
                                <div className="info-cell">
                                    <label><Wand2 size={12} /> STYLE</label>
                                    <span className="status-badge">{image.style}</span>
                                </div>
                            )}
                        </div>

                        <ActualParametersPanel details={actualParameterDetails} />
                        <CostSummaryPanel ledger={detailCostLedger} />

                        {image.references && image.references.length > 0 && (
                            <div className="sidebar-section">
                                <label className="section-label">REFERENCES</label>
                                <div className="reference-grid mini">
                                    {image.references.map((dataUrl, idx) => (
                                        <div key={idx} className="reference-preview mini">
                                            <img src={dataUrl} alt={`Reference ${idx + 1}`} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="sidebar-section">
                            <div className="lineage-header-row">
                                <button
                                    className="lineage-section-toggle"
                                    aria-expanded={!lineageCollapsed}
                                    onClick={() => setLineageCollapsed((current) => !current)}
                                    type="button"
                                >
                                    <label className="section-label" style={{ marginBottom: 0, cursor: 'pointer' }}>LINEAGE</label>
                                    <div className="lineage-header-actions">
                                        {timeline && timeline.entries.length > 0 && (
                                            <span className="status-badge lineage-badge">{timeline.entries.length} step{timeline.entries.length === 1 ? '' : 's'} in history</span>
                                        )}
                                        <ChevronRight size={16} className={lineageCollapsed ? '' : 'lineage-chevron-open'} />
                                    </div>
                                </button>
                            </div>

                            {lineageCollapsed ? (
                                <div className="lineage-empty">
                                    <History size={16} />
                                    <span>History hidden</span>
                                </div>
                            ) : timelineLoading ? (
                                <div className="lineage-empty">Loading history...</div>
                            ) : timelineError ? (
                                <div className="error-message" role="alert">Could not load history. <button className="inline-link" onClick={() => setTimelineRetry((retry) => retry + 1)}>Try again</button></div>
                            ) : timeline && timeline.entries.length > 0 ? (
                                <div className="lineage-panel">
                                    {timeline.parent && (
                                        <div className={`lineage-origin ${timeline.parent.missing ? 'missing' : ''}`}>
                                            <GitBranch size={14} />
                                            <span>From: {timeline.parent.label}</span>
                                        </div>
                                    )}

                                        <div className="lineage-list">
                                            {timeline.entries.map((entry) => (
                                            <article
                                                key={entry.id}
                                                className={`lineage-entry ${selectedStepId === entry.id ? 'selected' : ''}`}
                                                onClick={() => setSelectedStepId(entry.id)}
                                            >
                                                {entry.runLabel && <div className="lineage-run-label">{entry.runLabel}</div>}
                                                <div className="lineage-entry-header">
                                                    <button className="status-badge lineage-type lineage-select" type="button">{entry.label}</button>
                                                    {entry.imageModelLabel && <span className="lineage-time">{entry.imageModelLabel}</span>}
                                                    <span className="lineage-time">{new Date(entry.timestamp).toLocaleString()}</span>
                                                </div>
                                                <p className="lineage-summary">{entry.summary}</p>
                                                {entry.goalText && (
                                                    <div className="lineage-meta-block">
                                                        <strong>Goal</strong>
                                                        <p>{entry.goalText}</p>
                                                    </div>
                                                )}
                                                {(entry.iterationNumber !== null || entry.evaluatorScore !== null || entry.evaluatorFeedback.length > 0) && (
                                                    <div className="lineage-meta-block">
                                                        <strong>Autopilot</strong>
                                                        <p>
                                                            {entry.iterationNumber !== null && `Iteration ${entry.iterationNumber}`}
                                                            {entry.iterationNumber !== null && entry.evaluatorScore !== null && ' · '}
                                                            {entry.evaluatorScore !== null && `Score ${entry.evaluatorScore}`}
                                                        </p>
                                                        {entry.evaluatorFeedback.length > 0 && <p>{entry.evaluatorFeedback.join(' ')}</p>}
                                                    </div>
                                                )}
                                                <div className="lineage-actions-row">
                                                    {isGenerateReplayable(entry) && (
                                                        <button className="btn-ghost lineage-action-btn" type="button" onClick={(event) => {
                                                            event.stopPropagation();
                                                            onReplayGenerate(entry.id);
                                                        }}>Replay into Generate</button>
                                                    )}
                                                    {isEditorReplayable(entry) && (
                                                        <button className="btn-ghost lineage-action-btn" type="button" onClick={(event) => {
                                                            event.stopPropagation();
                                                            onReplayEditor(entry.id);
                                                        }}>Replay into Editor</button>
                                                    )}
                                                    <button className="btn-ghost lineage-action-btn" type="button" onClick={(event) => {
                                                        event.stopPropagation();
                                                        onForkFromStep(entry.id);
                                                    }}>Fork from this step</button>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="lineage-empty">
                                    <History size={16} />
                                    <span>No history recorded</span>
                                </div>
                            )}
                        </div>

                        <div className="sidebar-actions">
                            {copyError && <p role="alert" className="error-message">{copyError}</p>}
                            <button className="btn-amber" onClick={onCreateSimilar} style={{ width: '100%', padding: '1rem' }}>
                                <Wand2 size={18} /> Create Similar
                            </button>
                            <button className="btn-ghost" onClick={copyPrompt} style={{ width: '100%', padding: '1rem' }}>
                                {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? 'Copied' : 'Copy prompt'}
                            </button>
                            <div className="divider" style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '1rem 0' }} />
                            <button className="btn-ghost" onClick={onDelete} style={{ width: '100%', padding: '1rem' }}>
                                <Trash2 size={18} /> Delete Permanently
                            </button>
                        </div>
                    </div>
                </aside>
            </div>
        </Modal>
    );
};

export function getImageDetailRequestedParameters(model: StoredImageModelSlug, image: ArchiveImage) {
    switch (model) {
        case 'gpt-image-2':
        case OPENAI_SUNBURST_IMAGE_MODEL:
        case OPENAI_IMAGE_MODEL:
            return [
                { label: 'QUALITY', value: image.quality, badge: true, Icon: Layers },
                { label: 'SIZE', value: image.aspectRatio, badge: false, Icon: Layout },
                { label: 'BACKGROUND', value: image.background, badge: false, Icon: Layout },
            ];
        case NANO_BANANA_PRO_IMAGE_MODEL:
        case FLUX_2_KLEIN_4B_IMAGE_MODEL:
            return [
                { label: 'ASPECT', value: image.aspectRatio, badge: false, Icon: Layout },
                { label: 'RESOLUTION', value: image.quality, badge: true, Icon: Layers },
            ];
        case QWEN_IMAGE_2_1_IMAGE_MODEL:
            return [
                { label: 'ASPECT', value: image.aspectRatio, badge: false, Icon: Layout },
                { label: 'RESOLUTION', value: image.quality, badge: true, Icon: Layers },
                { label: 'BACKGROUND', value: image.background, badge: false, Icon: Layout },
            ];
        default: return assertNever(model);
    }
}

export function resolveImageDetailCostLedger(
    imageCostLedger: ArchiveImage['costLedger'],
    entries: LineageTimelineData['entries'],
) {
    return imageCostLedger ?? buildLineageCostLedger(entries);
}

export default ImageDetailModal;
