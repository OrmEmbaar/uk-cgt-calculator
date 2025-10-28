import { Transaction } from '../cgt/types';

/**
 * Error details for failed parsing
 */
export interface ParseError {
    /** Row number (1-indexed, excluding header) */
    row: number;
    /** Field name that caused the error */
    field?: string;
    /** Human-readable error message */
    message: string;
    /** Raw data from the problematic row */
    rawData?: unknown;
}

/**
 * Result of parsing a CSV file
 */
export interface ParseResult {
    /** Successfully parsed transactions */
    transactions: Transaction[];
    /** Parse errors (if any) */
    errors?: ParseError[];
}

/**
 * Configuration options for CSV parsers
 */
export interface ParserOptions {
    /**
     * Timezone to use when parsing dates without explicit timezone
     * Defaults to 'Europe/London'
     */
    timezone?: string;
}

/**
 * Abstract interface for CSV parsers
 */
export interface CSVParser {
    /**
     * Parse CSV content into an array of transactions
     * @param csvContent - Raw CSV string content
     * @returns Promise resolving to array of transactions
     * @throws ParseError on first validation failure
     */
    parse(csvContent: string): Promise<Transaction[]>;
}
