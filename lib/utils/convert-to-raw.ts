import { Transaction } from '../cgt/types';
import Papa from 'papaparse';

/**
 * Raw CSV row format
 */
interface RawCSVRow {
    date: string;
    type: string;
    asset: string;
    quantity: string;
    price: string;
    currency: string;
    exchangeRate: string;
    fee: string;
}

/**
 * Convert transactions to raw CSV format
 * This allows combining transactions from different brokers into a single CSV
 *
 * @param transactions - Array of transactions to convert
 * @returns CSV string in raw format
 */
export function transactionsToRawCSV(transactions: Transaction[]): string {
    // If no transactions, return just headers
    if (transactions.length === 0) {
        return 'date,type,asset,quantity,price,currency,exchangeRate,fee';
    }

    const rows: RawCSVRow[] = transactions.map((t) => ({
        date: t.date.toISO() || '',
        type: t.type,
        asset: t.asset,
        quantity: t.quantity.toString(),
        price: t.price.toString(),
        currency: t.currency,
        exchangeRate: t.exchangeRate.toString(),
        fee: t.fee.toString(),
    }));

    return Papa.unparse(rows, {
        header: true,
        columns: ['date', 'type', 'asset', 'quantity', 'price', 'currency', 'exchangeRate', 'fee'],
    });
}

/**
 * Download transactions as raw CSV file
 *
 * @param transactions - Array of transactions to export
 * @param filename - Optional filename (defaults to 'transactions.csv')
 */
export function downloadRawCSV(transactions: Transaction[], filename: string = 'transactions.csv') {
    const csvContent = transactionsToRawCSV(transactions);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Combine multiple transaction arrays and convert to raw CSV
 * Useful for merging transactions from different brokers
 *
 * @param transactionArrays - Arrays of transactions to combine
 * @returns CSV string in raw format with all transactions
 */
export function combineToRawCSV(...transactionArrays: Transaction[][]): string {
    const allTransactions = transactionArrays.flat();

    // Sort by date for consistency
    allTransactions.sort((a, b) => {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return 0;
    });

    return transactionsToRawCSV(allTransactions);
}
