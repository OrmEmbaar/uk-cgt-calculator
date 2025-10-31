import { DateTime } from 'luxon';

/**
 * Format a number as GBP currency
 */
export function formatCurrency(amount: number | string): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(num)) {
        return '£0.00';
    }

    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(num);
}

/**
 * Format a number as currency with color coding for gains/losses
 */
export function formatGainLoss(amount: number): {
    formatted: string;
    color: 'text-green-600' | 'text-red-600' | 'text-gray-600';
} {
    const formatted = formatCurrency(amount);

    if (amount > 0) {
        return { formatted: `+${formatted}`, color: 'text-green-600' };
    } else if (amount < 0) {
        return { formatted, color: 'text-red-600' };
    }

    return { formatted, color: 'text-gray-600' };
}

/**
 * Format a date string or Date object
 */
export function formatDate(date: Date | string, formatString: string = 'dd MMM yyyy'): string {
    let dateTime: DateTime;

    if (typeof date === 'string') {
        dateTime = DateTime.fromISO(date);
    } else {
        dateTime = DateTime.fromJSDate(date);
    }

    if (!dateTime.isValid) {
        return 'Invalid date';
    }

    return dateTime.toFormat(formatString);
}

/**
 * Format a date with relative time (e.g., "2 days ago")
 */
export function formatRelativeDate(date: Date | string): string {
    let dateTime: DateTime;

    if (typeof date === 'string') {
        dateTime = DateTime.fromISO(date);
    } else {
        dateTime = DateTime.fromJSDate(date);
    }

    if (!dateTime.isValid) {
        return 'Invalid date';
    }

    return dateTime.toRelative() || 'Invalid date';
}

/**
 * Format a number as a percentage
 */
export function formatPercent(value: number, decimals: number = 2): string {
    return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format a number with thousands separators
 */
export function formatNumber(value: number, decimals: number = 0): string {
    return new Intl.NumberFormat('en-GB', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}

/**
 * Format a decimal quantity (e.g., shares)
 */
export function formatQuantity(quantity: number | string): string {
    const num = typeof quantity === 'string' ? parseFloat(quantity) : quantity;

    if (isNaN(num)) {
        return '0';
    }

    // Remove trailing zeros after decimal point
    return num.toFixed(4).replace(/\.?0+$/, '');
}

/**
 * Format file size in bytes to human-readable format
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
