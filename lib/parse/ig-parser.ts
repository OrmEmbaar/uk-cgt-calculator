import { DateTime } from 'luxon';
import Decimal from 'decimal.js';
import { Transaction } from '../cgt/types';
import { BaseCSVParser } from './base-parser';
import { ParserOptions } from './types';

/**
 * IG CSV row interface
 */
interface IGRow {
    TextDate: string;
    Time: string;
    Activity: string;
    Market: string;
    Direction: string;
    Quantity: string;
    Price: string;
    Currency: string;
    Consideration: string; // Total transaction value (used to calculate price)
    Commission: string;
    Charges: string;
    'Cost/Proceeds': string;
    'Conversion rate': string;
    'Order type': string;
    'Venue ID': string;
    'Settled?': string;
    'Settlement date': string;
    'Order ID': string;
}

/**
 * Parser for IG broker transaction export CSV format
 *
 * Expected CSV columns:
 * - TextDate: DD-MM-YYYY format
 * - Time: HH:MM:SS format
 * - Activity: Transaction type (filter for "TRADE")
 * - Market: Full market/asset name
 * - Direction: BUY or SELL
 * - Quantity: Number of shares/units (may be signed)
 * - Consideration: Total transaction value in currency (used to calculate price)
 * - Currency: Currency code (e.g., USD, GBP, EUR)
 * - Commission: Commission fee in transaction currency (may be negative)
 * - Charges: Additional charges in transaction currency (may be negative)
 * - Conversion rate: Exchange rate to GBP
 *
 * Handles:
 * - Combined date and time parsing (DD-MM-YYYY + HH:MM:SS)
 * - Price calculation from Consideration/Quantity (handles pence-traded securities)
 * - Total fee calculation (Commission + Charges, with absolute values)
 * - Filtering of non-TRADE activities
 * - Signed quantities (uses absolute value)
 */
export class IGParser extends BaseCSVParser {
    private static readonly DATE_REGEX = /^(\d{2})-(\d{2})-(\d{4})$/;
    private static readonly TIME_REGEX = /^(\d{2}):(\d{2}):(\d{2})$/;

    constructor(options: ParserOptions = {}) {
        super(options);
    }

    /**
     * Parse IG CSV content into transactions
     */
    async parse(csvContent: string): Promise<Transaction[]> {
        const parseResult = this.parseCSV<IGRow>(csvContent);

        if (parseResult.errors.length > 0) {
            const firstError = parseResult.errors[0];
            throw new Error(`CSV parsing error at row ${firstError.row}: ${firstError.message}`);
        }

        // Validate required fields
        const requiredFields = [
            'TextDate',
            'Time',
            'Activity',
            'Market',
            'Direction',
            'Quantity',
            'Currency',
            'Consideration',
            'Commission',
            'Charges',
            'Conversion rate',
        ];
        if (parseResult.meta.fields) {
            this.validateRequiredFields(parseResult.meta.fields, requiredFields);
        }

        if (!parseResult.data || parseResult.data.length === 0) {
            return [];
        }

        const transactions: Transaction[] = [];

        for (let i = 0; i < parseResult.data.length; i++) {
            const row = parseResult.data[i];
            const rowNum = i + 1;

            try {
                // Skip non-TRADE activities
                if (row.Activity?.trim().toUpperCase() !== 'TRADE') {
                    continue;
                }

                const transaction = this.parseRow(row, rowNum);
                transactions.push(transaction);
            } catch (error) {
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
     */
    private parseRow(row: IGRow, rowNum: number): Transaction {
        // Parse date and time
        const date = this.parseDateAndTime(row.TextDate, row.Time, rowNum);

        // Validate and parse direction (BUY/SELL)
        const type = this.validateTransactionType(row.Direction, rowNum);

        // Validate asset
        const asset = this.validateAsset(row.Market, rowNum);

        // Parse quantity (use absolute value as it may be signed)
        const quantityStr = row.Quantity?.trim() || '';
        if (!quantityStr) {
            throw new Error(`Row ${rowNum}: Quantity field is empty`);
        }
        let quantity: Decimal;
        try {
            quantity = new Decimal(quantityStr).abs();
            if (quantity.isNaN() || quantity.lessThanOrEqualTo(0)) {
                throw new Error(`Row ${rowNum}: Quantity must be a positive number: "${row.Quantity}"`);
            }
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('Row')) {
                throw error;
            }
            throw new Error(`Row ${rowNum}: quantity is not a valid number: "${row.Quantity}"`);
        }

        // Calculate price from Consideration / Quantity instead of using Price column directly
        // This is necessary because IG doesn't indicate in the Currency column whether securities
        // are traded in pence (GBp) or pounds (GBP). The Price column shows the raw price in pence
        // for pence-traded securities, but Consideration is always in the actual currency.
        // By calculating price from Consideration/Quantity, we automatically get the correct price
        // in the actual currency (pounds for GBP securities, regardless of trading unit).
        const consideration = this.parseConsideration(row.Consideration, rowNum);
        const price = consideration.div(quantity);

        // Validate currency
        const currency = this.validateCurrency(row.Currency, rowNum);

        // Parse exchange rate
        const exchangeRate = this.parseDecimal(row['Conversion rate'], 'Conversion rate', rowNum);
        if (exchangeRate.lessThanOrEqualTo(0)) {
            throw new Error(
                `Row ${rowNum}: Conversion rate must be greater than 0, got ${exchangeRate.toString()}`
            );
        }

        // Calculate total fee (Commission + Charges)
        // Note: IG CSV uses negative values for fees (deductions), so we take absolute value
        const commission = this.parseDecimalAllowNegative(row.Commission, 'Commission', rowNum);
        const charges = this.parseDecimalAllowNegative(row.Charges, 'Charges', rowNum);
        const fee = commission.plus(charges);

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

    /**
     * Parse date and time from separate DD-MM-YYYY and HH:MM:SS fields
     */
    private parseDateAndTime(dateStr: string, timeStr: string, rowNum: number): DateTime {
        if (!dateStr || dateStr.trim() === '') {
            throw new Error(`Row ${rowNum}: TextDate field is empty`);
        }

        if (!timeStr || timeStr.trim() === '') {
            throw new Error(`Row ${rowNum}: Time field is empty`);
        }

        const dateMatch = dateStr.trim().match(IGParser.DATE_REGEX);
        if (!dateMatch) {
            throw new Error(
                `Row ${rowNum}: Invalid date format "${dateStr}". Expected DD-MM-YYYY format`
            );
        }

        const timeMatch = timeStr.trim().match(IGParser.TIME_REGEX);
        if (!timeMatch) {
            throw new Error(`Row ${rowNum}: Invalid time format "${timeStr}". Expected HH:MM:SS format`);
        }

        const day = parseInt(dateMatch[1], 10);
        const month = parseInt(dateMatch[2], 10);
        const year = parseInt(dateMatch[3], 10);

        const hour = parseInt(timeMatch[1], 10);
        const minute = parseInt(timeMatch[2], 10);
        const second = parseInt(timeMatch[3], 10);

        const dateTime = DateTime.fromObject(
            { year, month, day, hour, minute, second },
            { zone: this.timezone }
        );

        if (!dateTime.isValid) {
            throw new Error(
                `Row ${rowNum}: Invalid date/time "${dateStr} ${timeStr}". ${dateTime.invalidReason}`
            );
        }

        return dateTime;
    }

    /**
     * Parse consideration amount (absolute value)
     * Consideration is the total transaction value in the currency
     */
    private parseConsideration(value: string, rowNum: number): Decimal {
        if (!value || value.trim() === '') {
            throw new Error(`Row ${rowNum}: Consideration field is empty`);
        }

        try {
            const decimal = new Decimal(value.trim());

            if (decimal.isNaN()) {
                throw new Error(`Row ${rowNum}: Consideration is not a valid number: "${value}"`);
            }

            // Return absolute value (buys are negative in IG CSV)
            return decimal.abs();
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('Row')) {
                throw error;
            }
            throw new Error(`Row ${rowNum}: Consideration is not a valid number: "${value}"`);
        }
    }

    /**
     * Parse a decimal that may be negative (for fees)
     * Returns absolute value since negative fees in IG CSV indicate deductions
     */
    private parseDecimalAllowNegative(value: string, fieldName: string, rowNum: number): Decimal {
        if (!value || value.trim() === '') {
            // Empty fee field means zero fee
            return new Decimal(0);
        }

        try {
            const decimal = new Decimal(value.trim());

            if (decimal.isNaN()) {
                throw new Error(`Row ${rowNum}: ${fieldName} is not a valid number: "${value}"`);
            }

            // Return absolute value (IG uses negative values to indicate deductions)
            return decimal.abs();
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('Row')) {
                throw error;
            }
            throw new Error(`Row ${rowNum}: ${fieldName} is not a valid number: "${value}"`);
        }
    }
}
