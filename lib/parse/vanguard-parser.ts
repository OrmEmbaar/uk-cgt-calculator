import { DateTime } from 'luxon';
import Decimal from 'decimal.js';
import { Transaction } from '../cgt/types';
import { BaseCSVParser } from './base-parser';
import { ParserOptions } from './types';

/**
 * Vanguard-specific parser options
 */
export interface VanguardParserOptions extends ParserOptions {
    /** Currency code (default: 'GBP') */
    currency?: string;
    /** Exchange rate to GBP (default: 1.0) */
    exchangeRate?: string | number;
}

/**
 * Vanguard CSV row interface
 */
interface VanguardRow {
    Date: string;
    Details: string;
    Amount: string;
    Balance: string;
}

/**
 * Parsed transaction details from Details column
 */
interface TransactionDetails {
    type: 'BUY' | 'SELL';
    quantity: string;
    assetName: string;
}

/**
 * Parser for Vanguard transaction export CSV format
 *
 * Expected CSV columns:
 * - Date: DD/MM/YYYY format
 * - Details: Transaction description
 * - Amount: Transaction amount (negative for buys, positive for sells)
 * - Balance: Account balance after transaction
 *
 * Handles:
 * - OEIC transactions (e.g., "Bought 7.6876 FTSE Developed Europe ex-U.K. Equity Index Fund")
 * - ETF transactions with tickers (e.g., "Bought 64 S&P 500 UCITS ETF (VUSA)")
 * - Fee matching to same-day transactions
 * - Skips non-transaction rows (deposits, dividends, interest, etc.)
 */
export class VanguardParser extends BaseCSVParser {
    private currency: string;
    private exchangeRate: Decimal;

    private static readonly BUY_REGEX = /^Bought\s+([\d.,]+)\s+(.+)$/;
    private static readonly SELL_REGEX = /^Sold\s+([\d.,]+)\s+(.+)$/;
    private static readonly TICKER_REGEX = /\(([A-Z]{3,5})\)$/;
    private static readonly DATE_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    private static readonly FEE_REGEX = /fee/i;

    /**
     * Fund name patterns for matching despite character encoding or rebranding
     * Each pattern checks for key identifying words to handle encoding issues
     */
    private static readonly FUND_PATTERNS: Array<{
        test: (name: string) => boolean;
        identifier: string;
    }> = [
        // Sterling Short-Term Money Market fund (handles rebranding and encoding issues)
        {
            test: (name) =>
                name.includes('Short-Term Money Market') &&
                (name.includes('Vanguard') || name.includes('Sterling')),
            identifier: 'STERLING_SHORT-TERM_MONEY_MARKET',
        },
    ];

    constructor(options: VanguardParserOptions = {}) {
        super(options);
        this.currency = options.currency || 'GBP';
        this.exchangeRate = new Decimal(options.exchangeRate || 1.0);
    }

    /**
     * Parse Vanguard CSV content into transactions
     */
    async parse(csvContent: string): Promise<Transaction[]> {
        const parseResult = this.parseCSV<VanguardRow>(csvContent);

        if (parseResult.errors.length > 0) {
            const firstError = parseResult.errors[0];
            throw new Error(`CSV parsing error at row ${firstError.row}: ${firstError.message}`);
        }

        // Validate required fields
        const requiredFields = ['Date', 'Details', 'Amount', 'Balance'];
        if (parseResult.meta.fields) {
            this.validateRequiredFields(parseResult.meta.fields, requiredFields);
        }

        if (!parseResult.data || parseResult.data.length === 0) {
            return [];
        }

        const transactions: Transaction[] = [];

        // Build a list of all rows with their parsed information
        interface ParsedRow {
            date: DateTime;
            dateKey: string;
            asset: string;
            details: any;
            amount: Decimal;
            quantity: Decimal;
            price: Decimal;
            isFee: boolean;
            feeAmount?: Decimal;
        }

        const parsedRows: ParsedRow[] = [];

        // First pass: parse all rows
        for (let i = 0; i < parseResult.data.length; i++) {
            const row = parseResult.data[i];
            const rowNum = i + 1;

            try {
                const date = this.parseDateDDMMYYYY(row.Date, rowNum);
                const dateKey = date.toISODate() || '';

                // Check if it's a fee row
                if (this.isFeeRow(row.Details)) {
                    const feeAmount = this.parseAmount(row.Amount, rowNum);

                    // Try to extract asset identifier from fee description
                    let assetForFee = '';
                    const tickerMatch = row.Details.match(VanguardParser.TICKER_REGEX);
                    if (tickerMatch) {
                        assetForFee = tickerMatch[1];
                    } else {
                        for (const pattern of VanguardParser.FUND_PATTERNS) {
                            if (pattern.test(row.Details)) {
                                assetForFee = pattern.identifier;
                                break;
                            }
                        }
                    }

                    parsedRows.push({
                        date,
                        dateKey,
                        asset: assetForFee,
                        details: null,
                        amount: new Decimal(0),
                        quantity: new Decimal(0),
                        price: new Decimal(0),
                        isFee: true,
                        feeAmount,
                    });
                    continue;
                }

                // Try to extract transaction details
                const details = this.extractTransactionDetails(row.Details);
                if (!details) {
                    continue; // Not a buy/sell
                }

                const amount = this.parseAmount(row.Amount, rowNum);
                const quantity = this.parseDecimal(details.quantity, 'quantity', rowNum);
                const price = amount.div(quantity);
                const asset = this.extractAssetIdentifier(details.assetName);

                parsedRows.push({
                    date,
                    dateKey,
                    asset,
                    details,
                    amount,
                    quantity,
                    price,
                    isFee: false,
                });
            } catch (error) {
                if (error instanceof Error) {
                    throw error;
                }
                throw new Error(`Row ${i + 1}: Unknown error during parsing`);
            }
        }

        // Second pass: match fees to transactions and create Transaction objects
        for (const parsedRow of parsedRows) {
            if (parsedRow.isFee) continue; // Skip fee rows

            // Find matching fee: same date and same asset (or same date if asset unknown)
            let fee = new Decimal(0);
            for (const feeRow of parsedRows) {
                if (feeRow.isFee && feeRow.dateKey === parsedRow.dateKey && feeRow.feeAmount) {
                    // Match by asset if fee has asset identifier, otherwise match by date only
                    if (!feeRow.asset || feeRow.asset === parsedRow.asset) {
                        fee = fee.plus(feeRow.feeAmount);
                    }
                }
            }

            // Create transaction
            const transaction: Transaction = {
                date: parsedRow.date,
                type: parsedRow.details.type,
                asset: parsedRow.asset,
                quantity: parsedRow.quantity,
                price: parsedRow.price,
                currency: this.currency,
                exchangeRate: this.exchangeRate,
                fee,
            };

            transactions.push(transaction);
        }

        return transactions;
    }

    /**
     * Parse date in DD/MM/YYYY format
     */
    private parseDateDDMMYYYY(dateStr: string, rowNum: number): DateTime {
        if (!dateStr || dateStr.trim() === '') {
            throw new Error(`Row ${rowNum}: Date field is empty`);
        }

        const match = dateStr.trim().match(VanguardParser.DATE_REGEX);
        if (!match) {
            throw new Error(
                `Row ${rowNum}: Invalid date format "${dateStr}". Expected DD/MM/YYYY format`
            );
        }

        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);

        const date = DateTime.fromObject({ year, month, day }, { zone: this.timezone });

        if (!date.isValid) {
            throw new Error(`Row ${rowNum}: Invalid date "${dateStr}". ${date.invalidReason}`);
        }

        return date;
    }

    /**
     * Parse amount string (may include commas, may be negative)
     * Returns absolute value as Decimal
     */
    private parseAmount(amountStr: string, rowNum: number): Decimal {
        if (!amountStr || amountStr.trim() === '') {
            throw new Error(`Row ${rowNum}: Amount field is empty`);
        }

        // Remove commas and quotes
        const cleaned = amountStr.trim().replace(/,/g, '').replace(/"/g, '');

        try {
            const amount = new Decimal(cleaned);
            // Return absolute value (buys are negative in CSV)
            return amount.abs();
        } catch {
            throw new Error(`Row ${rowNum}: Invalid amount "${amountStr}"`);
        }
    }

    /**
     * Extract transaction details from Details column
     */
    private extractTransactionDetails(details: string): TransactionDetails | null {
        const trimmed = details.trim();

        // Check for buy transaction
        const buyMatch = trimmed.match(VanguardParser.BUY_REGEX);
        if (buyMatch) {
            return {
                type: 'BUY',
                quantity: buyMatch[1].replace(/,/g, ''), // Remove commas from quantity
                assetName: buyMatch[2],
            };
        }

        // Check for sell transaction
        const sellMatch = trimmed.match(VanguardParser.SELL_REGEX);
        if (sellMatch) {
            return {
                type: 'SELL',
                quantity: sellMatch[1].replace(/,/g, ''),
                assetName: sellMatch[2],
            };
        }

        return null;
    }

    /**
     * Extract asset identifier from asset name
     * For ETFs: extract ticker from parentheses (e.g., "VUSA" from "S&P 500 UCITS ETF (VUSA)")
     * For OEICs: generate short identifier from fund name
     * Handles known fund name changes and character encoding issues via pattern matching
     */
    private extractAssetIdentifier(assetName: string): string {
        // Check if this matches any known fund pattern (handles rebranding & encoding issues)
        for (const pattern of VanguardParser.FUND_PATTERNS) {
            if (pattern.test(assetName)) {
                return pattern.identifier;
            }
        }

        // Try to extract ETF ticker
        const tickerMatch = assetName.match(VanguardParser.TICKER_REGEX);
        if (tickerMatch) {
            return tickerMatch[1];
        }

        // For OEIC, generate identifier from fund name
        // Remove common words and patterns
        const cleaned = assetName
            // Remove patterns like "ex-U.K.", "ex-Japan"
            .replace(/\s+ex-U\.K\./gi, '')
            .replace(/\s+ex-[A-Za-z]+/gi, '')
            // Remove common fund words
            .replace(
                /\s+(Index|Fund|Accumulation|Distributing|Unit Trust|Stock|Equity|Vanguard|Funds|PLC)\b/gi,
                ''
            )
            // Remove standalone hyphens and clean up
            .replace(/\s+-\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Split into words (preserving hyphens within words) and take first 3 significant ones
        let identifier = cleaned
            .split(/\s+/)
            .filter((word) => word.length > 0 && word !== '-')
            .slice(0, 3) // Take first 3 significant words
            .join('_')
            .toUpperCase();

        // If identifier is too short or empty, use original name (trimmed)
        if (identifier.length < 3) {
            identifier = assetName.replace(/\s+/g, '_').substring(0, 30).toUpperCase();
        }

        return identifier;
    }

    /**
     * Check if row is a fee row
     */
    private isFeeRow(details: string): boolean {
        return VanguardParser.FEE_REGEX.test(details);
    }
}
