import { DateTime } from 'luxon';
import Decimal from 'decimal.js';

/**
 * Transaction type - either BUY or SELL
 */
export type TransactionType = 'BUY' | 'SELL';

/**
 * Base transaction interface
 */
export interface Transaction {
    /** Transaction date */
    date: DateTime;
    /** Transaction type */
    type: TransactionType;
    /** Asset identifier (e.g., ticker symbol) */
    asset: string;
    /** Full asset name for display purposes (optional) */
    assetFullName?: string;
    /** Quantity of shares/units */
    quantity: Decimal;
    /** Price per share/unit in transaction currency */
    price: Decimal;
    /** Currency code (e.g., 'USD', 'GBP', 'EUR') */
    currency: string;
    /** Exchange rate to GBP (1.0 if already in GBP) */
    exchangeRate: Decimal;
    /** Transaction fee (added to cost basis for buys, subtracted from proceeds for sells) */
    fee: Decimal;
}

/**
 * Acquisition (buy) transaction
 */
export interface Acquisition extends Transaction {
    type: 'BUY';
}

/**
 * Disposal (sell) transaction
 */
export interface Disposal extends Transaction {
    type: 'SELL';
}

/**
 * Section 104 pool state
 */
export interface Section104Pool {
    /** Total quantity of shares in the pool */
    quantity: Decimal;
    /** Total allowable cost in GBP */
    totalCostGBP: Decimal;
}

/**
 * Type of matching applied to a disposal
 */
export type MatchType = 'SAME_DAY' | 'THIRTY_DAY' | 'SECTION_104' | 'LATER';

/**
 * Details of how a portion of a disposal was matched
 */
export interface MatchedPortion {
    /** Type of matching rule applied */
    matchType: MatchType;
    /** Quantity matched under this rule */
    quantity: Decimal;
    /** Allowable cost in GBP for this matched quantity */
    costBasisGBP: Decimal;
    /** Proceeds in GBP for this matched quantity */
    proceedsGBP: Decimal;
    /** Gain or loss in GBP for this portion */
    gainLossGBP: Decimal;
    /** Reference to the acquisition transaction (if same-day or 30-day match) */
    matchedAcquisition?: Acquisition;
    /** Average cost per unit from pool (if Section 104 match) */
    poolAverageCostPerUnit?: Decimal;
}

/**
 * Result of processing a disposal
 */
export interface DisposalResult {
    /** The disposal transaction */
    disposal: Disposal;
    /** Total proceeds in GBP (after fees) */
    totalProceedsGBP: Decimal;
    /** Total allowable cost in GBP */
    totalCostBasisGBP: Decimal;
    /** Total gain or loss in GBP */
    totalGainLossGBP: Decimal;
    /** Breakdown of how the disposal was matched */
    matchedPortions: MatchedPortion[];
    /** Section 104 pool state after this disposal */
    poolStateAfter: Section104Pool;
}

/**
 * Summary of all CGT calculations
 */
export interface CGTCalculationResult {
    /** Results for each disposal */
    disposals: DisposalResult[];
    /** Final Section 104 pool state */
    finalPoolState: Section104Pool;
    /** Total gains across all disposals */
    totalGains: Decimal;
    /** Total losses across all disposals */
    totalLosses: Decimal;
    /** Net gain/loss */
    netGainLoss: Decimal;
}
