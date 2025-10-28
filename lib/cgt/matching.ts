import Decimal from 'decimal.js';
import { Acquisition, Disposal, Section104Pool, MatchedPortion } from './types';
import { getAverageCostPerUnit, removeFromPool } from './pool';

/**
 * Number of decimal places for GBP amounts (pence precision)
 */
const GBP_DECIMAL_PLACES = 2;

/**
 * Find acquisitions made on the same day as the disposal
 *
 * Per HMRC TCGA 1992 s.105, disposals are first matched with acquisitions
 * on the same calendar day, regardless of the time of day.
 */
export function findSameDayAcquisitions(disposal: Disposal, acquisitions: Acquisition[]): Acquisition[] {
    const disposalDate = disposal.date.startOf('day');

    return acquisitions.filter((acq) => {
        const acqDate = acq.date.startOf('day');
        return acqDate.equals(disposalDate);
    });
}

/**
 * Find acquisitions made within 30 days AFTER the disposal (bed and breakfasting rule)
 *
 * Per HMRC TCGA 1992 s.106A, disposals are matched with acquisitions made
 * in the following 30 days. This anti-avoidance rule prevents crystallizing
 * gains/losses and immediately repurchasing the same shares.
 *
 * Note: The disposal date itself is excluded (covered by same-day rule)
 */
export function find30DayAcquisitions(disposal: Disposal, acquisitions: Acquisition[]): Acquisition[] {
    const disposalDate = disposal.date.startOf('day');
    const thirtyDaysAfter = disposalDate.plus({ days: 30 });

    return acquisitions.filter((acq) => {
        const acqDate = acq.date.startOf('day');
        // Must be after disposal date and within 30 days
        return acqDate > disposalDate && acqDate <= thirtyDaysAfter;
    });
}

/**
 * Find acquisitions made AFTER the 30-day window (later acquisitions fallback per HS284)
 * Used to support short selling: if same-day, 30-day, and pool do not fully cover a disposal,
 * the remaining quantity is identified with later acquisitions, earliest first.
 */
export function findLaterAcquisitions(disposal: Disposal, acquisitions: Acquisition[]): Acquisition[] {
    const afterWindow = disposal.date.startOf('day').plus({ days: 30 });
    return acquisitions.filter((acq) => acq.date.startOf('day') > afterWindow);
}

/**
 * Match a quantity of disposal against acquisitions using same-day rule
 * Returns matched portions and remaining quantity to match
 */
export function matchSameDay(
    disposal: Disposal,
    remainingQuantity: Decimal,
    sameDayAcquisitions: Acquisition[],
    acquisitionUsage: Map<Acquisition, Decimal> = new Map()
): {
    matchedPortions: MatchedPortion[];
    remainingQuantity: Decimal;
    usedAcquisitions: Map<Acquisition, Decimal>; // Track how much of each acquisition is used
} {
    const usedAcquisitions = new Map<Acquisition, Decimal>();
    let remaining = remainingQuantity;

    if (remaining.lessThanOrEqualTo(0) || sameDayAcquisitions.length === 0) {
        return { matchedPortions: [], remainingQuantity: remaining, usedAcquisitions };
    }

    // Compute total available quantity on the same day (net of prior usage)
    let totalAvailable = new Decimal(0);
    const availableByAcq = new Map<Acquisition, Decimal>();
    for (const acq of sameDayAcquisitions) {
        const alreadyUsed = acquisitionUsage.get(acq) || new Decimal(0);
        const available = acq.quantity.minus(alreadyUsed);
        if (available.greaterThan(0)) {
            availableByAcq.set(acq, available);
            totalAvailable = totalAvailable.plus(available);
        }
    }

    if (totalAvailable.lessThanOrEqualTo(0)) {
        return { matchedPortions: [], remainingQuantity: remaining, usedAcquisitions };
    }

    const quantityToMatch = Decimal.min(remaining, totalAvailable);

    // Aggregate cost across all same-day acquisitions in proportion to available quantities
    let aggregatedCostGBP = new Decimal(0);
    for (const [acq, available] of availableByAcq.entries()) {
        const proportionOfDayUsed = available.dividedBy(totalAvailable).times(quantityToMatch);
        if (proportionOfDayUsed.lessThanOrEqualTo(0)) continue;

        const costGBP = acq.price
            .times(proportionOfDayUsed)
            .plus(acq.fee.times(proportionOfDayUsed.dividedBy(acq.quantity)))
            .times(acq.exchangeRate);
        aggregatedCostGBP = aggregatedCostGBP.plus(costGBP);

        // Track usage per acquisition
        usedAcquisitions.set(acq, proportionOfDayUsed);
    }

    const proceedsGBP = disposal.price
        .times(quantityToMatch)
        .minus(disposal.fee.times(quantityToMatch.dividedBy(disposal.quantity)))
        .times(disposal.exchangeRate)
        .toDecimalPlaces(GBP_DECIMAL_PLACES);

    const totalCostGBP = aggregatedCostGBP.toDecimalPlaces(GBP_DECIMAL_PLACES);

    const matchedPortions: MatchedPortion[] = [
        {
            matchType: 'SAME_DAY',
            quantity: quantityToMatch,
            costBasisGBP: totalCostGBP,
            proceedsGBP,
            gainLossGBP: proceedsGBP.minus(totalCostGBP).toDecimalPlaces(GBP_DECIMAL_PLACES),
        },
    ];

    remaining = remaining.minus(quantityToMatch);

    return { matchedPortions, remainingQuantity: remaining, usedAcquisitions };
}

/**
 * Match a quantity of disposal against acquisitions using 30-day rule
 * Returns matched portions and remaining quantity to match
 */
export function match30Day(
    disposal: Disposal,
    remainingQuantity: Decimal,
    thirtyDayAcquisitions: Acquisition[],
    acquisitionUsage: Map<Acquisition, Decimal> = new Map()
): {
    matchedPortions: MatchedPortion[];
    remainingQuantity: Decimal;
    usedAcquisitions: Map<Acquisition, Decimal>;
} {
    const matchedPortions: MatchedPortion[] = [];
    const usedAcquisitions = new Map<Acquisition, Decimal>();
    let remaining = remainingQuantity;

    // Sort by date (FIFO - earliest purchases first)
    const sortedAcquisitions = [...thirtyDayAcquisitions].sort(
        (a, b) => a.date.toMillis() - b.date.toMillis()
    );

    for (const acq of sortedAcquisitions) {
        if (remaining.lessThanOrEqualTo(0)) break;

        // Calculate available quantity (total - already used)
        const alreadyUsed = acquisitionUsage.get(acq) || new Decimal(0);
        const availableQuantity = acq.quantity.minus(alreadyUsed);
        if (availableQuantity.lessThanOrEqualTo(0)) continue;

        const quantityToMatch = Decimal.min(remaining, availableQuantity);
        const proportionOfAcq = quantityToMatch.dividedBy(acq.quantity);
        const proportionOfDisposal = quantityToMatch.dividedBy(disposal.quantity);

        const costBasisGBP = acq.price
            .times(quantityToMatch)
            .plus(acq.fee.times(proportionOfAcq))
            .times(acq.exchangeRate)
            .toDecimalPlaces(GBP_DECIMAL_PLACES);

        const proceedsGBP = disposal.price
            .times(quantityToMatch)
            .minus(disposal.fee.times(proportionOfDisposal))
            .times(disposal.exchangeRate)
            .toDecimalPlaces(GBP_DECIMAL_PLACES);

        matchedPortions.push({
            matchType: 'THIRTY_DAY',
            quantity: quantityToMatch,
            costBasisGBP,
            proceedsGBP,
            gainLossGBP: proceedsGBP.minus(costBasisGBP).toDecimalPlaces(GBP_DECIMAL_PLACES),
            matchedAcquisition: acq,
        });

        usedAcquisitions.set(acq, quantityToMatch);
        remaining = remaining.minus(quantityToMatch);
    }

    return { matchedPortions, remainingQuantity: remaining, usedAcquisitions };
}

/**
 * Match a quantity of disposal against acquisitions made AFTER 30 days (later acquisitions fallback)
 */
export function matchLater(
    disposal: Disposal,
    remainingQuantity: Decimal,
    laterAcquisitions: Acquisition[],
    acquisitionUsage: Map<Acquisition, Decimal> = new Map()
): {
    matchedPortions: MatchedPortion[];
    remainingQuantity: Decimal;
    usedAcquisitions: Map<Acquisition, Decimal>;
} {
    const matchedPortions: MatchedPortion[] = [];
    const usedAcquisitions = new Map<Acquisition, Decimal>();
    let remaining = remainingQuantity;

    const sortedAcquisitions = [...laterAcquisitions].sort(
        (a, b) => a.date.toMillis() - b.date.toMillis()
    );

    for (const acq of sortedAcquisitions) {
        if (remaining.lessThanOrEqualTo(0)) break;

        const alreadyUsed = acquisitionUsage.get(acq) || new Decimal(0);
        const availableQuantity = acq.quantity.minus(alreadyUsed);
        if (availableQuantity.lessThanOrEqualTo(0)) continue;

        const quantityToMatch = Decimal.min(remaining, availableQuantity);
        const proportionOfAcq = quantityToMatch.dividedBy(acq.quantity);
        const proportionOfDisposal = quantityToMatch.dividedBy(disposal.quantity);

        const costBasisGBP = acq.price
            .times(quantityToMatch)
            .plus(acq.fee.times(proportionOfAcq))
            .times(acq.exchangeRate)
            .toDecimalPlaces(GBP_DECIMAL_PLACES);

        const proceedsGBP = disposal.price
            .times(quantityToMatch)
            .minus(disposal.fee.times(proportionOfDisposal))
            .times(disposal.exchangeRate)
            .toDecimalPlaces(GBP_DECIMAL_PLACES);

        matchedPortions.push({
            matchType: 'LATER',
            quantity: quantityToMatch,
            costBasisGBP,
            proceedsGBP,
            gainLossGBP: proceedsGBP.minus(costBasisGBP).toDecimalPlaces(GBP_DECIMAL_PLACES),
            matchedAcquisition: acq,
        });

        usedAcquisitions.set(acq, quantityToMatch);
        remaining = remaining.minus(quantityToMatch);
    }

    return { matchedPortions, remainingQuantity: remaining, usedAcquisitions };
}

/**
 * Match a quantity of disposal against the Section 104 pool
 *
 * The Section 104 pool maintains an averaged cost basis for all shares.
 * When shares are sold from the pool, the cost is removed proportionately.
 *
 * Returns matched portion and updated pool state.
 */
export function matchSection104(
    disposal: Disposal,
    matchQuantity: Decimal,
    pool: Section104Pool
): {
    matchedPortion: MatchedPortion | null;
    updatedPool: Section104Pool;
} {
    if (matchQuantity.lessThanOrEqualTo(0)) {
        return { matchedPortion: null, updatedPool: pool };
    }

    if (pool.quantity.lessThan(matchQuantity)) {
        throw new Error(
            `Insufficient shares in pool: need ${matchQuantity.toString()}, have ${pool.quantity.toString()}`
        );
    }

    const averageCost = getAverageCostPerUnit(pool);
    const { updatedPool, costBasis } = removeFromPool(pool, matchQuantity);

    const proportionOfDisposal = matchQuantity.dividedBy(disposal.quantity);
    const proceedsGBP = disposal.price
        .times(matchQuantity)
        .minus(disposal.fee.times(proportionOfDisposal))
        .times(disposal.exchangeRate)
        .toDecimalPlaces(GBP_DECIMAL_PLACES);

    const matchedPortion: MatchedPortion = {
        matchType: 'SECTION_104',
        quantity: matchQuantity,
        costBasisGBP: costBasis.toDecimalPlaces(GBP_DECIMAL_PLACES),
        proceedsGBP,
        gainLossGBP: proceedsGBP.minus(costBasis).toDecimalPlaces(GBP_DECIMAL_PLACES),
        poolAverageCostPerUnit: averageCost,
    };

    return { matchedPortion, updatedPool };
}

/**
 * Main matching function that applies all HMRC CGT rules in priority order
 *
 * Matches a disposal (sale) against acquisitions (purchases) according to:
 * 1. Same-day rule (TCGA 1992 s.105)
 * 2. 30-day bed and breakfasting rule (TCGA 1992 s.106A)
 * 3. Section 104 pool (TCGA 1992 s.104)
 *
 * @param disposal - The disposal transaction to match
 * @param allAcquisitions - All available acquisitions to consider
 * @param pool - Current Section 104 pool state
 * @param acquisitionUsage - Map tracking how much of each acquisition has been used
 *
 * @returns Matched portions, updated pool state, and acquisition usage tracking
 */
export function matchDisposal(
    disposal: Disposal,
    allAcquisitions: Acquisition[],
    pool: Section104Pool,
    acquisitionUsage: Map<Acquisition, Decimal> = new Map()
): {
    matchedPortions: MatchedPortion[];
    updatedPool: Section104Pool;
    sameDayUsed: Map<Acquisition, Decimal>;
    thirtyDayUsed: Map<Acquisition, Decimal>;
    laterUsed: Map<Acquisition, Decimal>;
} {
    const matchedPortions: MatchedPortion[] = [];
    let remainingQuantity = disposal.quantity;
    const poolAtSale: Section104Pool = { quantity: pool.quantity, totalCostGBP: pool.totalCostGBP };
    let currentPool = pool;

    /**
     * STEP 1: Same-day matching (highest priority)
     * Match disposal with acquisitions on the same calendar day
     */
    const sameDayAcqs = findSameDayAcquisitions(disposal, allAcquisitions);
    const sameDayResult = matchSameDay(disposal, remainingQuantity, sameDayAcqs, acquisitionUsage);
    matchedPortions.push(...sameDayResult.matchedPortions);
    remainingQuantity = sameDayResult.remainingQuantity;

    // Same-day shares are tracked but don't affect pool reduction
    // (Pool reduction is now calculated based on Section 104 matched quantity only)

    /**
     * STEP 2: 30-day bed and breakfasting matching (second priority)
     * Match disposal with acquisitions made within 30 days AFTER the disposal
     */
    const thirtyDayAcqs = find30DayAcquisitions(disposal, allAcquisitions);
    const thirtyDayResult = match30Day(disposal, remainingQuantity, thirtyDayAcqs, acquisitionUsage);
    matchedPortions.push(...thirtyDayResult.matchedPortions);
    remainingQuantity = thirtyDayResult.remainingQuantity;

    /**
     * STEP 3: Section 104 pool matching (lowest priority)
     * Match any remaining disposal quantity with the averaged-cost pool
     */
    if (remainingQuantity.greaterThan(0)) {
        // Calculate how much can be matched from Section 104 pool
        const poolSection104Qty = Decimal.min(remainingQuantity, poolAtSale.quantity);

        if (poolSection104Qty.greaterThan(0)) {
            const proportionOfDisposal = poolSection104Qty.dividedBy(disposal.quantity);
            const proceedsGBP = disposal.price
                .times(poolSection104Qty)
                .minus(disposal.fee.times(proportionOfDisposal))
                .times(disposal.exchangeRate)
                .toDecimalPlaces(GBP_DECIMAL_PLACES);

            const averageCost = getAverageCostPerUnit(poolAtSale);
            const costBasis = averageCost.times(poolSection104Qty);

            matchedPortions.push({
                matchType: 'SECTION_104',
                quantity: poolSection104Qty,
                costBasisGBP: costBasis.toDecimalPlaces(GBP_DECIMAL_PLACES),
                proceedsGBP,
                gainLossGBP: proceedsGBP.minus(costBasis).toDecimalPlaces(GBP_DECIMAL_PLACES),
                poolAverageCostPerUnit: averageCost,
            });

            remainingQuantity = remainingQuantity.minus(poolSection104Qty);
        }

        // If still remaining, match with later acquisitions beyond 30 days
        if (remainingQuantity.greaterThan(0)) {
            const laterAcqs = findLaterAcquisitions(disposal, allAcquisitions);
            const laterResult = matchLater(disposal, remainingQuantity, laterAcqs, acquisitionUsage);
            matchedPortions.push(...laterResult.matchedPortions);
            remainingQuantity = laterResult.remainingQuantity;

            if (remainingQuantity.greaterThan(0)) {
                // Not enough shares even after later acquisitions
                const sameDayQty = sameDayResult.matchedPortions.reduce(
                    (sum, p) => sum.plus(p.quantity),
                    new Decimal(0)
                );
                const thirtyDayQty = thirtyDayResult.matchedPortions.reduce(
                    (sum, p) => sum.plus(p.quantity),
                    new Decimal(0)
                );
                const poolQtyUsed = matchedPortions
                    .filter((p) => p.matchType === 'SECTION_104')
                    .reduce((sum, p) => sum.plus(p.quantity), new Decimal(0));
                const laterQtyUsed = laterResult.matchedPortions.reduce(
                    (sum, p) => sum.plus(p.quantity),
                    new Decimal(0)
                );

                const totalAvailable = sameDayQty
                    .plus(thirtyDayQty)
                    .plus(poolQtyUsed)
                    .plus(laterQtyUsed);

                throw new Error(
                    `Cannot sell ${disposal.quantity.toString()} shares of ${disposal.asset} ` +
                        `on ${disposal.date.toISODate()}: only ${totalAvailable.toString()} shares available ` +
                        `(${sameDayQty.toString()} same-day, ${thirtyDayQty.toString()} 30-day, ` +
                        `${poolQtyUsed.toString()} from pool, ${laterQtyUsed.toString()} from later acquisitions)`
                );
            }

            // Reduce the pool before returning (later acquisition path)
            // Only reduce by Section 104 matched quantity (not 30-day matched)
            const section104QuantityLater = matchedPortions
                .filter((p) => p.matchType === 'SECTION_104')
                .reduce((sum, p) => sum.plus(p.quantity), new Decimal(0));
            if (section104QuantityLater.greaterThan(0)) {
                const { updatedPool } = removeFromPool(currentPool, section104QuantityLater);
                currentPool = updatedPool;
            }

            return {
                matchedPortions,
                updatedPool: currentPool,
                sameDayUsed: sameDayResult.usedAcquisitions,
                thirtyDayUsed: thirtyDayResult.usedAcquisitions,
                laterUsed: laterResult.usedAcquisitions,
            };
        }
    }

    /**
     * STEP 4: Reduce the pool by ONLY the Section 104 matched shares
     *
     * CRITICAL HMRC Rule (TCGA 1992 s.106A):
     * The 30-day bed-and-breakfasting rule exists to prevent basis step-up.
     *
     * Shares matched via 30-day rule are "deemed to be" the later acquisition.
     * They do NOT come from the existing holding, so they do NOT reduce the pool.
     *
     * Pool reduction breakdown:
     * - Same-day matched shares: never added to pool, so don't reduce it
     * - 30-day matched shares: deemed to be later acquisition, do NOT reduce pool
     * - Section 104 matched shares: actually from the pool, DO reduce it
     * - Later matched shares: short sale, don't reduce pool
     *
     * Total pool reduction = ONLY the Section 104 matched quantity
     */
    const section104Quantity = matchedPortions
        .filter((p) => p.matchType === 'SECTION_104')
        .reduce((sum, p) => sum.plus(p.quantity), new Decimal(0));

    if (section104Quantity.greaterThan(0)) {
        const { updatedPool } = removeFromPool(currentPool, section104Quantity);
        currentPool = updatedPool;
    }

    return {
        matchedPortions,
        updatedPool: currentPool,
        sameDayUsed: sameDayResult.usedAcquisitions,
        thirtyDayUsed: thirtyDayResult.usedAcquisitions,
        laterUsed: new Map<Acquisition, Decimal>(),
    };
}
