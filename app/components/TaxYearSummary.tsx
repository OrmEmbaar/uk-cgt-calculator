import { CGTCalculationResult } from '@/lib/cgt/types';
import Decimal from 'decimal.js';

interface TaxYearSummaryProps {
    resultsByAsset: Map<string, CGTCalculationResult>;
    taxYear: string;
}

/**
 * Display summary statistics for a tax year
 * Shows both overall totals and per-asset breakdown
 */
export default function TaxYearSummary({ resultsByAsset, taxYear }: TaxYearSummaryProps) {
    // Calculate overall totals
    let overallGains = new Decimal(0);
    let overallLosses = new Decimal(0);

    for (const result of resultsByAsset.values()) {
        overallGains = overallGains.plus(result.totalGains);
        overallLosses = overallLosses.plus(result.totalLosses);
    }

    const overallNet = overallGains.minus(overallLosses);

    return (
        <div className="space-y-4">
            {/* Overall Summary Card */}
            <div className="rounded-lg border-2 border-zinc-300 bg-gradient-to-br from-zinc-50 to-zinc-100 p-6 dark:border-zinc-700 dark:from-zinc-900 dark:to-zinc-800">
                <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    Tax Year {taxYear} - Overall Summary
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-lg bg-white p-4 dark:bg-black">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            Total Gains
                        </div>
                        <div className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
                            £{overallGains.toFixed(2)}
                        </div>
                    </div>
                    <div className="rounded-lg bg-white p-4 dark:bg-black">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            Total Losses
                        </div>
                        <div className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
                            £{overallLosses.toFixed(2)}
                        </div>
                    </div>
                    <div className="rounded-lg bg-white p-4 dark:bg-black">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            Net Gain/Loss
                        </div>
                        <div
                            className={`mt-1 text-2xl font-bold ${
                                overallNet.greaterThan(0)
                                    ? 'text-green-600 dark:text-green-400'
                                    : overallNet.lessThan(0)
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-zinc-700 dark:text-zinc-300'
                            }`}
                        >
                            £{overallNet.toFixed(2)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Per-Asset Breakdown */}
            {resultsByAsset.size > 1 && (
                <div>
                    <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                        Breakdown by Asset
                    </h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {Array.from(resultsByAsset.entries()).map(([asset, result]) => (
                            <div
                                key={asset}
                                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black"
                            >
                                <h4 className="mb-3 font-mono text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                    {asset}
                                </h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-zinc-600 dark:text-zinc-400">Gains:</span>
                                        <span className="font-mono font-medium text-green-600 dark:text-green-400">
                                            £{result.totalGains.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-600 dark:text-zinc-400">Losses:</span>
                                        <span className="font-mono font-medium text-red-600 dark:text-red-400">
                                            £{result.totalLosses.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between border-t border-zinc-200 pt-2 dark:border-zinc-800">
                                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                            Net:
                                        </span>
                                        <span
                                            className={`font-mono font-semibold ${
                                                result.netGainLoss.greaterThan(0)
                                                    ? 'text-green-600 dark:text-green-400'
                                                    : result.netGainLoss.lessThan(0)
                                                    ? 'text-red-600 dark:text-red-400'
                                                    : 'text-zinc-700 dark:text-zinc-300'
                                            }`}
                                        >
                                            £{result.netGainLoss.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                        {result.disposals.length} disposal
                                        {result.disposals.length !== 1 ? 's' : ''}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
