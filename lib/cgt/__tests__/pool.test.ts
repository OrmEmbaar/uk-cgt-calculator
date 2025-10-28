import { describe, it, expect } from 'vitest';
import {
    createPool,
    addToPool,
    removeFromPool,
    getAverageCostPerUnit,
    hasQuantity,
    clonePool,
} from '../pool';
import { createBuy, d, expectDecimalEqual } from './test-helpers';

describe('Section 104 Pool', () => {
    describe('createPool', () => {
        it('should create an empty pool', () => {
            const pool = createPool();
            expectDecimalEqual(pool.quantity, 0);
            expectDecimalEqual(pool.totalCostGBP, 0);
        });
    });

    describe('addToPool', () => {
        it('should add an acquisition to an empty pool', () => {
            const pool = createPool();
            const acquisition = createBuy({
                date: '2024-01-01',
                asset: 'ABC',
                quantity: 100,
                price: 10,
                fee: 5,
            });

            const updatedPool = addToPool(pool, acquisition);

            expectDecimalEqual(updatedPool.quantity, 100);
            // Cost = (100 * 10 + 5) * 1.0 = 1005
            expectDecimalEqual(updatedPool.totalCostGBP, 1005);
        });

        it('should add multiple acquisitions to pool', () => {
            let pool = createPool();

            const acq1 = createBuy({
                date: '2024-01-01',
                asset: 'ABC',
                quantity: 100,
                price: 10,
                fee: 5,
            });

            const acq2 = createBuy({
                date: '2024-02-01',
                asset: 'ABC',
                quantity: 50,
                price: 12,
                fee: 3,
            });

            pool = addToPool(pool, acq1);
            pool = addToPool(pool, acq2);

            expectDecimalEqual(pool.quantity, 150);
            // Cost = 1005 + (50 * 12 + 3) = 1005 + 603 = 1608
            expectDecimalEqual(pool.totalCostGBP, 1608);
        });

        it('should handle acquisitions with different currencies', () => {
            const pool = createPool();
            const acquisition = createBuy({
                date: '2024-01-01',
                asset: 'ABC',
                quantity: 100,
                price: 10,
                currency: 'USD',
                exchangeRate: 0.8, // 1 USD = 0.8 GBP
                fee: 5,
            });

            const updatedPool = addToPool(pool, acquisition);

            expectDecimalEqual(updatedPool.quantity, 100);
            // Cost = (100 * 10 + 5) * 0.8 = 1005 * 0.8 = 804
            expectDecimalEqual(updatedPool.totalCostGBP, 804);
        });

        it('should handle acquisitions with zero fees', () => {
            const pool = createPool();
            const acquisition = createBuy({
                date: '2024-01-01',
                asset: 'ABC',
                quantity: 100,
                price: 10,
                fee: 0,
            });

            const updatedPool = addToPool(pool, acquisition);

            expectDecimalEqual(updatedPool.quantity, 100);
            expectDecimalEqual(updatedPool.totalCostGBP, 1000);
        });
    });

    describe('getAverageCostPerUnit', () => {
        it('should return 0 for empty pool', () => {
            const pool = createPool();
            expectDecimalEqual(getAverageCostPerUnit(pool), 0);
        });

        it('should calculate average cost correctly', () => {
            let pool = createPool();

            const acq1 = createBuy({
                date: '2024-01-01',
                asset: 'ABC',
                quantity: 100,
                price: 10,
                fee: 0,
            });

            const acq2 = createBuy({
                date: '2024-02-01',
                asset: 'ABC',
                quantity: 100,
                price: 20,
                fee: 0,
            });

            pool = addToPool(pool, acq1);
            pool = addToPool(pool, acq2);

            // Total cost = 1000 + 2000 = 3000
            // Quantity = 200
            // Average = 15
            expectDecimalEqual(getAverageCostPerUnit(pool), 15);
        });
    });

    describe('removeFromPool', () => {
        it('should remove quantity and proportionate cost', () => {
            let pool = createPool();

            const acq = createBuy({
                date: '2024-01-01',
                asset: 'ABC',
                quantity: 100,
                price: 10,
                fee: 0,
            });

            pool = addToPool(pool, acq);

            const result = removeFromPool(pool, d(50));

            expectDecimalEqual(result.updatedPool.quantity, 50);
            expectDecimalEqual(result.updatedPool.totalCostGBP, 500);
            expectDecimalEqual(result.costBasis, 500);
        });

        it('should handle removing all shares', () => {
            let pool = createPool();

            const acq = createBuy({
                date: '2024-01-01',
                asset: 'ABC',
                quantity: 100,
                price: 10,
                fee: 0,
            });

            pool = addToPool(pool, acq);

            const result = removeFromPool(pool, d(100));

            expectDecimalEqual(result.updatedPool.quantity, 0);
            expectDecimalEqual(result.updatedPool.totalCostGBP, 0);
            expectDecimalEqual(result.costBasis, 1000);
        });

        it('should throw error when removing more than available', () => {
            let pool = createPool();

            const acq = createBuy({
                date: '2024-01-01',
                asset: 'ABC',
                quantity: 100,
                price: 10,
                fee: 0,
            });

            pool = addToPool(pool, acq);

            expect(() => removeFromPool(pool, d(150))).toThrow();
        });

        it('should handle removing zero quantity', () => {
            let pool = createPool();

            const acq = createBuy({
                date: '2024-01-01',
                asset: 'ABC',
                quantity: 100,
                price: 10,
                fee: 0,
            });

            pool = addToPool(pool, acq);

            const result = removeFromPool(pool, d(0));

            expectDecimalEqual(result.updatedPool.quantity, 100);
            expectDecimalEqual(result.updatedPool.totalCostGBP, 1000);
            expectDecimalEqual(result.costBasis, 0);
        });
    });

    describe('hasQuantity', () => {
        it('should return true when pool has sufficient quantity', () => {
            let pool = createPool();

            const acq = createBuy({
                date: '2024-01-01',
                asset: 'ABC',
                quantity: 100,
                price: 10,
                fee: 0,
            });

            pool = addToPool(pool, acq);

            expect(hasQuantity(pool, d(50))).toBe(true);
            expect(hasQuantity(pool, d(100))).toBe(true);
        });

        it('should return false when pool has insufficient quantity', () => {
            let pool = createPool();

            const acq = createBuy({
                date: '2024-01-01',
                asset: 'ABC',
                quantity: 100,
                price: 10,
                fee: 0,
            });

            pool = addToPool(pool, acq);

            expect(hasQuantity(pool, d(150))).toBe(false);
        });
    });

    describe('clonePool', () => {
        it('should create an independent copy of pool', () => {
            let pool = createPool();

            const acq = createBuy({
                date: '2024-01-01',
                asset: 'ABC',
                quantity: 100,
                price: 10,
                fee: 0,
            });

            pool = addToPool(pool, acq);
            const cloned = clonePool(pool);

            expect(cloned.quantity.equals(pool.quantity)).toBe(true);
            expect(cloned.totalCostGBP.equals(pool.totalCostGBP)).toBe(true);

            // Modify original - clone should be unchanged
            const result = removeFromPool(pool, d(50));

            expectDecimalEqual(result.updatedPool.quantity, 50);
            expectDecimalEqual(cloned.quantity, 100);
        });
    });
});
