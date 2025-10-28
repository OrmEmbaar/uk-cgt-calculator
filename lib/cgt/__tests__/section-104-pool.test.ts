import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { calculateCGT } from '../calculator';
import { createBuy, createSell, expectDecimalEqual } from './test-helpers';
import { Transaction } from '../types';

describe('CGT Calculator - Section 104 Pool Mechanics', () => {
    describe('Pool building', () => {
        it('should build pool from single acquisition', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
            ];

            const result = calculateCGT(transactions);

            expectDecimalEqual(result.finalPoolState.quantity, 100);
            expectDecimalEqual(result.finalPoolState.totalCostGBP, 1000);
        });

        it('should accumulate multiple acquisitions over time', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createBuy({ date: '2024-02-01', asset: 'ABC', quantity: 50, price: 12 }),
                createBuy({ date: '2024-03-01', asset: 'ABC', quantity: 150, price: 8 }),
            ];

            const result = calculateCGT(transactions);

            expectDecimalEqual(result.finalPoolState.quantity, 300);
            // Cost = 100*10 + 50*12 + 150*8 = 1000 + 600 + 1200 = 2800
            expectDecimalEqual(result.finalPoolState.totalCostGBP, 2800);
        });

        it('should include fees in pool cost basis', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10, fee: 25 }),
                createBuy({ date: '2024-02-01', asset: 'ABC', quantity: 100, price: 20, fee: 30 }),
            ];

            const result = calculateCGT(transactions);

            expectDecimalEqual(result.finalPoolState.quantity, 200);
            // Cost = (100*10 + 25) + (100*20 + 30) = 1025 + 2030 = 3055
            expectDecimalEqual(result.finalPoolState.totalCostGBP, 3055);
        });
    });

    describe('Average cost calculation', () => {
        it('should calculate correct average cost after multiple buys', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createBuy({ date: '2024-02-01', asset: 'ABC', quantity: 100, price: 20 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 50, price: 25 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Pool average = (1000 + 2000) / 200 = 15
            expectDecimalEqual(disposal.matchedPortions[0].poolAverageCostPerUnit!, 15);
            // Cost for 50 shares = 50 * 15 = 750
            expectDecimalEqual(disposal.totalCostBasisGBP, 750);
        });

        it('should handle weighted averages correctly', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 400, price: 5 }),
                createBuy({ date: '2024-02-01', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Pool average = (400*5 + 100*10) / 500 = 3000 / 500 = 6
            expectDecimalEqual(disposal.matchedPortions[0].poolAverageCostPerUnit!, 6);
            expectDecimalEqual(disposal.totalCostBasisGBP, 600);
        });
    });

    describe('Proportionate cost removal', () => {
        it('should remove proportionate cost on disposal', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 200, price: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 50, price: 15 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Sold 50 out of 200 = 25%
            // Cost removed = 2000 * 0.25 = 500
            expectDecimalEqual(disposal.totalCostBasisGBP, 500);

            // Remaining pool: 150 shares at cost 1500
            expectDecimalEqual(disposal.poolStateAfter.quantity, 150);
            expectDecimalEqual(disposal.poolStateAfter.totalCostGBP, 1500);
        });

        it('should handle multiple partial disposals', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 1000, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 250, price: 12 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 250, price: 15 }),
                createSell({ date: '2024-09-01', asset: 'ABC', quantity: 250, price: 11 }),
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(3);

            // First disposal: 25% of 10000 = 2500
            expectDecimalEqual(result.disposals[0].totalCostBasisGBP, 2500);
            expectDecimalEqual(result.disposals[0].poolStateAfter.quantity, 750);
            expectDecimalEqual(result.disposals[0].poolStateAfter.totalCostGBP, 7500);

            // Second disposal: 250 out of 750 = 1/3 of 7500 = 2500
            expectDecimalEqual(result.disposals[1].totalCostBasisGBP, 2500);
            expectDecimalEqual(result.disposals[1].poolStateAfter.quantity, 500);
            expectDecimalEqual(result.disposals[1].poolStateAfter.totalCostGBP, 5000);

            // Third disposal: 250 out of 500 = 50% of 5000 = 2500
            expectDecimalEqual(result.disposals[2].totalCostBasisGBP, 2500);
            expectDecimalEqual(result.disposals[2].poolStateAfter.quantity, 250);
            expectDecimalEqual(result.disposals[2].poolStateAfter.totalCostGBP, 2500);
        });

        it('should handle complete disposal of pool', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10, fee: 25 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15, fee: 20 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // All cost removed
            expectDecimalEqual(disposal.totalCostBasisGBP, 1025);

            // Pool is now empty
            expectDecimalEqual(disposal.poolStateAfter.quantity, 0);
            expectDecimalEqual(disposal.poolStateAfter.totalCostGBP, 0);
        });
    });

    describe('Pool updates after disposals', () => {
        it('should correctly track pool through buy-sell-buy sequence', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 50, price: 15 }),
                createBuy({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 20 }),
            ];

            const result = calculateCGT(transactions);

            // After first buy: 100 @ £10 = £1000
            // After sell: 50 @ £10 = £500
            // After second buy: 150 total
            //   - 50 @ £10 = £500
            //   - 100 @ £20 = £2000
            //   Total = £2500
            expectDecimalEqual(result.finalPoolState.quantity, 150);
            expectDecimalEqual(result.finalPoolState.totalCostGBP, 2500);
        });

        it('should maintain pool integrity through complex sequence', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createBuy({ date: '2024-02-01', asset: 'ABC', quantity: 100, price: 20 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 50, price: 25 }),
                createBuy({ date: '2024-04-01', asset: 'ABC', quantity: 50, price: 30 }),
                createSell({ date: '2024-05-01', asset: 'ABC', quantity: 100, price: 35 }),
            ];

            const result = calculateCGT(transactions);

            // Starting pool: 100@10 + 100@20 = 3000 (200 shares)
            // After 1st sell: 150 shares, cost = 3000 * (150/200) = 2250
            // After buy: 200 shares, cost = 2250 + 50*30 = 3750
            // After 2nd sell: 100 shares, cost = 3750 * (100/200) = 1875
            expectDecimalEqual(result.finalPoolState.quantity, 100);
            expectDecimalEqual(result.finalPoolState.totalCostGBP, 1875);
        });
    });

    describe('Pool with different currencies', () => {
        it('should convert all acquisitions to GBP in pool', () => {
            const transactions = [
                createBuy({
                    date: '2024-01-01',
                    asset: 'ABC',
                    quantity: 100,
                    price: 10,
                    currency: 'USD',
                    exchangeRate: 0.8,
                }),
                createBuy({
                    date: '2024-02-01',
                    asset: 'ABC',
                    quantity: 100,
                    price: 15,
                    currency: 'EUR',
                    exchangeRate: 0.85,
                }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 20 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Pool cost in GBP:
            // USD: 100 * 10 * 0.8 = 800
            // EUR: 100 * 15 * 0.85 = 1275
            // Total = 2075 for 200 shares
            // Average = 10.375
            expectDecimalEqual(disposal.matchedPortions[0].poolAverageCostPerUnit!, 10.375);
            expectDecimalEqual(disposal.totalCostBasisGBP, 1037.5);
        });
    });

    describe('Pool precision and rounding', () => {
        it('should handle fractional costs correctly', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 3, price: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 1, price: 15 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Average cost = 30 / 3 = 10
            // Cost for 1 share = 30 * (1/3) = 10
            expectDecimalEqual(disposal.totalCostBasisGBP, 10);

            // Remaining: 2 shares at cost 20
            expectDecimalEqual(disposal.poolStateAfter.quantity, 2);
            expectDecimalEqual(disposal.poolStateAfter.totalCostGBP, 20);
        });

        it('should maintain precision through multiple operations', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 7, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 3, price: 12 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 2, price: 15 }),
            ];

            const result = calculateCGT(transactions);

            // Initial: 7 shares at £70
            // After 1st sell: 4 shares at £70 * (4/7) = £40
            const pool1 = result.disposals[0].poolStateAfter;
            expectDecimalEqual(pool1.quantity, 4);
            expectDecimalEqual(pool1.totalCostGBP, 40);

            // After 2nd sell: 2 shares at £40 * (2/4) = £20
            const pool2 = result.disposals[1].poolStateAfter;
            expectDecimalEqual(pool2.quantity, 2);
            expectDecimalEqual(pool2.totalCostGBP, 20);
        });

        it('should round fractional pennies correctly to 2 decimal places', () => {
            // Test with prices that create fractional penny amounts
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 3, price: 10.333 }),
                createBuy({ date: '2024-02-01', asset: 'ABC', quantity: 7, price: 8.571 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 4, price: 12.5 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Pool cost = 3 * 10.333 + 7 * 8.571 = 30.999 + 59.997 = 90.996
            // The cost is NOT rounded at pool level, only when calculating gains
            // Average = 90.996 / 10 = 9.0996
            // Cost for 4 shares = 90.996 * (4/10) = 36.3984 → £36.40 (rounded)
            expectDecimalEqual(disposal.totalCostBasisGBP, 36.4);

            // Proceeds = 4 * 12.5 = 50.00
            expectDecimalEqual(disposal.totalProceedsGBP, 50.0);

            // Gain = 50.00 - 36.40 = 13.60
            expectDecimalEqual(disposal.totalGainLossGBP, 13.6);

            // Remaining pool: 6 shares at 90.996 - 36.3984 = 54.5976 (not rounded)
            expectDecimalEqual(disposal.poolStateAfter.quantity, 6);
            expectDecimalEqual(disposal.poolStateAfter.totalCostGBP, 54.5976);
        });

        it('should handle recurring decimals in cost basis calculations', () => {
            // Test division that creates recurring decimals (1/3 = 0.333...)
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 3, price: 100 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 1, price: 150 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Pool cost = 300
            // Cost for 1 share = 300 / 3 = 100 (exact)
            expectDecimalEqual(disposal.totalCostBasisGBP, 100.0);

            // Remaining: 2 shares at 200
            expectDecimalEqual(disposal.poolStateAfter.totalCostGBP, 200.0);
        });

        it('should accumulate rounding errors minimally over many transactions', () => {
            // Test that rounding doesn't cause significant drift over many operations
            // This verifies the rounding policy:
            // - Pool costs are kept at high precision internally (not rounded)
            // - Only reported gains/losses are rounded to 2dp (pence precision)
            const transactions: Transaction[] = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 1000, price: 9.999 }),
            ];

            // Sell in 100 batches of 10 shares each, spread across valid calendar months
            // Jan-Apr: days 1-30 (4 months × 30 days = 120 slots, we use 100)
            for (let i = 0; i < 100; i++) {
                const month = Math.floor(i / 30) + 1; // Months 1-4
                const day = (i % 30) + 1; // Days 1-30
                transactions.push(
                    createSell({
                        date: `2024-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                        asset: 'ABC',
                        quantity: 10,
                        price: 15,
                    })
                );
            }

            const result = calculateCGT(transactions);

            // All shares should be sold
            expectDecimalEqual(result.finalPoolState.quantity, 0);

            // Pool should be completely depleted (no cost remaining)
            expectDecimalEqual(result.finalPoolState.totalCostGBP, 0);

            // Critical: Total cost basis across all disposals should equal original purchase
            // This verifies that rounding errors don't accumulate significantly
            const totalCostBasis = result.disposals.reduce(
                (sum, d) => sum.plus(d.totalCostBasisGBP),
                new Decimal(0)
            );
            expectDecimalEqual(totalCostBasis, 9999.0); // 1000 * 9.999 = 9999
        });
    });

    describe('Empty pool scenarios', () => {
        it('should handle complete exit and re-entry', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-06-01', asset: 'ABC', quantity: 200, price: 20 }), // More than 30 days later
            ];

            const result = calculateCGT(transactions);

            // First disposal from original pool
            expectDecimalEqual(result.disposals[0].totalCostBasisGBP, 1000);

            // Pool was empty, then rebuilt with new purchase
            expectDecimalEqual(result.finalPoolState.quantity, 200);
            expectDecimalEqual(result.finalPoolState.totalCostGBP, 4000);
        });
    });
});
