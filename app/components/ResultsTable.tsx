import { DisposalResult } from '@/lib/cgt/types';
import { isInTaxYear } from '@/lib/utils/tax-year';

interface DisposalRow {
    date: string;
    asset: string;
    assetFullName?: string;
    quantitySold: string;
    proceedsGBP: string;
    costBasisGBP: string;
    gainLossGBP: string;
}

interface ResultsTableProps {
    resultsByAsset: Map<string, { disposals: DisposalResult[] }>;
    taxYear?: string;
}

/**
 * Display CGT calculation results in a table format
 * Shows one row per disposal (aggregated across all match types)
 * Optionally filtered by tax year
 */
export default function ResultsTable({ resultsByAsset, taxYear }: ResultsTableProps) {
    // Transform results into table rows (one per disposal)
    const rows: DisposalRow[] = [];

    for (const [asset, result] of resultsByAsset) {
        for (const disposal of result.disposals) {
            // Filter by tax year if specified
            if (taxYear && !isInTaxYear(disposal.disposal.date, taxYear)) {
                continue;
            }

            // Aggregate the disposal (not broken down by match type)
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

    // Sort by date, then asset
    rows.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.asset.localeCompare(b.asset);
    });

    if (rows.length === 0) {
        return (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                No disposals found in the uploaded file.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Asset</th>
                        <th className="px-4 py-3 text-right">Quantity Sold</th>
                        <th className="px-4 py-3 text-right">Proceeds (GBP)</th>
                        <th className="px-4 py-3 text-right">Cost Basis (GBP)</th>
                        <th className="px-4 py-3 text-right">Gain/Loss (GBP)</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => {
                        const gainLoss = parseFloat(row.gainLossGBP);
                        const isGain = gainLoss > 0;
                        const isLoss = gainLoss < 0;

                        return (
                            <tr
                                key={index}
                                className="border-b border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:hover:bg-zinc-900"
                            >
                                <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                                    {row.date}
                                </td>
                                <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                                    {row.assetFullName || row.asset}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-zinc-700 dark:text-zinc-300">
                                    {row.quantitySold}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-zinc-700 dark:text-zinc-300">
                                    £{row.proceedsGBP}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-zinc-700 dark:text-zinc-300">
                                    £{row.costBasisGBP}
                                </td>
                                <td
                                    className={`px-4 py-3 text-right font-mono font-semibold ${
                                        isGain
                                            ? 'text-green-600 dark:text-green-400'
                                            : isLoss
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-zinc-700 dark:text-zinc-300'
                                    }`}
                                >
                                    £{row.gainLossGBP}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
