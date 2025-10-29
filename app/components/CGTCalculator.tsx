'use client';

import { useState, useCallback, useMemo } from 'react';
import Decimal from 'decimal.js';
import { RawCSVParser } from '@/lib/parse/raw-parser';
import { VanguardParser } from '@/lib/parse/vanguard-parser';
import { calculateCGTMultipleAssets } from '@/lib/cgt/calculator';
import { Transaction, CGTCalculationResult } from '@/lib/cgt/types';
import ResultsTable from './ResultsTable';
import TaxYearSummary from './TaxYearSummary';
import { resultsToCSV, downloadCSV } from '@/lib/utils/export-csv';
import { transactionsToCGTCalcFormat, downloadCGTCalcFormat } from '@/lib/utils/export-cgtcalc';
import { getUniqueTaxYears, isInTaxYear } from '@/lib/utils/tax-year';
import { detectCSVFormat, CSVFormat } from '@/lib/utils/detect-parser';

export default function CGTCalculator() {
    const [detectedFormat, setDetectedFormat] = useState<CSVFormat | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [results, setResults] = useState<Map<string, CGTCalculationResult> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [fileName, setFileName] = useState<string>('');
    const [selectedTaxYear, setSelectedTaxYear] = useState<string>('');
    const [showPreview, setShowPreview] = useState(false);

    const handleFileUpload = useCallback(async (file: File) => {
        setError(null);
        setIsProcessing(true);
        setFileName(file.name);

        try {
            const csvContent = await file.text();

            // Auto-detect CSV format
            const format = detectCSVFormat(csvContent);
            setDetectedFormat(format);

            if (format === 'unknown') {
                throw new Error(
                    'Unable to detect CSV format. Expected either Raw CSV (with columns: date, type, asset, quantity, price, currency, exchangeRate, fee) or Vanguard format (with columns: Date, Details, Amount, Balance).'
                );
            }

            // Parse CSV based on detected format
            let parsedTransactions: Transaction[];
            if (format === 'raw') {
                const parser = new RawCSVParser();
                parsedTransactions = await parser.parse(csvContent);
            } else {
                const parser = new VanguardParser();
                parsedTransactions = await parser.parse(csvContent);
            }

            setTransactions(parsedTransactions);
            setShowPreview(true); // Show preview for user confirmation
            setResults(null); // Clear any previous results
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
            setTransactions([]);
            setResults(null);
            setSelectedTaxYear('');
            setShowPreview(false);
            setDetectedFormat(null);
        } finally {
            setIsProcessing(false);
        }
    }, []);

    const handleCalculateCGT = useCallback(() => {
        if (transactions.length === 0) return;

        setIsProcessing(true);
        setError(null);

        try {
            // Calculate CGT
            const cgtResults = calculateCGTMultipleAssets(transactions);
            setResults(cgtResults);

            // Set the selected tax year to the most recent one
            const disposalDates = [];
            for (const result of cgtResults.values()) {
                for (const disposal of result.disposals) {
                    disposalDates.push(disposal.disposal.date);
                }
            }
            const taxYears = getUniqueTaxYears(disposalDates);
            if (taxYears.length > 0) {
                setSelectedTaxYear(taxYears[0]); // Most recent first
            }
            setShowPreview(false); // Hide preview, show results
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
            setResults(null);
        } finally {
            setIsProcessing(false);
        }
    }, [transactions]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileUpload(file);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type === 'text/csv') {
            handleFileUpload(file);
        } else {
            setError('Please upload a valid CSV file');
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    // Compute available tax years from results
    const availableTaxYears = useMemo(() => {
        if (!results) return [];
        const disposalDates = [];
        for (const result of results.values()) {
            for (const disposal of result.disposals) {
                disposalDates.push(disposal.disposal.date);
            }
        }
        return getUniqueTaxYears(disposalDates);
    }, [results]);

    // Filter results by selected tax year for summary calculations
    const filteredResultsByTaxYear = useMemo(() => {
        if (!results || !selectedTaxYear) return null;

        const filtered = new Map<string, CGTCalculationResult>();

        for (const [asset, result] of results) {
            // Filter disposals for this tax year
            const filteredDisposals = result.disposals.filter((disposal) =>
                isInTaxYear(disposal.disposal.date, selectedTaxYear)
            );

            if (filteredDisposals.length === 0) continue;

            // Recalculate totals for filtered disposals
            let totalGains = new Decimal(0);
            let totalLosses = new Decimal(0);

            for (const disposal of filteredDisposals) {
                if (disposal.totalGainLossGBP.greaterThan(0)) {
                    totalGains = totalGains.plus(disposal.totalGainLossGBP);
                } else {
                    totalLosses = totalLosses.plus(disposal.totalGainLossGBP.abs());
                }
            }

            filtered.set(asset, {
                disposals: filteredDisposals,
                finalPoolState: result.finalPoolState, // Keep the final state from full calculation
                totalGains,
                totalLosses,
                netGainLoss: totalGains.minus(totalLosses),
            });
        }

        return filtered;
    }, [results, selectedTaxYear]);

    const handleDownloadCSV = () => {
        if (!results || !selectedTaxYear) return;
        const csvContent = resultsToCSV(results, selectedTaxYear);
        const filename = `cgt-results-${selectedTaxYear.replace('/', '-')}.csv`;
        downloadCSV(csvContent, filename);
    };

    const handleDownloadCGTCalcFormat = () => {
        if (transactions.length === 0) return;
        const content = transactionsToCGTCalcFormat(transactions);
        downloadCGTCalcFormat(content);
    };

    return (
        <div className="w-full space-y-6">
            <div className="space-y-4">
                <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    UK CGT Calculator
                </h1>
                <p className="text-lg text-zinc-600 dark:text-zinc-400">
                    Upload your transaction CSV to calculate capital gains tax with HMRC-compliant rules
                </p>
            </div>

            {/* Upload Form - Hidden when transactions are loaded */}
            {transactions.length === 0 && (
                <>
                    {/* File Upload Area */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        className="relative rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 p-12 text-center transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
                    >
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            disabled={isProcessing}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            id="file-upload"
                        />
                        <div className="space-y-2">
                            <svg
                                className="mx-auto h-12 w-12 text-zinc-400"
                                stroke="currentColor"
                                fill="none"
                                viewBox="0 0 48 48"
                                aria-hidden="true"
                            >
                                <path
                                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            <div className="text-sm text-zinc-600 dark:text-zinc-400">
                                <label
                                    htmlFor="file-upload"
                                    className="cursor-pointer font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
                                >
                                    Upload a file
                                </label>{' '}
                                or drag and drop
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-500">CSV files only</p>
                        </div>
                    </div>
                </>
            )}

            {/* Processing State */}
            {isProcessing && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                    Processing {fileName}...
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    <p className="font-semibold">Error</p>
                    <p className="mt-1">{error}</p>
                </div>
            )}

            {/* Transaction Preview */}
            {showPreview && transactions.length > 0 && (
                <div className="space-y-4">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
                        <h3 className="mb-2 font-semibold text-blue-900 dark:text-blue-100">
                            Preview Parsed Transactions
                        </h3>
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                            Detected format:{' '}
                            <span className="font-semibold">
                                {detectedFormat === 'raw' ? 'Raw CSV' : 'Vanguard'}
                            </span>
                            {' · '}
                            Found {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                            . Please review the parsed data below and click &ldquo;Calculate CGT&rdquo;
                            to proceed.
                        </p>
                    </div>

                    {/* Summary of assets */}
                    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
                        <h4 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                            Assets Found
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {Array.from(
                                new Map(
                                    transactions.map((t) => [t.asset, t.assetFullName || t.asset])
                                ).entries()
                            ).map(([asset, fullName]) => (
                                <span
                                    key={asset}
                                    className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                >
                                    {fullName}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Transactions table preview */}
                    <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3">Asset</th>
                                    <th className="px-4 py-3 text-right">Quantity</th>
                                    <th className="px-4 py-3 text-right">Price</th>
                                    <th className="px-4 py-3">Currency</th>
                                    <th className="px-4 py-3 text-right">Fee</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map((t, idx) => (
                                    <tr
                                        key={idx}
                                        className="border-b border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:hover:bg-zinc-900"
                                    >
                                        <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100">
                                            {t.date.toISODate()}
                                        </td>
                                        <td className="px-4 py-2">
                                            <span
                                                className={`rounded px-2 py-1 text-xs font-semibold ${
                                                    t.type === 'BUY'
                                                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                                }`}
                                            >
                                                {t.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                                            {t.assetFullName || t.asset}
                                        </td>
                                        <td className="px-4 py-2 text-right font-mono text-zinc-700 dark:text-zinc-300">
                                            {t.quantity.toFixed(4)}
                                        </td>
                                        <td className="px-4 py-2 text-right font-mono text-zinc-700 dark:text-zinc-300">
                                            {t.price.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-2 font-mono text-zinc-600 dark:text-zinc-400">
                                            {t.currency}
                                        </td>
                                        <td className="px-4 py-2 text-right font-mono text-zinc-700 dark:text-zinc-300">
                                            {t.fee.toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Action buttons */}
                    <div className="flex justify-between">
                        <button
                            onClick={handleDownloadCGTCalcFormat}
                            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                            Export for Testing
                        </button>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setTransactions([]);
                                    setShowPreview(false);
                                    setDetectedFormat(null);
                                    setFileName('');
                                }}
                                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCalculateCGT}
                                disabled={isProcessing}
                                className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                            >
                                {isProcessing ? 'Calculating...' : 'Calculate CGT'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Results Display */}
            {results && transactions.length > 0 && availableTaxYears.length > 0 && (
                <div className="space-y-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                                Calculation Results
                            </h2>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}{' '}
                                processed across {results.size} asset{results.size !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Tax Year Selector */}
                            <div className="flex items-center gap-2">
                                <label
                                    htmlFor="tax-year"
                                    className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                                >
                                    Tax Year:
                                </label>
                                <select
                                    id="tax-year"
                                    value={selectedTaxYear}
                                    onChange={(e) => setSelectedTaxYear(e.target.value)}
                                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                >
                                    {availableTaxYears.map((year) => (
                                        <option key={year} value={year}>
                                            {year}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={handleDownloadCSV}
                                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                            >
                                Download CSV
                            </button>
                        </div>
                    </div>

                    {/* Tax Year Summary */}
                    {filteredResultsByTaxYear && filteredResultsByTaxYear.size > 0 && (
                        <TaxYearSummary
                            resultsByAsset={filteredResultsByTaxYear}
                            taxYear={selectedTaxYear}
                        />
                    )}

                    {/* Detailed Results Table */}
                    <div>
                        <h3 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                            Detailed Transactions
                        </h3>
                        <ResultsTable resultsByAsset={results} taxYear={selectedTaxYear} />
                    </div>
                </div>
            )}
        </div>
    );
}
