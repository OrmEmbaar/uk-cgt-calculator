import { DateTime } from 'luxon';
import Decimal from 'decimal.js';
import { Transaction } from '../cgt/types';
import { BaseCSVParser } from './base-parser';
import { ParserOptions } from './types';

/**
 * DeGiro CSV row interface
 * Note: DeGiro CSVs have unnamed columns for currencies, which PapaParse may name as empty strings
 */
interface DeGiroRow {
    Date: string;
    Time: string;
    Product: string;
    ISIN: string;
    Reference: string;
    Venue: string;
    Quantity: string;
    Price: string;
    'Exchange rate': string;
    'Transaction and/or third': string;
    'Order ID': string;
    [key: string]: string; // For unnamed currency columns
}

/**
 * Parser for DeGiro transaction export CSV format
 *
 * Expected CSV columns:
 * - Date: DD/MM/YYYY format
 * - Time: HH:MM format
 * - Product: Asset name
 * - ISIN: International Securities Identification Number
 * - Quantity: Number of shares (negative for sells, positive for buys)
 * - Price: Price per unit in local currency
 * - Exchange rate: Exchange rate to GBP
 * - Transaction and/or third: Transaction fee
 *
 * Handles:
 * - Combined date and time parsing (DD/MM/YYYY + HH:MM)
 * - Signed quantities (negative = sell, positive = buy)
 * - Unnamed currency columns in CSV
 */
export class DeGiroParser extends BaseCSVParser {
    private static readonly DATE_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    private static readonly TIME_REGEX = /^(\d{2}):(\d{2})$/;

    constructor(options: ParserOptions = {}) {
        super(options);
    }

    /**
     * Parse DeGiro CSV content into transactions
     */
    async parse(csvContent: string): Promise<Transaction[]> {
        const parseResult = this.parseCSV<DeGiroRow>(csvContent);

        if (parseResult.errors.length > 0) {
            const firstError = parseResult.errors[0];
            throw new Error(`CSV parsing error at row ${firstError.row}: ${firstError.message}`);
        }

        // Validate required fields
        const requiredFields = ['Date', 'Time', 'Product', 'Quantity', 'Price', 'Exchange rate'];
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
    private parseRow(row: DeGiroRow, rowNum: number): Transaction {
        // Parse date and time
        const date = this.parseDateAndTime(row.Date, row.Time, rowNum);

        // Determine transaction type from quantity sign
        const quantityStr = row.Quantity?.trim() || '';
        if (!quantityStr) {
            throw new Error(`Row ${rowNum}: Quantity field is empty`);
        }

        let quantity: Decimal;
        let type: 'BUY' | 'SELL';
        try {
            const rawQuantity = new Decimal(quantityStr);
            if (rawQuantity.isNaN()) {
                throw new Error(`Row ${rowNum}: Quantity is not a valid number: "${row.Quantity}"`);
            }

            // Check for zero before checking sign
            if (rawQuantity.isZero()) {
                throw new Error(`Row ${rowNum}: Quantity cannot be zero`);
            }

            // Negative = sell, positive = buy
            if (rawQuantity.isNegative()) {
                type = 'SELL';
                quantity = rawQuantity.abs();
            } else {
                type = 'BUY';
                quantity = rawQuantity;
            }
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('Row')) {
                throw error;
            }
            throw new Error(`Row ${rowNum}: Quantity is not a valid number: "${row.Quantity}"`);
        }

        // Validate asset (use Product name)
        const asset = this.validateAsset(row.Product, rowNum);

        // Parse price
        let price = this.parseDecimal(row.Price, 'Price', rowNum);

        // Extract currency from the row (it's in the unnamed column after Price)
        // We need to find the currency by looking at column values after Price
        let currency = this.extractCurrency(row, rowNum);

        // Parse exchange rate
        const exchangeRateStr = row['Exchange rate']?.trim() || '';
        let exchangeRate: Decimal;
        if (!exchangeRateStr) {
            // If no exchange rate, assume GBP (rate = 1.0)
            exchangeRate = new Decimal(1.0);
        } else {
            exchangeRate = this.parseDecimal(exchangeRateStr, 'Exchange rate', rowNum);
            if (exchangeRate.lessThanOrEqualTo(0)) {
                throw new Error(
                    `Row ${rowNum}: Exchange rate must be greater than 0, got ${exchangeRate.toString()}`
                );
            }
        }

        // Parse fee from "Transaction and/or third" column
        const feeStr = row['Transaction and/or third']?.trim() || '';
        let fee: Decimal;
        if (!feeStr) {
            fee = new Decimal(0);
        } else {
            try {
                fee = new Decimal(feeStr).abs(); // Use absolute value
                if (fee.isNaN()) {
                    fee = new Decimal(0);
                }
            } catch {
                fee = new Decimal(0);
            }
        }

        // Handle GBp (pence) - convert to GBP (pounds)
        // Check the original currency value before it was uppercased
        const originalCurrency = this.extractCurrencyOriginal(row, rowNum);
        if (originalCurrency === 'GBp') {
            // Convert pence to pounds (divide by 100)
            price = price.div(100);
            fee = fee.div(100);
            currency = 'GBP';
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

    /**
     * Parse date and time from separate DD/MM/YYYY and HH:MM fields
     */
    private parseDateAndTime(dateStr: string, timeStr: string, rowNum: number): DateTime {
        if (!dateStr || dateStr.trim() === '') {
            throw new Error(`Row ${rowNum}: Date field is empty`);
        }

        if (!timeStr || timeStr.trim() === '') {
            throw new Error(`Row ${rowNum}: Time field is empty`);
        }

        const dateMatch = dateStr.trim().match(DeGiroParser.DATE_REGEX);
        if (!dateMatch) {
            throw new Error(
                `Row ${rowNum}: Invalid date format "${dateStr}". Expected DD/MM/YYYY format`
            );
        }

        const timeMatch = timeStr.trim().match(DeGiroParser.TIME_REGEX);
        if (!timeMatch) {
            throw new Error(`Row ${rowNum}: Invalid time format "${timeStr}". Expected HH:MM format`);
        }

        const day = parseInt(dateMatch[1], 10);
        const month = parseInt(dateMatch[2], 10);
        const year = parseInt(dateMatch[3], 10);

        const hour = parseInt(timeMatch[1], 10);
        const minute = parseInt(timeMatch[2], 10);

        const dateTime = DateTime.fromObject(
            { year, month, day, hour, minute, second: 0 },
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
     * Extract currency from row (original case-preserved version)
     * Used to detect GBp (pence) vs GBP (pounds)
     */
    private extractCurrencyOriginal(row: DeGiroRow, rowNum: number): string {
        const entries = Object.entries(row);
        let foundPrice = false;

        for (const [key, value] of entries) {
            if (key === 'Price') {
                foundPrice = true;
                continue;
            }

            if (foundPrice && value && /^[A-Za-z]{3}$/.test(value.trim())) {
                const currency = value.trim();
                const currencyUpper = currency.toUpperCase();
                if (this.isValidCurrency(currencyUpper)) {
                    return currency; // Return original case
                }
            }
        }

        throw new Error(`Row ${rowNum}: Unable to detect currency code`);
    }

    /**
     * Extract currency from row
     * DeGiro CSVs have unnamed columns for currencies after Price
     * We look for the first valid 3-letter currency code after the Price column
     */
    private extractCurrency(row: DeGiroRow, rowNum: number): string {
        // Get all row entries to find currency codes
        const entries = Object.entries(row);

        // Find the Price column index
        let foundPrice = false;
        const possibleCurrencies: string[] = [];

        for (const [key, value] of entries) {
            // Mark when we pass the Price column
            if (key === 'Price') {
                foundPrice = true;
                continue;
            }

            // After Price column, look for 3-letter currency codes
            // Common currencies: USD, GBP, EUR, CHF, JPY, CAD, AUD, etc.
            if (foundPrice && value && /^[A-Za-z]{3}$/i.test(value.trim())) {
                const currency = value.trim().toUpperCase();
                // Only accept common currency codes (not things like "LSE", "XLON")
                if (this.isValidCurrency(currency)) {
                    possibleCurrencies.push(currency);
                }
            }
        }

        if (possibleCurrencies.length === 0) {
            throw new Error(`Row ${rowNum}: Unable to detect currency code`);
        }

        // Return the first valid currency code
        return possibleCurrencies[0];
    }

    /**
     * Check if a 3-letter code is a valid currency
     * Common currencies only to avoid matching venue codes like LSE, XLON, etc.
     */
    private isValidCurrency(code: string): boolean {
        const commonCurrencies = [
            'USD',
            'GBP',
            'EUR',
            'JPY',
            'CHF',
            'CAD',
            'AUD',
            'NZD',
            'SEK',
            'NOK',
            'DKK',
            'PLN',
            'CZK',
            'HUF',
            'RON',
            'BGN',
            'HRK',
            'RUB',
            'TRY',
            'BRL',
            'MXN',
            'ZAR',
            'INR',
            'CNY',
            'HKD',
            'SGD',
            'KRW',
            'THB',
            'MYR',
            'IDR',
            'PHP',
        ];
        return commonCurrencies.includes(code);
    }
}
