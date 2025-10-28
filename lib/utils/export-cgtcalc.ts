import { Transaction } from '../cgt/types';

/**
 * Convert transactions to CGTCalc.com format
 *
 * Format (space-separated):
 * 1. B/S (buy/sell)
 * 2. dd/mm/yyyy date
 * 3. Asset name (1 word, underscores for spaces)
 * 4. Number of shares
 * 5. Share price
 * 6. Costs/fees
 * 7. Stamp duty (optional, default 0.5% for buys)
 * 8. U for unquoted/AIM/OFEX (optional)
 */
export function transactionsToCGTCalcFormat(transactions: Transaction[]): string {
    const lines: string[] = [];

    for (const txn of transactions) {
        const type = txn.type === 'BUY' ? 'B' : 'S';
        const date = txn.date.toFormat('dd/MM/yyyy');
        const asset = txn.asset.replace(/\s+/g, '_');
        const quantity = txn.quantity.toFixed(4);

        // Price in GBP (convert if needed)
        const priceGBP = txn.price.times(txn.exchangeRate).toFixed(2);

        // Costs/fees in GBP
        const costsGBP = txn.fee.times(txn.exchangeRate).toFixed(2);

        // Stamp duty: 0 for all (let the other calculator apply default 0.5% for buys)
        const stampDuty = '0';

        // U for unquoted - set 'U' for OEIC funds (no ticker), blank for ETFs
        // OEICs are typically unquoted unit trusts
        const isUnquoted = !txn.asset.match(/^[A-Z]{3,5}$/) ? 'U' : '';

        const line = [type, date, asset, quantity, priceGBP, costsGBP, stampDuty, isUnquoted]
            .filter((f) => f !== '') // Remove empty trailing fields
            .join(' ');

        lines.push(line);
    }

    return lines.join('\n');
}

/**
 * Trigger a browser download of the CGTCalc format file
 */
export function downloadCGTCalcFormat(
    content: string,
    filename: string = `transactions-cgtcalc-${new Date().toISOString().split('T')[0]}.txt`
) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
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
