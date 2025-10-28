import { Transaction } from '../cgt/types';
import { BaseCSVParser } from './base-parser';
import { ParserOptions } from './types';

/**
 * Required columns for raw CSV format
 */
const REQUIRED_FIELDS = [
    'date',
    'type',
    'asset',
    'quantity',
    'price',
    'currency',
    'exchangeRate',
    'fee',
];

/**
 * Raw CSV row interface
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
 * Parser for raw CSV format optimized for this application
 *
 * Expected CSV columns:
 * - date: ISO8601 date string (e.g., 2024-01-15 or 2024-01-15T10:30:00Z)
 * - type: BUY or SELL
 * - asset: Asset identifier (e.g., ticker symbol)
 * - quantity: Number of shares/units
 * - price: Price per unit in transaction currency
 * - currency: Currency code (e.g., USD, GBP, EUR)
 * - exchangeRate: Exchange rate to GBP (1.0 if already in GBP)
 * - fee: Transaction fee in transaction currency
 */
export class RawCSVParser extends BaseCSVParser {
    constructor(options: ParserOptions = {}) {
        super(options);
    }

    /**
     * Parse raw CSV content into transactions
     *
     * @param csvContent - Raw CSV string content
     * @returns Promise resolving to array of transactions
     * @throws Error on first validation failure with row number and field context
     */
    async parse(csvContent: string): Promise<Transaction[]> {
        // Parse CSV
        const parseResult = this.parseCSV<RawCSVRow>(csvContent);

        // Check for parsing errors
        if (parseResult.errors.length > 0) {
            const firstError = parseResult.errors[0];
            throw new Error(`CSV parsing error at row ${firstError.row}: ${firstError.message}`);
        }

        // Validate required fields are present
        if (parseResult.meta.fields) {
            this.validateRequiredFields(parseResult.meta.fields, REQUIRED_FIELDS);
        }

        // If no data rows, return empty array
        if (!parseResult.data || parseResult.data.length === 0) {
            return [];
        }

        // Parse each row into a transaction
        const transactions: Transaction[] = [];

        for (let i = 0; i < parseResult.data.length; i++) {
            const row = parseResult.data[i];
            const rowNum = i + 1; // 1-indexed, excluding header

            try {
                const transaction = this.parseRow(row, rowNum);
                transactions.push(transaction);
            } catch (error) {
                // Re-throw with context if not already formatted
                if (error instanceof Error) {
                    throw error;
                }
                throw new Error(`Row ${rowNum}: Unknown error during parsing`);
            }
        }

        return transactions;
    }

    /**
     * Parse a single CSV row into a Transaction object
     *
     * @param row - Raw CSV row data
     * @param rowNum - Row number for error reporting (1-indexed)
     * @returns Transaction object
     * @throws Error if any validation fails
     */
    private parseRow(row: RawCSVRow, rowNum: number): Transaction {
        // Validate and parse each field
        const date = this.parseDate(row.date, rowNum);
        const type = this.validateTransactionType(row.type, rowNum);
        const asset = this.validateAsset(row.asset, rowNum);
        const quantity = this.parseDecimal(row.quantity, 'quantity', rowNum);
        const price = this.parseDecimal(row.price, 'price', rowNum);
        const currency = this.validateCurrency(row.currency, rowNum);
        const exchangeRate = this.parseDecimal(row.exchangeRate, 'exchangeRate', rowNum);
        const fee = this.parseDecimal(row.fee, 'fee', rowNum);

        // Additional validation: exchange rate should be positive
        if (exchangeRate.lessThanOrEqualTo(0)) {
            throw new Error(
                `Row ${rowNum}: exchangeRate must be greater than 0, got ${exchangeRate.toString()}`
            );
        }

        return {
            date,
            type,
            asset,
            quantity,
            price,
            currency,
            exchangeRate,
            fee,
        };
    }
}
