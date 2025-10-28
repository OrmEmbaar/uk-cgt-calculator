import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { getTaxYear, getTaxYearStart, getTaxYearEnd, isInTaxYear, getUniqueTaxYears } from '../tax-year';

describe('Tax Year Utilities', () => {
    describe('getTaxYear', () => {
        it('should return correct tax year for date before April 6', () => {
            const date = DateTime.fromISO('2024-04-05');
            expect(getTaxYear(date)).toBe('2023/2024');
        });

        it('should return correct tax year for April 6 (tax year start)', () => {
            const date = DateTime.fromISO('2024-04-06');
            expect(getTaxYear(date)).toBe('2024/2025');
        });

        it('should return correct tax year for date after April 6', () => {
            const date = DateTime.fromISO('2024-04-07');
            expect(getTaxYear(date)).toBe('2024/2025');
        });

        it('should return correct tax year for January date', () => {
            const date = DateTime.fromISO('2024-01-15');
            expect(getTaxYear(date)).toBe('2023/2024');
        });

        it('should return correct tax year for December date', () => {
            const date = DateTime.fromISO('2023-12-31');
            expect(getTaxYear(date)).toBe('2023/2024');
        });

        it('should return correct tax year for date in May', () => {
            const date = DateTime.fromISO('2024-05-01');
            expect(getTaxYear(date)).toBe('2024/2025');
        });
    });

    describe('getTaxYearStart', () => {
        it('should return April 6 for tax year start', () => {
            const start = getTaxYearStart('2023/2024');
            expect(start.year).toBe(2023);
            expect(start.month).toBe(4);
            expect(start.day).toBe(6);
        });
    });

    describe('getTaxYearEnd', () => {
        it('should return April 5 for tax year end', () => {
            const end = getTaxYearEnd('2023/2024');
            expect(end.year).toBe(2024);
            expect(end.month).toBe(4);
            expect(end.day).toBe(5);
        });
    });

    describe('isInTaxYear', () => {
        it('should return true for date in tax year', () => {
            const date = DateTime.fromISO('2024-01-15');
            expect(isInTaxYear(date, '2023/2024')).toBe(true);
        });

        it('should return false for date outside tax year', () => {
            const date = DateTime.fromISO('2024-05-15');
            expect(isInTaxYear(date, '2023/2024')).toBe(false);
        });

        it('should return true for tax year start date', () => {
            const date = DateTime.fromISO('2024-04-06');
            expect(isInTaxYear(date, '2024/2025')).toBe(true);
        });

        it('should return true for tax year end date', () => {
            const date = DateTime.fromISO('2024-04-05');
            expect(isInTaxYear(date, '2023/2024')).toBe(true);
        });
    });

    describe('getUniqueTaxYears', () => {
        it('should return unique tax years sorted descending', () => {
            const dates = [
                DateTime.fromISO('2024-01-15'),
                DateTime.fromISO('2024-05-15'),
                DateTime.fromISO('2023-06-01'),
                DateTime.fromISO('2024-06-01'),
            ];
            const taxYears = getUniqueTaxYears(dates);
            expect(taxYears).toEqual(['2024/2025', '2023/2024']);
        });

        it('should handle single tax year', () => {
            const dates = [DateTime.fromISO('2024-01-15'), DateTime.fromISO('2024-02-15')];
            const taxYears = getUniqueTaxYears(dates);
            expect(taxYears).toEqual(['2023/2024']);
        });

        it('should handle empty array', () => {
            const taxYears = getUniqueTaxYears([]);
            expect(taxYears).toEqual([]);
        });
    });
});
