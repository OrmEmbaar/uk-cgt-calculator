# UK CGT Calculator Core Module

A TypeScript/JavaScript module for calculating UK Capital Gains Tax on share and asset disposals, implementing full HMRC bed and breakfasting rules.

## Features

✅ **Complete UK Tax Compliance**
- Same-day matching rule (TCGA 1992 s.105)
- 30-day bed and breakfasting rule (TCGA 1992 s.106A)
- Section 104 pooling with averaged cost basis

✅ **Robust Financial Calculations**
- Uses `Decimal.js` for precise arithmetic
- Multi-currency support with exchange rates
- Transaction fees handled correctly
- Complex partial disposal scenarios

✅ **Comprehensive Testing**
- 51+ passing tests covering edge cases
- Validated against HMRC guidance examples
- Real-world trading scenarios

## Installation

```bash
npm install decimal.js luxon
# or
pnpm add decimal.js luxon
```

## Usage

```typescript
import { DateTime } from 'luxon';
import Decimal from 'decimal.js';
import { calculateCGT } from './lib/cgt';

// Create transactions
const transactions = [
  {
    date: DateTime.fromISO('2024-01-01'),
    type: 'BUY' as const,
    asset: 'AAPL',
    quantity: new Decimal(100),
    price: new Decimal(150),
    currency: 'USD',
    exchangeRate: new Decimal(0.79), // USD to GBP
    fee: new Decimal(10),
  },
  {
    date: DateTime.fromISO('2024-06-01'),
    type: 'SELL' as const,
    asset: 'AAPL',
    quantity: new Decimal(50),
    price: new Decimal(180),
    currency: 'USD',
    exchangeRate: new Decimal(0.78),
    fee: new Decimal(10),
  },
];

// Calculate CGT
const result = calculateCGT(transactions);

console.log('Disposals:', result.disposals.length);
console.log('Total Gains:', result.totalGains.toString());
console.log('Total Losses:', result.totalLosses.toString());
console.log('Net Gain/Loss:', result.netGainLoss.toString());

// Access detailed breakdown
result.disposals.forEach((disposal, index) => {
  console.log(`\nDisposal ${index + 1}:`);
  console.log('  Proceeds:', disposal.totalProceedsGBP.toString());
  console.log('  Cost Basis:', disposal.totalCostBasisGBP.toString());
  console.log('  Gain/Loss:', disposal.totalGainLossGBP.toString());
  
  disposal.matchedPortions.forEach((portion) => {
    console.log(`  - ${portion.matchType}: ${portion.quantity} shares`);
  });
});
```

## How It Works

### Matching Order (HMRC Rules)

For each disposal, shares are matched in strict priority order:

1. **Same-Day** - Shares bought on the same calendar day
2. **30-Day** - Shares bought in the following 30 days (anti-avoidance)
3. **Section 104 Pool** - All other shares at averaged cost

### Section 104 Pool

- All historical acquisitions are pooled together
- Cost basis is averaged across all shares in the pool
- Proportionate cost is removed on each disposal
- Fees are included in the cost basis

### 30-Day Rule (Bed & Breakfasting)

The 30-day rule prevents you from:
- Selling shares to realize a gain/loss
- Buying them back within 30 days
- Claiming the artificial gain/loss for tax

Instead, the disposal is matched against the repurchase price, deferring the gain.

## API Reference

### `calculateCGT(transactions: Transaction[]): CGTCalculationResult`

Calculates CGT for a series of transactions in a single asset.

**Parameters:**
- `transactions` - Array of buy/sell transactions

**Returns:**
- `disposals` - Detailed results for each sale
- `finalPoolState` - Remaining Section 104 pool
- `totalGains` - Sum of all gains
- `totalLosses` - Sum of all losses  
- `netGainLoss` - Net position

### `calculateCGTMultipleAssets(transactions: Transaction[]): Map<string, CGTCalculationResult>`

Calculates CGT across multiple assets, automatically grouping by asset identifier.

## Testing

```bash
pnpm test                 # Run all tests
pnpm test:watch          # Watch mode
```

## Known Limitations

- Does not calculate actual tax owed (rates vary by individual circumstances)
- Does not handle share reorganizations or corporate actions
- Does not handle crypto-specific rules (though the core logic applies)
- Some edge cases with multiple overlapping 30-day windows need refinement

## References

- [HMRC Capital Gains Manual CG51560](https://www.gov.uk/hmrc-internal-manuals/capital-gains-manual/cg51560)
- TCGA 1992 Section 104 (pooling)
- TCGA 1992 Section 105 (same-day rule)
- TCGA 1992 Section 106A (30-day rule)

## License

MIT

