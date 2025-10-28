import { DateTime } from 'luxon';
import Decimal from 'decimal.js';
import Papa from 'papaparse';
import { Transaction, TransactionType } from '../cgt/types';
import { CSVParser, ParserOptions } from './types';

/**
 * Abstract base class for CSV parsers
 * Provides common validation utilities and parsing infrastructure
 */
export abstract class BaseCSVParser implements CSVParser {
    protected timezone: string;

    constructor(options: ParserOptions = {}) {
        this.timezone = options.timezone || 'Europe/London';
    }

    /**
     * Parse CSV content - must be implemented by subclasses
     */
    abstract parse(csvContent: string): Promise<Transaction[]>;

    /**
     * Parse a date string in ISO8601 format
     * If the date string includes timezone info, it will be used
     * Otherwise, falls back to the parser's default timezone
     *
     * @param dateStr - ISO8601 date string
     * @param rowNum - Row number for error reporting
     * @returns Luxon DateTime object
     * @throws Error if date is invalid
     */
    protected parseDate(dateStr: string, rowNum: number): DateTime {
        if (!dateStr || dateStr.trim() === '') {
            throw new Error(`Row ${rowNum}: Date field is empty`);
        }

        const trimmed = dateStr.trim();

        // Check if the date string has timezone information
        const hasTimezone = trimmed.includes('Z') || trimmed.match(/[+-]\d{2}:\d{2}$/);

        // Parse the ISO8601 string
        let date: DateTime;

        if (hasTimezone) {
            // Parse with the timezone from the string (setZone: true preserves the zone)
            date = DateTime.fromISO(trimmed, { setZone: true });
        } else {
            // Parse and assume the default timezone
            date = DateTime.fromISO(trimmed, { zone: this.timezone });
        }

        if (date.isValid) {
            return date;
        }

        throw new Error(
            `Row ${rowNum}: Invalid date format "${dateStr}". Expected ISO8601 format (e.g., 2024-01-15 or 2024-01-15T10:30:00Z)`
        );
    }

    /**
     * Parse and validate a decimal number
     *
     * @param value - String value to parse
     * @param fieldName - Field name for error reporting
     * @param rowNum - Row number for error reporting
     * @returns Decimal object
     * @throws Error if value is not a valid number or is negative
     */
    protected parseDecimal(value: string, fieldName: string, rowNum: number): Decimal {
        if (!value || value.trim() === '') {
            throw new Error(`Row ${rowNum}: ${fieldName} field is empty`);
        }

        try {
            const decimal = new Decimal(value.trim());

            if (decimal.isNaN()) {
                throw new Error(`Row ${rowNum}: ${fieldName} is not a valid number: "${value}"`);
            }

            if (decimal.isNegative()) {
                throw new Error(`Row ${rowNum}: ${fieldName} cannot be negative: ${value}`);
            }

            return decimal;
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('Row')) {
                throw error;
            }
            throw new Error(`Row ${rowNum}: ${fieldName} is not a valid number: "${value}"`);
        }
    }

    /**
     * Validate and normalize transaction type
     *
     * @param type - Transaction type string
     * @param rowNum - Row number for error reporting
     * @returns Validated transaction type
     * @throws Error if type is not BUY or SELL
     */
    protected validateTransactionType(type: string, rowNum: number): TransactionType {
        if (!type || type.trim() === '') {
            throw new Error(`Row ${rowNum}: Transaction type field is empty`);
        }

        const normalized = type.trim().toUpperCase();

        if (normalized !== 'BUY' && normalized !== 'SELL') {
            throw new Error(`Row ${rowNum}: Transaction type must be BUY or SELL, got "${type}"`);
        }

        return normalized as TransactionType;
    }

    /**
     * Validate currency code
     * Performs basic validation - checks for 3-letter uppercase code
     *
     * @param currency - Currency code string
     * @param rowNum - Row number for error reporting
     * @returns Validated currency code
     * @throws Error if currency code is invalid
     */
    protected validateCurrency(currency: string, rowNum: number): string {
        if (!currency || currency.trim() === '') {
            throw new Error(`Row ${rowNum}: Currency field is empty`);
        }

        const normalized = currency.trim().toUpperCase();

        // Basic validation: 3-letter code
        if (!/^[A-Z]{3}$/.test(normalized)) {
            throw new Error(`Row ${rowNum}: Currency code must be 3 letters, got "${currency}"`);
        }

        return normalized;
    }

    /**
     * Validate asset identifier
     *
     * @param asset - Asset identifier string
     * @param rowNum - Row number for error reporting
     * @returns Validated asset identifier
     * @throws Error if asset is empty
     */
    protected validateAsset(asset: string, rowNum: number): string {
        if (!asset || asset.trim() === '') {
            throw new Error(`Row ${rowNum}: Asset field is empty`);
        }

        return asset.trim();
    }

    /**
     * Parse CSV using PapaParse
     *
     * @param csvContent - Raw CSV string
     * @returns Parsed data with headers
     */
    protected parseCSV<T = unknown>(csvContent: string): Papa.ParseResult<T> {
        return Papa.parse<T>(csvContent, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim(),
        });
    }

    /**
     * Validate that required fields are present in CSV headers
     *
     * @param headers - Array of header names from CSV
     * @param requiredFields - Array of required field names
     * @throws Error if any required fields are missing
     */
    protected validateRequiredFields(headers: string[], requiredFields: string[]): void {
        const missingFields = requiredFields.filter((field) => !headers.includes(field));

        if (missingFields.length > 0) {
            throw new Error(`Missing required columns: ${missingFields.join(', ')}`);
        }
    }
}
