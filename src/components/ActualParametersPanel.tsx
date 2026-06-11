import React from 'react';
import {
    hasActualParameterDetails,
    type ActualParameterDetails,
} from '../generate-session/actualParameters';

interface ActualParametersPanelProps {
    details: ActualParameterDetails;
    compact?: boolean;
}

const ActualParametersPanel: React.FC<ActualParametersPanelProps> = ({ details, compact = false }) => {
    if (!hasActualParameterDetails(details)) {
        return null;
    }

    return (
        <div className={`actual-parameters-panel${compact ? ' compact' : ''}`}>
            <label className="section-label">Actual Parameters</label>

            {details.rows.length > 0 && (
                <dl className="actual-parameter-list">
                    {details.rows.map((row) => (
                        <div key={row.label} className={`actual-parameter-row${row.changed ? ' changed' : ''}`}>
                            <dt>{row.label}</dt>
                            <dd>
                                <span>
                                    <small>Requested</small>
                                    <strong>{row.requested ?? 'Not set'}</strong>
                                </span>
                                <span>
                                    <small>Actual</small>
                                    <strong>{row.actual}</strong>
                                </span>
                                {row.changed && <em>Changed</em>}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}

            {details.elapsedLabel && (
                <div className="actual-parameter-elapsed">
                    <span>Elapsed</span>
                    <strong>{details.elapsedLabel}</strong>
                </div>
            )}

            {details.revisedPrompt && (
                <div className="actual-parameter-prompt">
                    <span>Rewritten Prompt</span>
                    <p>{details.revisedPrompt}</p>
                </div>
            )}
        </div>
    );
};

export default ActualParametersPanel;
