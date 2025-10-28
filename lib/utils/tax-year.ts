import { DateTime } from 'luxon';

/**
 * UK tax year runs from April 6 to April 5 of the following year
 * e.g., 2023/2024 tax year = April 6, 2023 to April 5, 2024
 */

/**
 * Get the tax year string for a given date
 * Returns format "YYYY/YYYY" e.g., "2023/2024"
 */
export function getTaxYear(date: DateTime): string {
    const year = date.year;
    const month = date.month;
    const day = date.day;

    // Tax year starts on April 6
    // If before April 6, we're in the previous tax year
    if (month < 4 || (month === 4 && day < 6)) {
        return `${year - 1}/${year}`;
    }

    // If on or after April 6, we're in the current tax year
    return `${year}/${year + 1}`;
}

/**
 * Get the start date of a tax year
 */
export function getTaxYearStart(taxYear: string): DateTime {
    const startYear = parseInt(taxYear.split('/')[0]);
    return DateTime.fromObject({ year: startYear, month: 4, day: 6 }, { zone: 'Europe/London' });
}

/**
 * Get the end date of a tax year (April 5 of the following year)
 */
export function getTaxYearEnd(taxYear: string): DateTime {
    const endYear = parseInt(taxYear.split('/')[1]);
    return DateTime.fromObject({ year: endYear, month: 4, day: 5 }, { zone: 'Europe/London' });
}

/**
 * Check if a date falls within a specific tax year
 */
export function isInTaxYear(date: DateTime, taxYear: string): boolean {
    return getTaxYear(date) === taxYear;
}

/**
 * Get all unique tax years from a list of dates, sorted in descending order (most recent first)
 */
export function getUniqueTaxYears(dates: DateTime[]): string[] {
    const taxYears = new Set<string>();
    dates.forEach((date) => {
        taxYears.add(getTaxYear(date));
    });
    return Array.from(taxYears).sort((a, b) => {
        // Sort descending (most recent first)
        const aStart = parseInt(a.split('/')[0]);
        const bStart = parseInt(b.split('/')[0]);
        return bStart - aStart;
    });
}
