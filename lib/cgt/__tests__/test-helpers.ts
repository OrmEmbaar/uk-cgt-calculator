import { expect } from 'vitest';
import { DateTime } from 'luxon';
import Decimal from 'decimal.js';
import { Transaction, Acquisition, Disposal } from '../types';

/**
 * Helper to create a Decimal from a number or string
 */
export function d(value: number | string): Decimal {
    return new Decimal(value);
}

/**
 * Helper to create a BUY transaction with less boilerplate
 */
export function createBuy(params: {
    date: string;
    asset: string;
    quantity: number | string;
    price: number | string;
    currency?: string;
    exchangeRate?: number | string;
    fee?: number | string;
}): Acquisition {
    return {
        date: DateTime.fromISO(params.date),
        type: 'BUY',
        asset: params.asset,
        quantity: d(params.quantity),
        price: d(params.price),
        currency: params.currency || 'GBP',
        exchangeRate: d(params.exchangeRate || 1.0),
        fee: d(params.fee || 0),
    };
}

/**
 * Helper to create a SELL transaction with less boilerplate
 */
export function createSell(params: {
    date: string;
    asset: string;
    quantity: number | string;
    price: number | string;
    currency?: string;
    exchangeRate?: number | string;
    fee?: number | string;
}): Disposal {
    return {
        date: DateTime.fromISO(params.date),
        type: 'SELL',
        asset: params.asset,
        quantity: d(params.quantity),
        price: d(params.price),
        currency: params.currency || 'GBP',
        exchangeRate: d(params.exchangeRate || 1.0),
        fee: d(params.fee || 0),
    };
}

/**
 * Helper to compare Decimal values in tests
 * Values should already be rounded to 2 decimal places (pence)
 */
export function expectDecimalEqual(actual: Decimal, expected: number | string) {
    const expectedDecimal = d(expected);

    if (!actual.equals(expectedDecimal)) {
        throw new Error(
            `Expected ${actual.toString()} to equal ${expectedDecimal.toString()}\n` +
                `Difference: ${actual.minus(expectedDecimal).toString()}`
        );
    }
}

/**
 * Helper to check if Decimal is close enough (for floating point comparisons)
 */
export function expectDecimalClose(actual: Decimal, expected: number | string, tolerance = 0.000001) {
    const diff = actual.minus(d(expected)).abs();
    expect(diff.lessThanOrEqualTo(tolerance)).toBe(true);
}
