import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { calculateCGT } from '../calculator';
import { createBuy, createSell, expectDecimalEqual } from './test-helpers';

describe('CGT Calculator - 30-Day Bed and Breakfasting Rule', () => {
    describe('Example 1 from HMRC guidance - Full disposal and buyback', () => {
        it('should match full disposal with buyback within 30 days', () => {
            // Originally bought 1,000 shares at £10
            // Sold all 1,000 on 10 March at £15
            // Bought back 1,000 on 20 March at £15.10
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 1000, price: 10 }),
                createSell({ date: '2024-03-10', asset: 'ABC', quantity: 1000, price: 15 }),
                createBuy({ date: '2024-03-20', asset: 'ABC', quantity: 1000, price: 15.1 }), // 10 days later
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(1);

            const disposal = result.disposals[0];

            // Should be matched with the 30-day repurchase
            expect(disposal.matchedPortions).toHaveLength(1);
            expect(disposal.matchedPortions[0].matchType).toBe('THIRTY_DAY');

            // Proceeds = 1000 * £15 = £15,000
            expectDecimalEqual(disposal.totalProceedsGBP, 15000);

            // Cost basis = 1000 * £15.10 = £15,100 (from the repurchase!)
            expectDecimalEqual(disposal.totalCostBasisGBP, 15100);

            // Loss = £15,000 - £15,100 = -£100
            expectDecimalEqual(disposal.totalGainLossGBP, -100);
        });
    });

    describe('Example 2 from HMRC guidance - Partial disposal with buyback', () => {
        it('should match partial disposal with 30-day rule and pool', () => {
            // Based on HMRC Helpsheet 284 Example 2 (hs284.txt lines 48-57):
            // "Mr B has a Section 104 holding of 2,500 ordinary 10p shares in Y plc.
            //  On 27 March 2012 he sells 1,700 shares.
            //  On 30 March 2012 he buys another 500 10p shares in Y plc.
            //  The later acquisition of 500 shares does not become part of the Section 104 holding.
            //  They are identified with 500 of the shares disposed of on 27 March.
            //  The remaining 1,200 shares sold are identified with part of the Section 104 holding."
            //
            // NOTE: HS284 does not specify purchase prices or expected gains/losses.
            // This test uses assumed values to verify the matching logic:
            // - Initial holding cost: £2/share (£5,000 total)
            // - Sale price: £3/share
            // - Repurchase price: £2.90/share
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'XYZ', quantity: 2500, price: 2 }),
                createSell({ date: '2024-06-01', asset: 'XYZ', quantity: 1700, price: 3 }),
                createBuy({ date: '2024-06-05', asset: 'XYZ', quantity: 500, price: 2.9 }), // 4 days later (within 30 days)
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(1);

            const disposal = result.disposals[0];

            // Verify HMRC rule application: 500 from 30-day, 1200 from pool
            expect(disposal.matchedPortions).toHaveLength(2);

            // Verify 30-day match for 500 shares (per HS284 Example 2)
            const thirtyDayPortion = disposal.matchedPortions.find((p) => p.matchType === 'THIRTY_DAY');
            expect(thirtyDayPortion).toBeDefined();
            expectDecimalEqual(thirtyDayPortion!.quantity, 500);
            expectDecimalEqual(thirtyDayPortion!.proceedsGBP, 1500); // 500 * £3
            expectDecimalEqual(thirtyDayPortion!.costBasisGBP, 1450); // 500 * £2.90
            expectDecimalEqual(thirtyDayPortion!.gainLossGBP, 50); // £1,500 - £1,450

            // Verify pool match for remaining 1200 shares (per HS284 Example 2)
            const poolPortion = disposal.matchedPortions.find((p) => p.matchType === 'SECTION_104');
            expect(poolPortion).toBeDefined();
            expectDecimalEqual(poolPortion!.quantity, 1200);
            expectDecimalEqual(poolPortion!.proceedsGBP, 3600); // 1200 * £3
            expectDecimalEqual(poolPortion!.costBasisGBP, 2400); // 1200 * £2
            expectDecimalEqual(poolPortion!.gainLossGBP, 1200); // £3,600 - £2,400

            // Total gain (using assumed prices)
            expectDecimalEqual(disposal.totalGainLossGBP, 1250); // £50 + £1,200
        });
    });

    describe('30-day window boundaries', () => {
        it('should match buyback on day 30 (inclusive)', () => {
            const transactions = [
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-03-31', asset: 'ABC', quantity: 100, price: 16 }), // Exactly 30 days later
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            expect(disposal.matchedPortions[0].matchType).toBe('THIRTY_DAY');
            expectDecimalEqual(disposal.totalCostBasisGBP, 1600);
        });

        it('should NOT match buyback on day 31 (beyond window)', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-04-01', asset: 'ABC', quantity: 100, price: 16 }), // 31 days later
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Should match from pool (original buy), not the later buy
            expect(disposal.matchedPortions[0].matchType).toBe('SECTION_104');
            expectDecimalEqual(disposal.totalCostBasisGBP, 1000); // Original £10 cost
        });

        it('HMRC CG51560 Example 3 - Acquisition beyond 30 days (non-leap year)', () => {
            // Mrs C has a Section 104 holding of 10,000 ordinary 25p shares in Z plc.
            // On 28 February 2009 she sells 2,000 shares.
            // On 31 March 2009 she buys another 3,000 of the same shares.
            // The acquisition is NOT within 30 days (31 days in non-leap year February)
            const transactions = [
                createBuy({ date: '2009-01-01', asset: 'ZPL', quantity: 10000, price: 1 }),
                createSell({ date: '2009-02-28', asset: 'ZPL', quantity: 2000, price: 1.5 }),
                createBuy({ date: '2009-03-31', asset: 'ZPL', quantity: 3000, price: 1.6 }),
                // 31 days after disposal (Feb 2009 has 28 days)
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Should match from pool (Section 104), NOT 30-day rule
            expect(disposal.matchedPortions).toHaveLength(1);
            expect(disposal.matchedPortions[0].matchType).toBe('SECTION_104');

            // Cost basis: 2000 shares from pool at £1 each = £2000
            expectDecimalEqual(disposal.totalCostBasisGBP, 2000);
            expectDecimalEqual(disposal.totalProceedsGBP, 3000); // 2000 * £1.50

            // Final pool: (10000 - 2000) + 3000 = 11000 shares
            expectDecimalEqual(result.finalPoolState.quantity, 11000);
            // Cost: (10000 * £1 - 2000 * £1) + 3000 * £1.6 = £8000 + £4800 = £12800
            expectDecimalEqual(result.finalPoolState.totalCostGBP, 12800);
        });

        it('HMRC CG51560 Example 3 variation - Leap year (day 31 still beyond window)', () => {
            // Same scenario but in 2024 (leap year) to verify Feb 29 handling
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ZPL', quantity: 10000, price: 1 }),
                createSell({ date: '2024-02-28', asset: 'ZPL', quantity: 2000, price: 1.5 }),
                createBuy({ date: '2024-03-30', asset: 'ZPL', quantity: 3000, price: 1.6 }),
                // 31 days after disposal (Feb 2024 has 29 days, so Mar 30 is day 31)
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Should match from pool, NOT 30-day rule
            expect(disposal.matchedPortions[0].matchType).toBe('SECTION_104');
            expectDecimalEqual(disposal.totalCostBasisGBP, 2000);
        });
    });

    describe('Multiple buybacks within 30 days', () => {
        it('should match multiple buybacks in FIFO order', () => {
            const transactions = [
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-03-10', asset: 'ABC', quantity: 30, price: 14 }), // 9 days later
                createBuy({ date: '2024-03-20', asset: 'ABC', quantity: 40, price: 16 }), // 19 days later
                createBuy({ date: '2024-03-25', asset: 'ABC', quantity: 30, price: 17 }), // 24 days later
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // All should be 30-day matches in FIFO order
            const thirtyDayPortions = disposal.matchedPortions.filter(
                (p) => p.matchType === 'THIRTY_DAY'
            );
            expect(thirtyDayPortions).toHaveLength(3);

            // First match: 30 shares at £14
            expectDecimalEqual(thirtyDayPortions[0].quantity, 30);
            expectDecimalEqual(thirtyDayPortions[0].costBasisGBP, 420);

            // Second match: 40 shares at £16
            expectDecimalEqual(thirtyDayPortions[1].quantity, 40);
            expectDecimalEqual(thirtyDayPortions[1].costBasisGBP, 640);

            // Third match: 30 shares at £17
            expectDecimalEqual(thirtyDayPortions[2].quantity, 30);
            expectDecimalEqual(thirtyDayPortions[2].costBasisGBP, 510);

            // Total cost = 420 + 640 + 510 = 1570
            expectDecimalEqual(disposal.totalCostBasisGBP, 1570);
        });

        it('should match partial quantities from multiple buybacks', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 20, price: 12 }), // Need at least 20 in pool
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-03-10', asset: 'ABC', quantity: 50, price: 14 }),
                createBuy({ date: '2024-03-20', asset: 'ABC', quantity: 30, price: 16 }),
                // 80 bought back within 30 days, 20 from pool
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            expect(disposal.matchedPortions).toHaveLength(3);

            // 30-day matches for 80 shares
            const thirtyDayPortions = disposal.matchedPortions.filter(
                (p) => p.matchType === 'THIRTY_DAY'
            );
            expect(thirtyDayPortions).toHaveLength(2);
            expectDecimalEqual(thirtyDayPortions[0].quantity, 50);
            expectDecimalEqual(thirtyDayPortions[1].quantity, 30);

            // Pool match for remaining 20
            const poolPortion = disposal.matchedPortions.find((p) => p.matchType === 'SECTION_104');
            expect(poolPortion).toBeDefined();
            expectDecimalEqual(poolPortion!.quantity, 20);
        });
    });

    describe('30-day rule prevents gain crystallization', () => {
        it('should defer gain when selling at profit then buying back', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 20 }), // Big gain
                createBuy({ date: '2024-03-15', asset: 'ABC', quantity: 100, price: 21 }), // Bought back slightly higher
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Without 30-day rule, gain would be 100 * (20 - 10) = 1000
            // With 30-day rule, using £21 cost basis
            expect(disposal.matchedPortions[0].matchType).toBe('THIRTY_DAY');
            expectDecimalEqual(disposal.totalCostBasisGBP, 2100); // 100 * £21
            expectDecimalEqual(disposal.totalProceedsGBP, 2000); // 100 * £20
            expectDecimalEqual(disposal.totalGainLossGBP, -100); // Actually shows a loss!

            // The original £10/share cost is effectively deferred
        });

        it('should create artificial loss when repurchase price is higher', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 100 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 150 }), // Sold at profit
                createBuy({ date: '2024-03-10', asset: 'ABC', quantity: 100, price: 155 }), // Bought back even higher
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            expectDecimalEqual(disposal.totalGainLossGBP, -500); // £15,000 - £15,500
        });
    });

    describe('30-day rule with different currencies', () => {
        it('should apply 30-day rule with currency conversion', () => {
            const transactions = [
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({
                    date: '2024-03-15',
                    asset: 'ABC',
                    quantity: 100,
                    price: 20,
                    currency: 'USD',
                    exchangeRate: 0.8, // $1 = £0.80
                }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            expect(disposal.matchedPortions[0].matchType).toBe('THIRTY_DAY');
            // Cost in GBP = 100 * 20 * 0.8 = 1600
            expectDecimalEqual(disposal.totalCostBasisGBP, 1600);
            expectDecimalEqual(disposal.totalProceedsGBP, 1500);
            expectDecimalEqual(disposal.totalGainLossGBP, -100);
        });
    });

    describe('30-day rule with fees', () => {
        it('should include fees in 30-day matching', () => {
            const transactions = [
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15, fee: 20 }),
                createBuy({ date: '2024-03-15', asset: 'ABC', quantity: 100, price: 16, fee: 25 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            expect(disposal.matchedPortions[0].matchType).toBe('THIRTY_DAY');
            // Cost = 100 * 16 + 25 = 1625
            expectDecimalEqual(disposal.totalCostBasisGBP, 1625);
            // Proceeds = 100 * 15 - 20 = 1480
            expectDecimalEqual(disposal.totalProceedsGBP, 1480);
            expectDecimalEqual(disposal.totalGainLossGBP, -145);
        });

        it('should split disposal fee proportionally across same-day, 30-day, and pool matches', () => {
            // Critical test: Verify fee allocation when disposal is matched across multiple types
            // Sell 100 shares matched as: 30 same-day, 20 30-day, 50 pool
            // Fee of £30 should split: £9 (30%), £6 (20%), £15 (50%)
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 50, price: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15, fee: 30 }),
                createBuy({ date: '2024-06-01', asset: 'ABC', quantity: 30, price: 12 }),
                createBuy({ date: '2024-06-15', asset: 'ABC', quantity: 20, price: 14 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Verify all three match types are present
            expect(disposal.matchedPortions).toHaveLength(3);

            const sameDay = disposal.matchedPortions.find((p) => p.matchType === 'SAME_DAY')!;
            const thirtyDay = disposal.matchedPortions.find((p) => p.matchType === 'THIRTY_DAY')!;
            const pool = disposal.matchedPortions.find((p) => p.matchType === 'SECTION_104')!;

            expect(sameDay).toBeDefined();
            expect(thirtyDay).toBeDefined();
            expect(pool).toBeDefined();

            // Verify quantities
            expectDecimalEqual(sameDay.quantity, 30);
            expectDecimalEqual(thirtyDay.quantity, 20);
            expectDecimalEqual(pool.quantity, 50);

            // Verify same-day portion (30 shares, £12 each)
            // Cost = 30 * 12 = £360
            expectDecimalEqual(sameDay.costBasisGBP, 360);
            // Proceeds = 30 * 15 - (30/100 * 30) = 450 - 9 = £441
            expectDecimalEqual(sameDay.proceedsGBP, 441);
            expectDecimalEqual(sameDay.gainLossGBP, 81); // 441 - 360

            // Verify 30-day portion (20 shares, £14 each)
            // Cost = 20 * 14 = £280
            expectDecimalEqual(thirtyDay.costBasisGBP, 280);
            // Proceeds = 20 * 15 - (20/100 * 30) = 300 - 6 = £294
            expectDecimalEqual(thirtyDay.proceedsGBP, 294);
            expectDecimalEqual(thirtyDay.gainLossGBP, 14); // 294 - 280

            // Verify pool portion (50 shares from pool @ £10 each)
            // Cost = 50 * 10 = £500
            expectDecimalEqual(pool.costBasisGBP, 500);
            // Proceeds = 50 * 15 - (50/100 * 30) = 750 - 15 = £735
            expectDecimalEqual(pool.proceedsGBP, 735);
            expectDecimalEqual(pool.gainLossGBP, 235); // 735 - 500

            // Verify total proceeds (proceeds include the fee deduction)
            // Total proceeds before fee: 100 * 15 = 1500
            // Total proceeds after fee: 441 + 294 + 735 = 1470
            // Fee deducted: 1500 - 1470 = 30 ✓
            const totalProceeds = new Decimal(441).plus(294).plus(735);
            expectDecimalEqual(totalProceeds, 1470); // 1500 - 30

            // Verify total gain: 81 + 14 + 235 = 330
            expectDecimalEqual(disposal.totalGainLossGBP, 330);
        });
    });

    describe('Later acquisitions fallback (HS284) to allow short selling', () => {
        it('should match with later acquisitions when pool and 30-day are insufficient', () => {
            const transactions = [
                // Sell first with no prior holdings
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15 }),
                // Buy beyond 30 days (fallback)
                createBuy({ date: '2024-04-15', asset: 'ABC', quantity: 100, price: 17 }), // 45 days after
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Should be matched entirely with later acquisitions
            expect(disposal.matchedPortions).toHaveLength(1);
            expect(disposal.matchedPortions[0].matchType).toBe('LATER');
            expectDecimalEqual(disposal.matchedPortions[0].quantity, 100);
            // Cost basis = 100 * 17
            expectDecimalEqual(disposal.totalCostBasisGBP, 1700);
            // Proceeds = 100 * 15
            expectDecimalEqual(disposal.totalProceedsGBP, 1500);
            expectDecimalEqual(disposal.totalGainLossGBP, -200);

            // Later acquisition joins the pool (shares physically exist even though matched for cost basis)
            // Similar to 30-day rule, later-matched shares eventually become part of Section 104
            expectDecimalEqual(result.finalPoolState.quantity, 100);
            expectDecimalEqual(result.finalPoolState.totalCostGBP, 1700);
        });

        it('should handle partial short: pool covers some, remainder from later acquisitions', () => {
            const transactions = [
                // Initial pool 50 @ 10
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 50, price: 10 }),
                // Sell 100 (50 short)
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15 }),
                // Buy 70 on day 45 (beyond 30 days)
                createBuy({ date: '2024-04-15', asset: 'ABC', quantity: 70, price: 20 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Expect two matched portions: 50 from pool (SECTION_104), 50 from later acquisitions (LATER)
            const later = disposal.matchedPortions.find((p) => p.matchType === 'LATER');
            const poolPortion = disposal.matchedPortions.find((p) => p.matchType === 'SECTION_104');
            expect(later).toBeDefined();
            expect(poolPortion).toBeDefined();
            expectDecimalEqual(later!.quantity, 50);
            expectDecimalEqual(poolPortion!.quantity, 50);

            // Final pool calculation:
            // - Start: 50 in pool @ £10 each = £500
            // - Sell 100: pool reduced by min(100, 50) = 50 → pool now 0
            // - Buy 70 @ £20: added to pool in full (later-matched acquisitions join pool)
            // - Final: 70 shares @ £1400
            expectDecimalEqual(result.finalPoolState.quantity, 70);
            expectDecimalEqual(result.finalPoolState.totalCostGBP, 1400); // 70 * £20
        });
    });

    describe('Complex 30-day scenarios', () => {
        it('should handle multiple disposals with overlapping 30-day windows', () => {
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 1000, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15 }),
                createSell({ date: '2024-03-10', asset: 'ABC', quantity: 100, price: 16 }),
                createBuy({ date: '2024-03-20', asset: 'ABC', quantity: 150, price: 17 }), // Within 30 days of both sales
            ];

            const result = calculateCGT(transactions);

            expect(result.disposals).toHaveLength(2);

            // First disposal: 100 shares matched with first 100 of the buyback
            const disposal1 = result.disposals[0];
            expect(disposal1.matchedPortions[0].matchType).toBe('THIRTY_DAY');
            expectDecimalEqual(disposal1.matchedPortions[0].quantity, 100);
            expectDecimalEqual(disposal1.totalCostBasisGBP, 1700); // 100 * £17

            // Second disposal: 50 matched with 30-day (remaining from buyback), 50 from pool
            const disposal2 = result.disposals[1];
            const thirtyDayPortion = disposal2.matchedPortions.find((p) => p.matchType === 'THIRTY_DAY');
            expect(thirtyDayPortion).toBeDefined();
            expectDecimalEqual(thirtyDayPortion!.quantity, 50);

            const poolPortion = disposal2.matchedPortions.find((p) => p.matchType === 'SECTION_104');
            expect(poolPortion).toBeDefined();
            expectDecimalEqual(poolPortion!.quantity, 50);
        });

        it('should not match purchases BEFORE the disposal', () => {
            const transactions = [
                createBuy({ date: '2024-02-01', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-02-25', asset: 'ABC', quantity: 100, price: 20 }), // Before disposal, but close
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Should match from pool (average of the two buys)
            // Pool has 200 shares at total cost (1000 + 2000) = 3000
            // Average = £15 per share
            expect(disposal.matchedPortions[0].matchType).toBe('SECTION_104');
            expectDecimalEqual(disposal.totalCostBasisGBP, 1500); // 100 * £15

            // NOT £2000 which would be if it used the £20 buy
        });
    });

    describe('30-day matched acquisitions and pool mechanics', () => {
        it('should NOT step up pool basis when 30-day matched shares are added', () => {
            // CRITICAL: The 30-day rule prevents basis step-up
            // You cannot sell at £15 (vs £10 cost) and rebuy at £20 to get a new £20 basis
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 200, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-03-15', asset: 'ABC', quantity: 100, price: 20 }),
            ];

            const result = calculateCGT(transactions);

            // For the disposal, cost basis is £20/share (30-day rule applies)
            expectDecimalEqual(result.disposals[0].totalCostBasisGBP, 2000);
            expectDecimalEqual(result.disposals[0].totalProceedsGBP, 1500);
            expectDecimalEqual(result.disposals[0].totalGainLossGBP, -500);

            // Final pool should have 200 shares total
            expectDecimalEqual(result.finalPoolState.quantity, 200);

            // BUT: Pool cost should NOT be stepped up to £3000 (which would imply £15/share average)
            // HMRC would not allow the £10→£20 basis step-up
            // The latent gain from £10→£15 should remain embedded
            //
            // NOTE: The exact pool cost depends on implementation approach:
            // - If 30-day shares are ring-fenced: pool might show only the 100 unsold @ £10
            // - If 30-day shares join at original cost: pool shows 200 @ £10 average
            // What's NOT allowed: pool showing 200 shares at £3000 (£15 average)
            //
            // For now, we verify the pool is NOT stepped up to £3000
            expect(result.finalPoolState.totalCostGBP.lessThan(3000)).toBe(true);
        });

        it('should NOT allow basis step-up through partial 30-day matching', () => {
            // Even when only part of the buyback is used for 30-day matching,
            // you cannot step up the pool's average cost
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 50, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 50, price: 15 }),
                createBuy({ date: '2024-03-15', asset: 'ABC', quantity: 100, price: 20 }),
            ];

            const result = calculateCGT(transactions);

            // Disposal uses 30-day cost of £20/share
            expectDecimalEqual(result.disposals[0].totalCostBasisGBP, 1000);
            expectDecimalEqual(result.disposals[0].totalProceedsGBP, 750);

            // Pool has shares, but NOT at stepped-up £20 cost
            expectDecimalEqual(result.finalPoolState.quantity, 100);

            // Pool cost should NOT be £2000 (which would give £20/share basis going forward)
            // That would be a tax-free basis step-up from £10 to £20
            expect(result.finalPoolState.totalCostGBP.lessThan(2000)).toBe(true);
        });
    });

    describe('Pool reduction mechanics with mixed matching (CORRECTED)', () => {
        it('should only reduce pool by SECTION_104 portion, not by 30-day shares', () => {
            // HMRC Rule: Only SECTION_104 matched shares reduce the pool
            // - SAME_DAY: never touches pool
            // - THIRTY_DAY: doesn't reduce pool (deemed to be the later acquisition)
            // - SECTION_104: reduces pool (normal pool mechanics)
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 8 }), // Build pool
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-06-01', asset: 'ABC', quantity: 40, price: 12 }), // Same-day
                createBuy({ date: '2024-06-15', asset: 'ABC', quantity: 30, price: 14 }), // 30-day
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Verify all three match types
            expect(disposal.matchedPortions).toHaveLength(3);

            const sameDay = disposal.matchedPortions.find((p) => p.matchType === 'SAME_DAY')!;
            const thirtyDay = disposal.matchedPortions.find((p) => p.matchType === 'THIRTY_DAY')!;
            const pool = disposal.matchedPortions.find((p) => p.matchType === 'SECTION_104')!;

            expectDecimalEqual(sameDay.quantity, 40);
            expectDecimalEqual(thirtyDay.quantity, 30);
            expectDecimalEqual(pool.quantity, 30);

            // CORRECTED: Pool reduction
            // Started with: 100 @ £8 = £800
            // Only SECTION_104 portion (30 shares) reduces the pool
            // NOT reduced by the 30-day portion (those are deemed to be the later acquisition)
            // Remaining: 70 shares @ £8 each = £560
            expectDecimalEqual(disposal.poolStateAfter.quantity, 70);
            expectDecimalEqual(disposal.poolStateAfter.totalCostGBP, 560);

            // Final pool: depends on implementation of how 30-day shares are handled
            // At minimum, we should have the 70 shares @ £8 = £560
            // We should NOT see a stepped-up cost basis from adding 30-day @ £14
            expect(result.finalPoolState.quantity.greaterThanOrEqualTo(70)).toBe(true);
            expect(result.finalPoolState.totalCostGBP.greaterThanOrEqualTo(560)).toBe(true);

            // And we should NOT see basis step-up (70*8 + 30*14 = 560 + 420 = 980 would be wrong)
            expect(result.finalPoolState.totalCostGBP.lessThan(980)).toBe(true);
        });

        it('should not force-drain pool when 30-day matching covers full disposal', () => {
            // When same-day + 30-day fully cover the disposal,
            // the pool should be UNCHANGED (not force-drained)
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 20, price: 10 }),
                createSell({ date: '2024-06-01', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-06-01', asset: 'ABC', quantity: 50, price: 12 }),
                createBuy({ date: '2024-06-15', asset: 'ABC', quantity: 50, price: 14 }),
            ];

            const result = calculateCGT(transactions);
            const disposal = result.disposals[0];

            // Matching: 50 same-day + 50 30-day = 100 (full coverage, no pool needed)
            const portions = disposal.matchedPortions;
            const sameDayQty = portions
                .filter((p) => p.matchType === 'SAME_DAY')
                .reduce((sum, p) => sum.plus(p.quantity), new Decimal(0));
            const thirtyDayQty = portions
                .filter((p) => p.matchType === 'THIRTY_DAY')
                .reduce((sum, p) => sum.plus(p.quantity), new Decimal(0));
            const poolQty = portions
                .filter((p) => p.matchType === 'SECTION_104')
                .reduce((sum, p) => sum.plus(p.quantity), new Decimal(0));

            expectDecimalEqual(sameDayQty, 50);
            expectDecimalEqual(thirtyDayQty, 50);
            expectDecimalEqual(poolQty, 0);

            // CORRECTED: Pool should be UNCHANGED
            // No SECTION_104 portion, so pool is not reduced
            // Pool still has its original 20 shares @ £10 = £200
            expectDecimalEqual(disposal.poolStateAfter.quantity, 20);
            expectDecimalEqual(disposal.poolStateAfter.totalCostGBP, 200);

            // Final pool: at least the original 20 @ £10
            // (exact final state depends on how 30-day shares are handled)
            expect(result.finalPoolState.quantity.greaterThanOrEqualTo(20)).toBe(true);
        });
    });

    describe('Regressions - 30-day matching and subsequent disposals (CORRECTED)', () => {
        it('should NOT allow basis step-up through 30-day matching', () => {
            // This test verifies that you cannot step up your basis by:
            // 1. Selling shares (realizing gain)
            // 2. Rebuying within 30 days
            // 3. Getting a higher cost basis going forward
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 200, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 100, price: 15 }),
                createBuy({ date: '2024-03-10', asset: 'ABC', quantity: 100, price: 12 }),
                // Sell again after 30-day window has closed
                createSell({ date: '2024-04-15', asset: 'ABC', quantity: 150, price: 20 }),
            ];

            const result = calculateCGT(transactions);
            expect(result.disposals).toHaveLength(2);

            // First disposal: matched to 30-day repurchase @ £12
            const firstDisposal = result.disposals[0];
            expectDecimalEqual(firstDisposal.totalProceedsGBP, 1500);
            expectDecimalEqual(firstDisposal.totalCostBasisGBP, 1200);
            expectDecimalEqual(firstDisposal.totalGainLossGBP, 300);

            // Second disposal: This is the critical test
            // If we allowed basis step-up, the pool would have averaged £10 → £11
            // and this disposal would use £11/share cost (£1650 for 150 shares)
            //
            // HMRC says NO: the latent gain from £10→£15 should still be embedded
            // So the cost basis should be closer to £10/share, not £11/share
            const secondDisposal = result.disposals[1];
            expectDecimalEqual(secondDisposal.totalProceedsGBP, 3000);

            // Cost basis should be closer to £10/share than £11/share
            // (exact value depends on implementation, but should be < £1650)
            expect(secondDisposal.totalCostBasisGBP.lessThan(1650)).toBe(true);

            // We're NOT asserting the exact gain, as it depends on implementation
            // But the gain should be LARGER than £1350 (because cost basis is lower)
            expect(secondDisposal.totalGainLossGBP.greaterThan(1350)).toBe(true);
        });

        it('should preserve latent gain through 30-day matching', () => {
            // The economic gain from £10→£15 should remain taxable
            // even after 30-day bed-and-breakfast
            const transactions = [
                createBuy({ date: '2024-01-01', asset: 'ABC', quantity: 100, price: 10 }),
                createSell({ date: '2024-03-01', asset: 'ABC', quantity: 50, price: 15 }),
                createBuy({ date: '2024-03-10', asset: 'ABC', quantity: 80, price: 12 }),
            ];

            const result = calculateCGT(transactions);
            expect(result.disposals).toHaveLength(1);

            const disposal = result.disposals[0];
            expect(disposal.matchedPortions).toHaveLength(1);
            expect(disposal.matchedPortions[0].matchType).toBe('THIRTY_DAY');
            expectDecimalEqual(disposal.matchedPortions[0].quantity, 50);
            expectDecimalEqual(disposal.matchedPortions[0].costBasisGBP, 600);
            expectDecimalEqual(disposal.totalProceedsGBP, 750);
            expectDecimalEqual(disposal.totalCostBasisGBP, 600);
            expectDecimalEqual(disposal.totalGainLossGBP, 150);

            // Final pool: shares exist, but NOT at stepped-up cost
            expectDecimalEqual(result.finalPoolState.quantity, 130);

            // Pool cost should NOT be £1460 = 50*£10 + 80*£12 (stepped up)
            // That would mean future disposals only pay tax on gains above £11.23/share
            // when the true embedded gain is from £10/share
            expect(result.finalPoolState.totalCostGBP.lessThan(1460)).toBe(true);
        });
    });
});
