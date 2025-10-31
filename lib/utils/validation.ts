export interface ValidationError {
    field: string;
    message: string;
}

/**
 * Validate ISIN format (basic validation)
 * ISIN format: 2 letter country code + 9 alphanumeric characters + 1 check digit
 */
export function validateISIN(isin: string): boolean {
    if (!isin) return false;

    const isinRegex = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
    return isinRegex.test(isin.trim().toUpperCase());
}

/**
 * Validate ticker symbol (basic validation)
 */
export function validateTicker(ticker: string): boolean {
    if (!ticker) return false;

    // 1-5 uppercase letters
    const tickerRegex = /^[A-Z]{1,5}$/;
    return tickerRegex.test(ticker.trim().toUpperCase());
}

/**
 * Validate currency code (ISO 4217)
 */
export function validateCurrency(currency: string): boolean {
    if (!currency) return false;

    // Must be exactly 3 uppercase letters
    const currencyRegex = /^[A-Z]{3}$/;
    return currencyRegex.test(currency.trim().toUpperCase());
}

/**
 * Validate transaction type
 */
export function validateTransactionType(type: string): boolean {
    return type === 'BUY' || type === 'SELL';
}

/**
 * Validate a number field
 */
export function validateNumber(value: unknown, min?: number, max?: number): boolean {
    const num = typeof value === 'string' ? parseFloat(value) : value;

    if (typeof num !== 'number' || isNaN(num)) {
        return false;
    }

    if (min !== undefined && num < min) {
        return false;
    }

    if (max !== undefined && num > max) {
        return false;
    }

    return true;
}

/**
 * Validate a positive number
 */
export function validatePositiveNumber(value: unknown): boolean {
    return validateNumber(value, 0.000001); // Must be greater than 0
}

/**
 * Validate a non-negative number
 */
export function validateNonNegativeNumber(value: unknown): boolean {
    return validateNumber(value, 0); // Can be 0 or greater
}

/**
 * Validate a date
 */
export function validateDate(date: unknown): boolean {
    if (!date) return false;

    const dateObj = typeof date === 'string' ? new Date(date) : date;

    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        return false;
    }

    // Date should not be in the future
    if (dateObj > new Date()) {
        return false;
    }

    return true;
}

/**
 * Validate a complete transaction object
 */
export interface TransactionValidationData {
    date: string | Date;
    type: string;
    quantity: number | string;
    price: number | string;
    currency: string;
    exchangeRate: number | string;
    fee: number | string;
}

export function validateTransaction(txn: TransactionValidationData): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate date
    if (!validateDate(txn.date)) {
        errors.push({
            field: 'date',
            message: 'Invalid date or date is in the future',
        });
    }

    // Validate type
    if (!validateTransactionType(txn.type)) {
        errors.push({
            field: 'type',
            message: 'Transaction type must be BUY or SELL',
        });
    }

    // Validate quantity
    if (!validatePositiveNumber(txn.quantity)) {
        errors.push({
            field: 'quantity',
            message: 'Quantity must be a positive number',
        });
    }

    // Validate price
    if (!validatePositiveNumber(txn.price)) {
        errors.push({
            field: 'price',
            message: 'Price must be a positive number',
        });
    }

    // Validate currency
    if (!validateCurrency(txn.currency)) {
        errors.push({
            field: 'currency',
            message: 'Currency must be a valid 3-letter code (e.g., GBP, USD)',
        });
    }

    // Validate exchange rate
    if (!validatePositiveNumber(txn.exchangeRate)) {
        errors.push({
            field: 'exchangeRate',
            message: 'Exchange rate must be a positive number',
        });
    }

    // Validate fee
    if (!validateNonNegativeNumber(txn.fee)) {
        errors.push({
            field: 'fee',
            message: 'Fee must be a non-negative number',
        });
    }

    return errors;
}

/**
 * Check if a value is empty (null, undefined, empty string, etc.)
 */
export function isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
}
