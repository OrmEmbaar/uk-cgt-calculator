/**
 * Detect CSV format based on column headers
 */
export type CSVFormat = 'raw' | 'vanguard' | 'unknown';

/**
 * Detect which parser should be used for a CSV file
 *
 * @param csvContent - Raw CSV string
 * @returns Detected format type
 */
export function detectCSVFormat(csvContent: string): CSVFormat {
    // Get the first line (headers)
    const firstLineEnd = csvContent.indexOf('\n');
    const headerLine = firstLineEnd > 0 ? csvContent.substring(0, firstLineEnd) : csvContent;

    // Normalize: lowercase and remove whitespace
    const normalizedHeaders = headerLine.toLowerCase().replace(/\s+/g, '');

    // Vanguard format: Date,Details,Amount,Balance
    const hasVanguardHeaders =
        normalizedHeaders.includes('date') &&
        normalizedHeaders.includes('details') &&
        normalizedHeaders.includes('amount') &&
        normalizedHeaders.includes('balance');

    if (hasVanguardHeaders) {
        return 'vanguard';
    }

    // Raw CSV format: date,type,asset,quantity,price,currency,exchangeRate,fee
    const hasRawHeaders =
        normalizedHeaders.includes('date') &&
        normalizedHeaders.includes('type') &&
        normalizedHeaders.includes('asset') &&
        normalizedHeaders.includes('quantity') &&
        normalizedHeaders.includes('price') &&
        normalizedHeaders.includes('currency') &&
        normalizedHeaders.includes('exchangerate') &&
        normalizedHeaders.includes('fee');

    if (hasRawHeaders) {
        return 'raw';
    }

    return 'unknown';
}
