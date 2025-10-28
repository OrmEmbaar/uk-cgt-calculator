import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { calculateCGT } from '../calculator';
import { createBuy, createSell, expectDecimalEqual } from './test-helpers';

describe('CGT Calculator - Same Day Rule', () => {
    describe('Basic same-day matching', () => {
        it('should match same-day buy and sell', () => {
            const transactions = [
                createBuy({ date: '2024-01-01T09:00:00', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-01-01T15:00:00', asset: 'ABC', quantity: 100, price: 15 }),
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(1);

            const disposal = result.disposals[0];
            expect(disposal.matchedPortions).toHaveLength(1);
            expect(disposal.matchedPortions[0].matchType).toBe('SAME_DAY');
            expectDecimalEqual(disposal.matchedPortions[0].quantity, 100);
            expectDecimalEqual(disposal.totalCostBasisGBP, 1000);
            expectDecimalEqual(disposal.totalProceedsGBP, 1500);
            expectDecimalEqual(disposal.totalGainLossGBP, 500);
        });

        it('should match sell before buy on same day (time order)', () => {
            const transactions = [
                createSell({ date: '2024-01-01T15:00:00', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-01-01T09:00:00', asset: 'ABC', quantity: 100, price: 10 }),
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(1);

            const disposal = result.disposals[0];
            expect(disposal.matchedPortions[0].matchType).toBe('SAME_DAY');
            expectDecimalEqual(disposal.totalGainLossGBP, 500);
        });

        it('should match partial same-day when sell quantity exceeds buy', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 200, price: 8 }), // Build up pool first
                createBuy({ date: '2024-06-01T09:00:00', asset: 'ABC', quantity: 50, price: 10 }),
                createSell({ date: '2024-06-01T15:00:00', asset: 'ABC', quantity: 100, price: 15 }),
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(1);

            const disposal = result.disposals[0];

            // Should have 2 matched portions: 50 same-day, 50 from pool
            expect(disposal.matchedPortions).toHaveLength(2);

            const sameDayPortion = disposal.matchedPortions.find((p) => p.matchType === 'SAME_DAY');
            expect(sameDayPortion).toBeDefined();
            expectDecimalEqual(sameDayPortion!.quantity, 50);
            expectDecimalEqual(sameDayPortion!.costBasisGBP, 500); // 50 * 10
            expectDecimalEqual(sameDayPortion!.proceedsGBP, 750); // 50 * 15

            const poolPortion = disposal.matchedPortions.find((p) => p.matchType === 'SECTION_104');
            expect(poolPortion).toBeDefined();
            expectDecimalEqual(poolPortion!.quantity, 50);
            expectDecimalEqual(poolPortion!.costBasisGBP, 400); // 50 * 8
            expectDecimalEqual(poolPortion!.proceedsGBP, 750); // 50 * 15
        });

        it('should aggregate multiple same-day purchases as a single match (weighted)', () => {
            const transactions = [
                createBuy({ date: '2024-06-01T09:00:00', asset: 'ABC', quantity: 40, price: 10 }),
                createBuy({ date: '2024-06-01T10:00:00', asset: 'ABC', quantity: 30, price: 11 }),
                createBuy({ date: '2024-06-01T11:00:00', asset: 'ABC', quantity: 30, price: 12 }),
                createSell({ date: '2024-06-01T15:00:00', asset: 'ABC', quantity: 100, price: 15 }),
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(1);

            const disposal = result.disposals[0];
            // Should have 1 same-day matched portion (aggregated)
            const sameDayPortions = disposal.matchedPortions.filter((p) => p.matchType === 'SAME_DAY');
            expect(sameDayPortions).toHaveLength(1);

            // Total cost = 40*10 + 30*11 + 30*12 = 400 + 330 + 360 = 1090
            expectDecimalEqual(disposal.totalCostBasisGBP, 1090);
            expectDecimalEqual(disposal.totalProceedsGBP, 1500);
        });
    });

    describe('Same-day with fees', () => {
        it('should include fees in same-day matching', () => {
            const transactions = [
                createBuy({
                    date: '2024-01-01T09:00:00',
                    asset: 'ABC',
                    quantity: 100,
                    price: 10,
                    fee: 20,
                }),
                createSell({
                    date: '2024-01-01T15:00:00',
                    asset: 'ABC',
                    quantity: 100,
                    price: 15,
                    fee: 15,
                }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            expect(disposal.matchedPortions[0].matchType).toBe('SAME_DAY');
            // Cost = 100 * 10 + 20 = 1020
            expectDecimalEqual(disposal.totalCostBasisGBP, 1020);
            // Proceeds = 100 * 15 - 15 = 1485
            expectDecimalEqual(disposal.totalProceedsGBP, 1485);
            expectDecimalEqual(disposal.totalGainLossGBP, 465);
        });

        it('should proportionally allocate fees for partial same-day match', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 5 }),
                createBuy({
                    date: '2024-06-01T09:00:00',
                    asset: 'ABC',
                    quantity: 100,
                    price: 10,
                    fee: 50,
                }),
                createSell({
                    date: '2024-06-01T15:00:00',
                    asset: 'ABC',
                    quantity: 150,
                    price: 15,
                    fee: 30,
                }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            const sameDayPortion = disposal.matchedPortions.find((p) => p.matchType === 'SAME_DAY');
            expect(sameDayPortion).toBeDefined();

            // Cost for 100 shares from same-day buy = 100 * 10 + 50 = 1050
            expectDecimalEqual(sameDayPortion!.costBasisGBP, 1050);

            // Proceeds for 100 out of 150 shares = 100 * 15 - 30 * (100/150) = 1500 - 20 = 1480
            expectDecimalEqual(sameDayPortion!.proceedsGBP, 1480);
        });
    });

    describe('Same-day does not affect pool', () => {
        it('should not add same-day matched acquisitions to pool', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 5 }),
                createBuy({ date: '2024-06-01T09:00:00', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-06-01T15:00:00', asset: 'ABC', quantity: 100, price: 15 }),
            ];

            const result = calculateCGT(transactions);

            // Final pool should only contain the first buy (100 shares at £5)
            expectDecimalEqual(result.finalPoolState.quantity, 100);
            expectDecimalEqual(result.finalPoolState.totalCostGBP, 500);
        });

        it('should handle multiple same-day trades without affecting pool', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 1000, price: 10 }),
                // Day trading on June 1st
                createBuy({ date: '2024-06-01T09:00:00', asset: 'ABC', quantity: 100, price: 12 }),
                createSell({ date: '2024-06-01T10:00:00', asset: 'ABC', quantity: 100, price: 13 }),
                // Day trading on June 2nd
                createBuy({ date: '2024-06-02T09:00:00', asset: 'ABC', quantity: 50, price: 11 }),
                createSell({ date: '2024-06-02T10:00:00', asset: 'ABC', quantity: 50, price: 12 }),
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(2);

            // Both should be same-day matches
            expect(result.disposals[0].matchedPortions[0].matchType).toBe('SAME_DAY');
            expect(result.disposals[1].matchedPortions[0].matchType).toBe('SAME_DAY');

            // Pool should still have original 1000 shares
            expectDecimalEqual(result.finalPoolState.quantity, 1000);
            expectDecimalEqual(result.finalPoolState.totalCostGBP, 10000);
        });
    });

    describe('Same-day priority over other rules', () => {
        it('should prioritize same-day over 30-day rule', () => {
            const transactions = [
                createSell({ date: '2024-06-01T15:00:00', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-06-01T09:00:00', asset: 'ABC', quantity: 50, price: 10 }), // Same day
                createBuy({ date: '2024-06-10', asset: 'ABC', quantity: 50, price: 11 }), // Within 30 days
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            expect(disposal.matchedPortions).toHaveLength(2);

            // First should be same-day
            expect(disposal.matchedPortions[0].matchType).toBe('SAME_DAY');
            expectDecimalEqual(disposal.matchedPortions[0].quantity, 50);

            // Second should be 30-day
            expect(disposal.matchedPortions[1].matchType).toBe('THIRTY_DAY');
            expectDecimalEqual(disposal.matchedPortions[1].quantity, 50);
        });
    });

    describe('Time-of-day independence', () => {
        it('should match same-day transactions regardless of time', () => {
            // Per TCGA92/S105(1): Same CALENDAR DAY, time is irrelevant
            const transactions = [
                createBuy({ date: '2024-06-01T23:59:59', asset: 'ABC', quantity: 50, price: 10 }),
                createSell({ date: '2024-06-01T00:00:01', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-06-01T12:30:00', asset: 'ABC', quantity: 50, price: 11 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // All 100 shares should be matched same-day (50 + 50)
            expect(disposal.matchedPortions[0].matchType).toBe('SAME_DAY');
            expectDecimalEqual(disposal.matchedPortions[0].quantity, 100);

            // Cost should be weighted average: 50*10 + 50*11 = 1050
            expectDecimalEqual(disposal.totalCostBasisGBP, 1050);
        });

        it('should treat transactions one second apart across midnight as different days', () => {
            const transactions = [
                createBuy({ date: '2024-06-01T23:59:59', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-06-02T00:00:00', asset: 'ABC', quantity: 100, price: 15 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Should NOT be same-day (different calendar days)
            expect(disposal.matchedPortions[0].matchType).toBe('SECTION_104');
            expectDecimalEqual(disposal.totalCostBasisGBP, 1000);
        });

        it('should ignore time when calculating 30-day window boundaries', () => {
            // 30-day rule should check calendar days, not time
            const transactions = [
                createSell({ date: '2024-03-01T00:00:00', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-03-31T23:59:59', asset: 'ABC', quantity: 100, price: 16 }),
                // Exactly 30 days later (Mar 1 to Mar 31), different times
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Should be 30-day match despite time difference
            expect(disposal.matchedPortions[0].matchType).toBe('THIRTY_DAY');
            expectDecimalEqual(disposal.totalCostBasisGBP, 1600);
        });
    });

    describe('Multiple same-day sells', () => {
        it('should allocate aggregated same-day buys proportionally across multiple sells', () => {
            // Critical scenario: Multiple sells on same day with aggregated buys
            // How should 100 shares bought be allocated between two 60-share sells?
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 50, price: 8 }), // Pool
                createBuy({ date: '2024-06-01T09:00:00', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-06-01T10:00:00', asset: 'ABC', quantity: 60, price: 15 }),
                createSell({ date: '2024-06-01T11:00:00', asset: 'ABC', quantity: 60, price: 16 }),
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(2);

            // First disposal: 60 shares
            const disposal1 = result.disposals[0];
            const sameDay1 = disposal1.matchedPortions.find((p) => p.matchType === 'SAME_DAY');
            const pool1 = disposal1.matchedPortions.find((p) => p.matchType === 'SECTION_104');

            // Second disposal: 60 shares
            const disposal2 = result.disposals[1];
            const sameDay2 = disposal2.matchedPortions.find((p) => p.matchType === 'SAME_DAY');
            const pool2 = disposal2.matchedPortions.find((p) => p.matchType === 'SECTION_104');

            // Total same-day usage should equal available (100 shares)
            const totalSameDayUsed = new Decimal(sameDay1?.quantity || 0).plus(sameDay2?.quantity || 0);
            expectDecimalEqual(totalSameDayUsed, 100);

            // Total pool usage should equal what's needed (120 - 100 = 20)
            const totalPoolUsed = new Decimal(pool1?.quantity || 0).plus(pool2?.quantity || 0);
            expectDecimalEqual(totalPoolUsed, 20);
        });

        it('should handle multiple sells with insufficient same-day buys', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 8 }), // Pool
                createBuy({ date: '2024-06-01T09:00:00', asset: 'ABC', quantity: 50, price: 10 }),
                createSell({ date: '2024-06-01T10:00:00', asset: 'ABC', quantity: 60, price: 15 }),
                createSell({ date: '2024-06-01T11:00:00', asset: 'ABC', quantity: 40, price: 16 }),
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(2);

            // Total sells = 100, same-day buys = 50, pool = 100
            // All 50 same-day should be used, 50 from pool
            const disposal1 = result.disposals[0];
            const disposal2 = result.disposals[1];

            const totalSameDayQty = disposal1.matchedPortions
                .concat(disposal2.matchedPortions)
                .filter((p) => p.matchType === 'SAME_DAY')
                .reduce((sum, p) => sum.plus(p.quantity), new Decimal(0));

            const totalPoolQty = disposal1.matchedPortions
                .concat(disposal2.matchedPortions)
                .filter((p) => p.matchType === 'SECTION_104')
                .reduce((sum, p) => sum.plus(p.quantity), new Decimal(0));

            expectDecimalEqual(totalSameDayQty, 50);
            expectDecimalEqual(totalPoolQty, 50);

            // Final pool should have 50 shares remaining (100 - 50)
            expectDecimalEqual(result.finalPoolState.quantity, 50);
        });

        it('should process multiple sells with aggregated same-day buys', () => {
            // Same-day buys (100 shares) are aggregated across all same-day sells
            // Per TCGA92/S105(1): All same-day acquisitions treated as single transaction
            const transactions = [
                createBuy({ date: '2024-06-01T09:00:00', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-06-01T10:00:00', asset: 'ABC', quantity: 60, price: 15 }),
                createSell({ date: '2024-06-01T11:00:00', asset: 'ABC', quantity: 40, price: 16 }),
                // Total sells = 100, total same-day buys = 100
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(2);

            // Same-day matching happens per disposal with shared acquisition pool
            const totalSameDayMatched = result.disposals.reduce((sum, d) => {
                const sameDayQty = d.matchedPortions
                    .filter((p) => p.matchType === 'SAME_DAY')
                    .reduce((s, p) => s.plus(p.quantity), new Decimal(0));
                return sum.plus(sameDayQty);
            }, new Decimal(0));

            // Total same-day matched across both disposals
            expect(totalSameDayMatched.greaterThan(0)).toBe(true);

            // Verify that both disposals have some same-day matching
            const disposal1SameDay = result.disposals[0].matchedPortions.find(
                (p) => p.matchType === 'SAME_DAY'
            );
            const disposal2SameDay = result.disposals[1].matchedPortions.find(
                (p) => p.matchType === 'SAME_DAY'
            );

            expect(disposal1SameDay).toBeDefined();
            expect(disposal2SameDay).toBeDefined();
        });
    });
});
