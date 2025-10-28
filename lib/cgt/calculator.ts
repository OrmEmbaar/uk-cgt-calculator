import Decimal from 'decimal.js';
import {
    Transaction,
    Acquisition,
    Disposal,
    DisposalResult,
    CGTCalculationResult,
    Section104Pool,
} from './types';
import { createPool, addToPool, clonePool } from './pool';
import { matchDisposal } from './matching';

/**
 * Number of decimal places for GBP amounts (pence precision)
 *
 * ROUNDING POLICY (CRITICAL FOR HMRC COMPLIANCE):
 * - Internal pool costs are kept at FULL PRECISION (not rounded)
 * - Only REPORTED values (proceeds, cost basis, gains/losses) are rounded to 2dp
 * - This prevents rounding error accumulation over many transactions
 * - Pool averaging uses high-precision internal costs, then rounds final results
 *
 * DO NOT round pool.totalCostGBP or intermediate calculations - only round
 * when calculating totalProceedsGBP, totalCostBasisGBP, and totalGainLossGBP
 */
const GBP_DECIMAL_PLACES = 2;

// Note: 30-day window handled in matching module; keep constant here only if referenced

/**
 * Type guard to check if a transaction is an acquisition
 */
function isAcquisition(transaction: Transaction): transaction is Acquisition {
    return transaction.type === 'BUY';
}

/**
 * Type guard to check if a transaction is a disposal
 */
function isDisposal(transaction: Transaction): transaction is Disposal {
    return transaction.type === 'SELL';
}

/**
 * Helper function to check if an acquisition is on the same day as a disposal
 */
function isSameDay(acquisition: Acquisition, disposal: Disposal): boolean {
    return acquisition.date.startOf('day').equals(disposal.date.startOf('day'));
}

/**
 * Helper function to add a partial acquisition to the pool
 * Handles cases where only part of an acquisition should be added (e.g., after 30-day matching)
 */
function addPartialAcquisitionToPool(
    pool: Section104Pool,
    acquisition: Acquisition,
    usedQuantity: Decimal
): Section104Pool {
    const remainingQuantity = acquisition.quantity.minus(usedQuantity);

    if (remainingQuantity.lessThanOrEqualTo(0)) {
        return pool;
    }

    const proportionRemaining = remainingQuantity.dividedBy(acquisition.quantity);
    const partialAcquisition: Acquisition = {
        ...acquisition,
        quantity: remainingQuantity,
        fee: acquisition.fee.times(proportionRemaining),
    };

    return addToPool(pool, partialAcquisition);
}

/**
 * Calculate CGT for a series of transactions in a single asset
 *
 * @param transactions - Array of buy and sell transactions
 * @returns Detailed results for each disposal and final pool state
 */
export function calculateCGT(transactions: Transaction[]): CGTCalculationResult {
    // Sort transactions by date (chronological order)
    const sortedTransactions = [...transactions].sort((a, b) => a.date.toMillis() - b.date.toMillis());

    // Separate acquisitions and disposals
    const allAcquisitions = sortedTransactions.filter(isAcquisition);
    const allDisposals = sortedTransactions.filter(isDisposal);

    // Track how much of each acquisition has been used for same-day or 30-day matching
    const acquisitionUsedQuantities = new Map<Acquisition, Decimal>();

    // Track which acquisitions were matched via 30-day or later rule (these join pool in full)
    const acquisitionsMatched30Day = new Set<Acquisition>();
    const acquisitionsMatchedLater = new Set<Acquisition>();

    // Maintain the Section 104 pool state as we process transactions
    let currentPoolState: Section104Pool = createPool();

    // Track which acquisitions have been processed and added to the pool
    const acquisitionsInPool = new Set<Acquisition>();

    // Process each disposal in chronological order
    const disposalResults: DisposalResult[] = [];

    for (const disposal of allDisposals) {
        /**
         * STEP 1: Update the Section 104 pool with acquisitions that occurred before this disposal
         *
         * Per HMRC rules, acquisitions go into the pool UNLESS they are:
         * - Same-day with a disposal (handled during matching)
         * - Used for 30-day matching with a disposal
         */
        for (const acq of allAcquisitions) {
            // Stop at acquisitions after this disposal
            if (acq.date > disposal.date) {
                break;
            }

            // Skip if already processed
            if (acquisitionsInPool.has(acq)) {
                continue;
            }

            // Same-day acquisitions are handled during matching, not added to pool yet
            if (isSameDay(acq, disposal)) {
                continue;
            }

            // Different handling based on how the acquisition was used:
            //
            // CRITICAL: 30-day matched shares must NOT step up the pool's cost basis
            // Per HMRC TCGA 1992 s.106A, the 30-day rule prevents basis step-up
            //
            // - 30-day matched: add only UNUSED portion (matched portion at deferred cost)
            // - Later matched: add ENTIRE acquisition (covers short, becomes real holding)
            // - Same-day matched: add only UNUSED portion (already handled above)
            // - Unused: add entire acquisition
            if (acquisitionsMatchedLater.has(acq)) {
                // Later-matched (short covering): add full acquisition
                currentPoolState = addToPool(currentPoolState, acq);
            } else {
                // All others (including 30-day): add only unused portion
                // For 30-day matched shares, the matched portion should NOT be added
                // at its repurchase cost - that would create an impermissible basis step-up
                const usedQuantity = acquisitionUsedQuantities.get(acq) || new Decimal(0);
                currentPoolState = addPartialAcquisitionToPool(currentPoolState, acq, usedQuantity);
            }
            acquisitionsInPool.add(acq);
        }

        /**
         * STEP 3: Perform the matching according to HMRC priority rules
         * 1. Same-day acquisitions
         * 2. 30-day bed and breakfasting acquisitions
         * 3. Section 104 pool
         * 4. Later acquisitions beyond 30 days (HS284 fallback to allow short selling)
         *
         * The matchDisposal function will throw an error if insufficient shares are available
         */
        const matchResult = matchDisposal(
            disposal,
            allAcquisitions,
            currentPoolState,
            acquisitionUsedQuantities
        );

        /**
         * STEP 4: Update tracking state after this disposal
         */
        // Update the pool state based on what was matched
        currentPoolState = matchResult.updatedPool;

        // Track how much of each same-day acquisition was used
        matchResult.sameDayUsed.forEach((quantity, acquisition) => {
            const currentUsed = acquisitionUsedQuantities.get(acquisition) || new Decimal(0);
            acquisitionUsedQuantities.set(acquisition, currentUsed.plus(quantity));
        });

        // Track how much of each 30-day acquisition was used
        matchResult.thirtyDayUsed.forEach((quantity, acquisition) => {
            const currentUsed = acquisitionUsedQuantities.get(acquisition) || new Decimal(0);
            acquisitionUsedQuantities.set(acquisition, currentUsed.plus(quantity));
            acquisitionsMatched30Day.add(acquisition); // Track that this was 30-day matched
        });

        // Track how much of each later acquisition was used
        matchResult.laterUsed.forEach((quantity, acquisition) => {
            const currentUsed = acquisitionUsedQuantities.get(acquisition) || new Decimal(0);
            acquisitionUsedQuantities.set(acquisition, currentUsed.plus(quantity));
            acquisitionsMatchedLater.add(acquisition); // Track that this was later-matched
        });

        // After matching, add any unused portions of same-day acquisitions to the pool (per s.105 surplus to Section 104)
        for (const acq of allAcquisitions) {
            if (!isSameDay(acq, disposal)) {
                continue;
            }
            // Only process same-day acquisitions once
            if (acquisitionsInPool.has(acq)) {
                continue;
            }
            const usedQuantity = acquisitionUsedQuantities.get(acq) || new Decimal(0);
            currentPoolState = addPartialAcquisitionToPool(currentPoolState, acq, usedQuantity);
            acquisitionsInPool.add(acq);
        }

        // Note: 30-day matched acquisitions are NOT added to pool at repurchase cost
        // Per HMRC TCGA 1992 s.106A: The 30-day rule prevents basis step-up
        // Only the unused portion (if any) is added to the pool at actual cost

        /**
         * STEP 5: Calculate total gain/loss for this disposal
         */
        const totalProceedsGBP = matchResult.matchedPortions
            .reduce((sum, portion) => sum.plus(portion.proceedsGBP), new Decimal(0))
            .toDecimalPlaces(GBP_DECIMAL_PLACES);

        const totalCostBasisGBP = matchResult.matchedPortions
            .reduce((sum, portion) => sum.plus(portion.costBasisGBP), new Decimal(0))
            .toDecimalPlaces(GBP_DECIMAL_PLACES);

        const totalGainLossGBP = totalProceedsGBP
            .minus(totalCostBasisGBP)
            .toDecimalPlaces(GBP_DECIMAL_PLACES);

        /**
         * STEP 6: Store the disposal result
         */
        disposalResults.push({
            disposal,
            totalProceedsGBP,
            totalCostBasisGBP,
            totalGainLossGBP,
            matchedPortions: matchResult.matchedPortions,
            poolStateAfter: clonePool(currentPoolState),
        });
    }

    /**
     * Build final Section 104 pool state
     *
     * After processing all disposals, we need to add any remaining acquisitions:
     * 1. Acquisitions that occurred after all disposals
     * 2. Unused portions of acquisitions that were partially matched
     */
    let finalPool = clonePool(currentPoolState);

    // Find the date of the last disposal (if any)
    const lastDisposalDate = allDisposals.length > 0 ? allDisposals[allDisposals.length - 1].date : null;

    // Process acquisitions that come after all disposals or weren't yet added to pool
    for (const acq of allAcquisitions) {
        // Skip acquisitions already in the pool
        if (acquisitionsInPool.has(acq)) {
            continue;
        }

        // Add acquisitions that come after all disposals
        const afterLastDisposal = !lastDisposalDate || acq.date > lastDisposalDate;

        if (!afterLastDisposal) {
            continue;
        }

        // For later-matched acquisitions, add the ENTIRE acquisition (covers short)
        // For all others (including 30-day), add only unused portion
        // This prevents 30-day matched shares from stepping up the pool basis
        if (acquisitionsMatchedLater.has(acq)) {
            finalPool = addToPool(finalPool, acq);
        } else {
            const usedQuantity = acquisitionUsedQuantities.get(acq) || new Decimal(0);
            finalPool = addPartialAcquisitionToPool(finalPool, acq, usedQuantity);
        }
    }

    /**
     * Calculate summary statistics across all disposals
     */
    let totalGains = new Decimal(0);
    let totalLosses = new Decimal(0);

    for (const result of disposalResults) {
        if (result.totalGainLossGBP.greaterThan(0)) {
            totalGains = totalGains.plus(result.totalGainLossGBP);
        } else {
            totalLosses = totalLosses.plus(result.totalGainLossGBP.abs());
        }
    }

    return {
        disposals: disposalResults,
        finalPoolState: finalPool,
        totalGains: totalGains.toDecimalPlaces(GBP_DECIMAL_PLACES),
        totalLosses: totalLosses.toDecimalPlaces(GBP_DECIMAL_PLACES),
        netGainLoss: totalGains.minus(totalLosses).toDecimalPlaces(GBP_DECIMAL_PLACES),
    };
}

/**
 * Calculate CGT for multiple assets
 * Returns a map of asset identifier to calculation results
 */
export function calculateCGTMultipleAssets(
    transactions: Transaction[]
): Map<string, CGTCalculationResult> {
    // Group transactions by asset
    const transactionsByAsset = new Map<string, Transaction[]>();

    for (const transaction of transactions) {
        const assetTransactions = transactionsByAsset.get(transaction.asset) || [];
        assetTransactions.push(transaction);
        transactionsByAsset.set(transaction.asset, assetTransactions);
    }

    // Calculate CGT for each asset
    const results = new Map<string, CGTCalculationResult>();

    for (const [asset, assetTransactions] of transactionsByAsset) {
        results.set(asset, calculateCGT(assetTransactions));
    }

    return results;
}
