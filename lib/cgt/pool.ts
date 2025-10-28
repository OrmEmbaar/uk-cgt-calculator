import Decimal from 'decimal.js';
import { Section104Pool, Acquisition } from './types';

/**
 * Create a new empty Section 104 pool
 */
export function createPool(): Section104Pool {
    return {
        quantity: new Decimal(0),
        totalCostGBP: new Decimal(0),
    };
}

/**
 * Add an acquisition to the Section 104 pool
 * Fees are added to the cost basis
 *
 * Note: Costs are maintained at full precision (not rounded to pence)
 * This is critical for HMRC compliance - rounding only happens when
 * calculating reported gains/losses, not in the pool's internal state
 */
export function addToPool(pool: Section104Pool, acquisition: Acquisition): Section104Pool {
    const costInGBP = acquisition.price
        .times(acquisition.quantity)
        .plus(acquisition.fee)
        .times(acquisition.exchangeRate);

    return {
        quantity: pool.quantity.plus(acquisition.quantity),
        totalCostGBP: pool.totalCostGBP.plus(costInGBP),
    };
}

/**
 * Calculate the average cost per unit in the pool
 */
export function getAverageCostPerUnit(pool: Section104Pool): Decimal {
    if (pool.quantity.isZero()) {
        return new Decimal(0);
    }
    return pool.totalCostGBP.dividedBy(pool.quantity);
}

/**
 * Remove a quantity from the pool and return the proportionate cost
 * Returns the updated pool and the cost basis for the removed quantity
 *
 * ROUNDING POLICY:
 * - Pool costs are kept at FULL PRECISION (not rounded)
 * - This prevents rounding error accumulation over many transactions
 * - Only when reporting gains/losses do we round to 2dp (pence precision)
 * - See calculator.ts GBP_DECIMAL_PLACES for where rounding is applied
 */
export function removeFromPool(
    pool: Section104Pool,
    quantity: Decimal
): { updatedPool: Section104Pool; costBasis: Decimal } {
    if (quantity.greaterThan(pool.quantity)) {
        throw new Error(
            `Cannot remove ${quantity.toString()} units from pool containing only ${pool.quantity.toString()} units`
        );
    }

    if (quantity.isZero()) {
        return {
            updatedPool: pool,
            costBasis: new Decimal(0),
        };
    }

    // Calculate proportionate cost at full precision
    const proportion = quantity.dividedBy(pool.quantity);
    const costBasis = pool.totalCostGBP.times(proportion);

    // Update pool at full precision (do NOT round here)
    const updatedPool: Section104Pool = {
        quantity: pool.quantity.minus(quantity),
        totalCostGBP: pool.totalCostGBP.minus(costBasis),
    };

    return {
        updatedPool,
        costBasis,
    };
}

/**
 * Clone a pool (for immutability)
 */
export function clonePool(pool: Section104Pool): Section104Pool {
    return {
        quantity: pool.quantity,
        totalCostGBP: pool.totalCostGBP,
    };
}

/**
 * Check if pool has sufficient quantity
 */
export function hasQuantity(pool: Section104Pool, quantity: Decimal): boolean {
    return pool.quantity.greaterThanOrEqualTo(quantity);
}
