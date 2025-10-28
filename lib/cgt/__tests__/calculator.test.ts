import { describe, it, expect } from 'vitest';
import { calculateCGT } from '../calculator';
import { createBuy, createSell, expectDecimalEqual } from './test-helpers';

describe('CGT Calculator - Basic Functionality', () => {
    describe('Simple buy and sell from pool', () => {
        it('should calculate gain for simple buy and sell', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15 }),
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(1);

            const disposal = result.disposals[0];
            expectDecimalEqual(disposal.totalProceedsGBP, 1500); // 100 * 15
            expectDecimalEqual(disposal.totalCostBasisGBP, 1000); // 100 * 10
            expectDecimalEqual(disposal.totalGainLossGBP, 500); // Gain of 500

            expect(disposal.matchedPortions).toHaveLength(1);
            expect(disposal.matchedPortions[0].matchType).toBe('SECTION_104');
            expectDecimalEqual(disposal.matchedPortions[0].quantity, 100);
        });

        it('should calculate loss for simple buy and sell', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 15 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 10 }),
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(1);

            const disposal = result.disposals[0];
            expectDecimalEqual(disposal.totalGainLossGBP, -500); // Loss of 500
        });

        it('should handle partial disposal from pool', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 50, price: 15 }),
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(1);

            const disposal = result.disposals[0];
            expectDecimalEqual(disposal.totalProceedsGBP, 750); // 50 * 15
            expectDecimalEqual(disposal.totalCostBasisGBP, 500); // 50 * 10
            expectDecimalEqual(disposal.totalGainLossGBP, 250);

            // Pool should have 50 shares remaining
            expectDecimalEqual(disposal.poolStateAfter.quantity, 50);
            expectDecimalEqual(disposal.poolStateAfter.totalCostGBP, 500);
        });

        it('should handle multiple acquisitions at different prices', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createBuy({ date: '2024-02-01', asset: 'ABC', quantity: 100, price: 20 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 25 }),
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(1);

            const disposal = result.disposals[0];

            // Pool average cost = (1000 + 2000) / 200 = 15
            // Cost basis for 100 shares = 100 * 15 = 1500
            expectDecimalEqual(disposal.totalCostBasisGBP, 1500);
            expectDecimalEqual(disposal.totalProceedsGBP, 2500); // 100 * 25
            expectDecimalEqual(disposal.totalGainLossGBP, 1000);

            // Pool should have 100 shares remaining at cost 1500
            expectDecimalEqual(disposal.poolStateAfter.quantity, 100);
            expectDecimalEqual(disposal.poolStateAfter.totalCostGBP, 1500);
        });
    });

    describe('Fee handling', () => {
        it('should add fees to cost basis for buys', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10, fee: 25 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Cost = 100 * 10 + 25 = 1025
            expectDecimalEqual(disposal.totalCostBasisGBP, 1025);
            expectDecimalEqual(disposal.totalProceedsGBP, 1500);
            expectDecimalEqual(disposal.totalGainLossGBP, 475); // 1500 - 1025
        });

        it('should subtract fees from proceeds for sells', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15, fee: 25 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            expectDecimalEqual(disposal.totalCostBasisGBP, 1000);
            // Proceeds = 100 * 15 - 25 = 1475
            expectDecimalEqual(disposal.totalProceedsGBP, 1475);
            expectDecimalEqual(disposal.totalGainLossGBP, 475);
        });

        it('should handle fees on both buy and sell', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10, fee: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15, fee: 15 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Cost = 100 * 10 + 10 = 1010
            expectDecimalEqual(disposal.totalCostBasisGBP, 1010);
            // Proceeds = 100 * 15 - 15 = 1485
            expectDecimalEqual(disposal.totalProceedsGBP, 1485);
            expectDecimalEqual(disposal.totalGainLossGBP, 475);
        });
    });

    describe('Multi-currency transactions', () => {
        it('should convert USD to GBP using exchange rate', () => {
            const transactions = [
                createBuy({
                    date: '2024-01-01',
                    asset: 'ABC',
                    quantity: 100,
                    price: 10,
                    currency: 'USD',
                    exchangeRate: 0.8,
                    fee: 5,
                }),
                createSell({
                    date: '2024-06-01',
                    asset: 'ABC',
                    quantity: 100,
                    price: 15,
                    currency: 'USD',
                    exchangeRate: 0.75,
                    fee: 10,
                }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Cost in GBP = (100 * 10 + 5) * 0.8 = 1005 * 0.8 = 804
            expectDecimalEqual(disposal.totalCostBasisGBP, 804);
            // Proceeds in GBP = (100 * 15 - 10) * 0.75 = 1490 * 0.75 = 1117.5
            expectDecimalEqual(disposal.totalProceedsGBP, 1117.5);
            expectDecimalEqual(disposal.totalGainLossGBP, 313.5);
        });

        it('should handle mixed currencies in pool', () => {
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
                createSell({
                    date: '2024-06-01',
                    asset: 'ABC',
                    quantity: 100,
                    price: 20,
                    currency: 'GBP',
                    exchangeRate: 1.0,
                }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Cost in pool:
            // USD: 100 * 10 * 0.8 = 800
            // EUR: 100 * 15 * 0.85 = 1275
            // Total pool cost = 2075
            // Average per share = 2075 / 200 = 10.375
            // Cost basis for 100 shares = 1037.5
            expectDecimalEqual(disposal.totalCostBasisGBP, 1037.5);
            expectDecimalEqual(disposal.totalProceedsGBP, 2000);
            expectDecimalEqual(disposal.totalGainLossGBP, 962.5);
        });
    });

    describe('Multiple disposals', () => {
        it('should handle multiple sales from same pool', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 200, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 50, price: 15 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 50, price: 20 }),
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(2);

            // First disposal
            expectDecimalEqual(result.disposals[0].totalCostBasisGBP, 500); // 50 * 10
            expectDecimalEqual(result.disposals[0].totalProceedsGBP, 750); // 50 * 15
            expectDecimalEqual(result.disposals[0].totalGainLossGBP, 250);

            // Second disposal
            expectDecimalEqual(result.disposals[1].totalCostBasisGBP, 500); // 50 * 10
            expectDecimalEqual(result.disposals[1].totalProceedsGBP, 1000); // 50 * 20
            expectDecimalEqual(result.disposals[1].totalGainLossGBP, 500);

            // Final pool should have 100 shares
            expectDecimalEqual(result.finalPoolState.quantity, 100);
        });
    });

    describe('Summary statistics', () => {
        it('should calculate total gains and losses correctly', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 300, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15 }), // Gain
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 8 }), // Loss
            ];

            const result = calculateCGT(transactions);

            expectDecimalEqual(result.totalGains, 500); // 100 * (15 - 10)
            expectDecimalEqual(result.totalLosses, 200); // 100 * (10 - 8)
            expectDecimalEqual(result.netGainLoss, 300); // 500 - 200
        });
    });

    describe('Validation', () => {
        it('should error when trying to sell shares not owned', () => {
            const transactions = [
                createSell({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 15 }),
            ];

            expect(() => calculateCGT(transactions)).toThrow(/Cannot sell 100 shares/);
        });

        it('should error when trying to sell more shares than owned', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 50, price: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15 }),
            ];

            expect(() => calculateCGT(transactions)).toThrow(
                /Cannot sell 100 shares.*only 50 shares available/
            );
        });

        it('should provide detailed error message showing available shares by source', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 30, price: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-06-01', asset: 'ABC', quantity: 20, price: 12 }), // Same-day
                createBuy({ date: '2024-06-15', asset: 'ABC', quantity: 10, price: 14 }), // 30-day
            ];

            try {
                calculateCGT(transactions);
                throw new Error('Should have thrown an error');
            } catch (error) {
                // Verify error message contains breakdown
                const errorMessage = (error as Error).message;
                expect(errorMessage).toContain('Cannot sell 100 shares');
                expect(errorMessage).toContain('60 shares available'); // 20 + 10 + 30
                expect(errorMessage).toContain('same-day');
                expect(errorMessage).toContain('30-day');
                expect(errorMessage).toContain('pool');
            }
        });

        it('should allow selling exact quantity owned', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15 }),
            ];

            const result = calculateCGT(transactions);
            expect(result.disposals).toHaveLength(1);
            expectDecimalEqual(result.finalPoolState.quantity, 0);
        });

        it('should handle zero quantity transactions gracefully', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 0, price: 15 }),
            ];

            const result = calculateCGT(transactions);
            // Zero quantity sell should be ignored or handled appropriately
            expect(result.disposals).toHaveLength(1);
            expectDecimalEqual(result.disposals[0].totalProceedsGBP, 0);
            expectDecimalEqual(result.disposals[0].totalCostBasisGBP, 0);
        });

        it('should handle very small quantities (fractional shares)', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 0.001, price: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 0.001, price: 15 }),
            ];

            const result = calculateCGT(transactions);
            expect(result.disposals).toHaveLength(1);
            expectDecimalEqual(result.disposals[0].totalProceedsGBP, 0.02); // Rounded to pence
            expectDecimalEqual(result.disposals[0].totalCostBasisGBP, 0.01);
        });

        it('should handle transactions with zero price (e.g., gifted shares)', () => {
            // Note: This tests technical capability; actual tax rules for gifts differ
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 0 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15 }),
            ];

            const result = calculateCGT(transactions);
            expectDecimalEqual(result.disposals[0].totalCostBasisGBP, 0);
            expectDecimalEqual(result.disposals[0].totalProceedsGBP, 1500);
            expectDecimalEqual(result.disposals[0].totalGainLossGBP, 1500);
        });

        it('should handle transactions with very high precision prices', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10.123456789 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15.987654321 }),
            ];

            const result = calculateCGT(transactions);
            // Should round to 2 decimal places (pence precision)
            expectDecimalEqual(result.disposals[0].totalCostBasisGBP, 1012.35); // Rounded
            expectDecimalEqual(result.disposals[0].totalProceedsGBP, 1598.77); // Rounded
        });
    });
});
