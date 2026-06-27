import React from 'react';
import type { ApiCostLedger, ApiCostLineItem } from '../db/types';
import { calculateApiCostTotals, formatUsd } from '../costs/apiCost';

interface CostSummaryPanelProps {
    ledger?: ApiCostLedger;
    compact?: boolean;
    showBreakdown?: boolean;
}

const CostSummaryPanel: React.FC<CostSummaryPanelProps> = ({
    ledger,
    compact = false,
    showBreakdown = true,
}) => {
    if (!hasApiCostLedger(ledger)) {
        return null;
    }

    const totals = calculateApiCostTotals(ledger);
    const hasReasoningCosts = ledger.items.some((item) => item.kind === 'reasoning');
    const showSeparateTotals = hasReasoningCosts && !compact;

    return (
        <div className={`cost-summary-panel${compact ? ' compact' : ''}`}>
            <label className="section-label">API Cost</label>

            <div className="cost-total-list">
                {showSeparateTotals && (
                    <CostTotalRow
                        label="Image generation"
                        amountUsd={totals.imageGenerationTotalUsd}
                        unavailableLabel={getUnavailableLabel(ledger.items.filter((item) => item.kind !== 'reasoning'))}
                    />
                )}
                <CostTotalRow
                    label={showSeparateTotals ? 'Autopilot API total' : 'Total'}
                    amountUsd={totals.totalUsd}
                    unavailableLabel={totals.status === 'unavailable' ? 'Unavailable' : totals.status === 'partial' ? 'Partial' : undefined}
                />
            </div>

            {!compact && showBreakdown && (
                <div className="cost-breakdown-list">
                    {ledger.items.map((item) => (
                        <div key={item.id} className={`cost-line-item ${item.status}`}>
                            <span>{item.label}</span>
                            <strong>{formatLineItemCost(item)}</strong>
                            {item.note && <small>{item.note}</small>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

function CostTotalRow({
    label,
    amountUsd,
    unavailableLabel,
}: {
    label: string;
    amountUsd?: number;
    unavailableLabel?: string;
}) {
    return (
        <div className="cost-total-row">
            <span>{label}</span>
            <strong>{typeof amountUsd === 'number' ? formatUsd(amountUsd) : unavailableLabel ?? 'Unavailable'}</strong>
        </div>
    );
}

export function hasApiCostLedger(ledger?: ApiCostLedger | null): ledger is ApiCostLedger {
    return Boolean(ledger && Array.isArray(ledger.items) && ledger.items.length > 0);
}

export function getApiCostSummaryLabel(ledger?: ApiCostLedger | null): string | null {
    if (!hasApiCostLedger(ledger)) {
        return null;
    }

    const totals = calculateApiCostTotals(ledger);
    if (typeof totals.totalUsd === 'number') {
        return formatUsd(totals.totalUsd);
    }

    return 'Cost unavailable';
}

function formatLineItemCost(item: ApiCostLineItem) {
    return item.status === 'calculated' && typeof item.amountUsd === 'number'
        ? formatUsd(item.amountUsd)
        : 'Unavailable';
}

function getUnavailableLabel(items: ApiCostLineItem[]) {
    if (items.length === 0) {
        return undefined;
    }

    return items.every((item) => item.status === 'unavailable') ? 'Unavailable' : 'Partial';
}

export default CostSummaryPanel;
