import { describe, it, expect } from 'vitest';
import { transactionsToRawCSV, combineToRawCSV } from '../convert-to-raw';
import { Transaction } from '../../cgt/types';
import { DateTime } from 'luxon';
import Decimal from 'decimal.js';

describe('Convert to Raw CSV', () => {
    describe('transactionsToRawCSV', () => {
        it('should convert single transaction to raw CSV', () => {
            const transactions: Transaction[] = [
                {
                    date: DateTime.fromISO('2024-01-15T10:30:00Z'),
                    type: 'BUY',
                    asset: 'AAPL',
                    quantity: new Decimal(100),
                    price: new Decimal(150.5),
                    currency: 'USD',
                    exchangeRate: new Decimal(0.79),
                    fee: new Decimal(10),
                },
            ];

            const csv = transactionsToRawCSV(transactions);

            expect(csv).toContain('date,type,asset,quantity,price,currency,exchangeRate,fee');
            expect(csv).toContain('2024-01-15');
            expect(csv).toContain('BUY');
            expect(csv).toContain('AAPL');
            expect(csv).toContain('100');
            expect(csv).toContain('150.5');
            expect(csv).toContain('USD');
            expect(csv).toContain('0.79');
            expect(csv).toContain('10');
        });

        it('should convert multiple transactions to raw CSV', () => {
            const transactions: Transaction[] = [
                {
                    date: DateTime.fromISO('2024-01-15'),
                    type: 'BUY',
                    asset: 'AAPL',
                    quantity: new Decimal(100),
                    price: new Decimal(150.5),
                    currency: 'USD',
                    exchangeRate: new Decimal(0.79),
                    fee: new Decimal(10),
                },
                {
                    date: DateTime.fromISO('2024-02-20'),
                    type: 'SELL',
                    asset: 'AAPL',
                    quantity: new Decimal(50),
                    price: new Decimal(155),
                    currency: 'USD',
                    exchangeRate: new Decimal(0.8),
                    fee: new Decimal(8.5),
                },
            ];

            const csv = transactionsToRawCSV(transactions);
            const lines = csv.split('\r\n');

            expect(lines.length).toBeGreaterThanOrEqual(3); // Header + 2 data rows
            expect(lines[0]).toBe('date,type,asset,quantity,price,currency,exchangeRate,fee');
        });

        it('should handle empty transaction array', () => {
            const csv = transactionsToRawCSV([]);
            expect(csv).toBe('date,type,asset,quantity,price,currency,exchangeRate,fee');
        });

        it('should preserve decimal precision', () => {
            const transactions: Transaction[] = [
                {
                    date: DateTime.fromISO('2024-01-15'),
                    type: 'BUY',
                    asset: 'TEST',
                    quantity: new Decimal('10.123456789'),
                    price: new Decimal('150.505050'),
                    currency: 'USD',
                    exchangeRate: new Decimal('0.791234567'),
                    fee: new Decimal('9.99876543'),
                },
            ];

            const csv = transactionsToRawCSV(transactions);

            expect(csv).toContain('10.123456789');
            // Decimal.toString() removes trailing zeros, so 150.505050 becomes 150.50505
            expect(csv).toContain('150.50505');
            expect(csv).toContain('0.791234567');
            expect(csv).toContain('9.99876543');
        });

        it('should handle zero fees', () => {
            const transactions: Transaction[] = [
                {
                    date: DateTime.fromISO('2024-01-15'),
                    type: 'BUY',
                    asset: 'TEST',
                    quantity: new Decimal(100),
                    price: new Decimal(50),
                    currency: 'GBP',
                    exchangeRate: new Decimal(1),
                    fee: new Decimal(0),
                },
            ];

            const csv = transactionsToRawCSV(transactions);
            const lines = csv.split('\n');

            expect(lines[1]).toContain(',0'); // Fee should be 0
        });
    });

    describe('combineToRawCSV', () => {
        it('should combine transactions from multiple sources', () => {
            const vanguardTransactions: Transaction[] = [
                {
                    date: DateTime.fromISO('2024-01-15'),
                    type: 'BUY',
                    asset: 'VUSA',
                    quantity: new Decimal(100),
                    price: new Decimal(50),
                    currency: 'GBP',
                    exchangeRate: new Decimal(1),
                    fee: new Decimal(7.5),
                },
            ];

            const igTransactions: Transaction[] = [
                {
                    date: DateTime.fromISO('2024-02-20'),
                    type: 'SELL',
                    asset: 'AAPL',
                    quantity: new Decimal(50),
                    price: new Decimal(155),
                    currency: 'USD',
                    exchangeRate: new Decimal(0.8),
                    fee: new Decimal(10),
                },
            ];

            const csv = combineToRawCSV(vanguardTransactions, igTransactions);
            const lines = csv.split('\n');

            expect(lines).toHaveLength(3); // Header + 2 transactions
            expect(csv).toContain('VUSA');
            expect(csv).toContain('AAPL');
        });

        it('should sort combined transactions by date', () => {
            const transactions1: Transaction[] = [
                {
                    date: DateTime.fromISO('2024-03-01'),
                    type: 'BUY',
                    asset: 'ASSET1',
                    quantity: new Decimal(100),
                    price: new Decimal(50),
                    currency: 'GBP',
                    exchangeRate: new Decimal(1),
                    fee: new Decimal(0),
                },
            ];

            const transactions2: Transaction[] = [
                {
                    date: DateTime.fromISO('2024-01-01'),
                    type: 'BUY',
                    asset: 'ASSET2',
                    quantity: new Decimal(100),
                    price: new Decimal(50),
                    currency: 'GBP',
                    exchangeRate: new Decimal(1),
                    fee: new Decimal(0),
                },
            ];

            const csv = combineToRawCSV(transactions1, transactions2);
            const lines = csv.split('\n');

            // First transaction (after header) should be the earlier date
            expect(lines[1]).toContain('2024-01-01');
            expect(lines[2]).toContain('2024-03-01');
        });

        it('should handle empty arrays', () => {
            const csv = combineToRawCSV([], []);
            expect(csv).toBe('date,type,asset,quantity,price,currency,exchangeRate,fee');
        });

        it('should handle three or more transaction arrays', () => {
            const arr1: Transaction[] = [
                {
                    date: DateTime.fromISO('2024-01-01'),
                    type: 'BUY',
                    asset: 'A',
                    quantity: new Decimal(10),
                    price: new Decimal(100),
                    currency: 'GBP',
                    exchangeRate: new Decimal(1),
                    fee: new Decimal(0),
                },
            ];

            const arr2: Transaction[] = [
                {
                    date: DateTime.fromISO('2024-02-01'),
                    type: 'BUY',
                    asset: 'B',
                    quantity: new Decimal(20),
                    price: new Decimal(200),
                    currency: 'GBP',
                    exchangeRate: new Decimal(1),
                    fee: new Decimal(0),
                },
            ];

            const arr3: Transaction[] = [
                {
                    date: DateTime.fromISO('2024-03-01'),
                    type: 'BUY',
                    asset: 'C',
                    quantity: new Decimal(30),
                    price: new Decimal(300),
                    currency: 'GBP',
                    exchangeRate: new Decimal(1),
                    fee: new Decimal(0),
                },
            ];

            const csv = combineToRawCSV(arr1, arr2, arr3);
            const lines = csv.split('\n');

            expect(lines).toHaveLength(4); // Header + 3 transactions
            expect(csv).toContain('A');
            expect(csv).toContain('B');
            expect(csv).toContain('C');
        });
    });
});
