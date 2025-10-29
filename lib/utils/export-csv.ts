import { DisposalResult } from '../cgt/types';
import { isInTaxYear } from './tax-year';

/**
 * Row structure for the CGT results CSV export
 */
export interface CGTResultRow {
    date: string;
    asset: string;
    assetFullName?: string;
    quantitySold: string;
    proceedsGBP: string;
    costBasisGBP: string;
    gainLossGBP: string;
}

/**
 * Convert CGT calculation results to CSV format for a specific tax year
 * Shows one row per disposal (aggregated across all match types)
 * Only includes disposals within the specified tax year
 */
export function resultsToCSV(
    resultsByAsset: Map<string, { disposals: DisposalResult[] }>,
    taxYear?: string
): string {
    const rows: CGTResultRow[] = [];

    // Loop through all assets
    for (const [asset, result] of resultsByAsset) {
        // Loop through each disposal for this asset
        for (const disposal of result.disposals) {
            // Filter by tax year if specified
            if (taxYear && !isInTaxYear(disposal.disposal.date, taxYear)) {
                continue;
            }

            // Aggregate disposal (not broken down by match type)
            rows.push({
                date: disposal.disposal.date.toISODate() || '',
                asset,
                assetFullName: disposal.disposal.assetFullName,
                quantitySold: disposal.disposal.quantity.toFixed(4),
                proceedsGBP: disposal.totalProceedsGBP.toFixed(2),
                costBasisGBP: disposal.totalCostBasisGBP.toFixed(2),
                gainLossGBP: disposal.totalGainLossGBP.toFixed(2),
            });
        }
    }

    // Build CSV string
    const headers = [
        'Date',
        'Asset',
        'Quantity Sold',
        'Proceeds (GBP)',
        'Cost Basis (GBP)',
        'Gain/Loss (GBP)',
    ];

    const csvLines = [headers.join(',')];

    for (const row of rows) {
        // Use full name if available, otherwise use identifier
        const assetName = row.assetFullName || row.asset;

        // Escape asset name if it contains commas
        const escapedAssetName = assetName.includes(',') ? `"${assetName}"` : assetName;

        const line = [
            row.date,
            escapedAssetName,
            row.quantitySold,
            row.proceedsGBP,
            row.costBasisGBP,
            row.gainLossGBP,
        ].join(',');
        csvLines.push(line);
    }

    return csvLines.join('\n');
}

/**
 * Trigger a browser download of the CSV file
 */
export function downloadCSV(
    csvContent: string,
    filename: string = `cgt-results-${new Date().toISOString().split('T')[0]}.csv`
) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}
