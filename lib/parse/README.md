# CSV Parser Module

This module provides an extensible system for parsing CSV files into Transaction arrays compatible with the CGT calculator.

## Features

-   **Extensible architecture**: Base parser class for creating custom parsers
-   **Type-safe**: Full TypeScript support with strict validation
-   **Timezone support**: Handles ISO8601 dates with explicit timezones or defaults to Europe/London
-   **Strict validation**: Throws detailed errors on first validation failure with row and field context
-   **Decimal precision**: Uses `Decimal.js` for accurate financial calculations

## Quick Start

```typescript
import { RawCSVParser } from './lib/parse';
import { calculateCGT } from './lib/cgt';

// Parse CSV
const parser = new RawCSVParser();
const transactions = await parser.parse(csvContent);

// Calculate CGT
const results = calculateCGT(transactions);
```

## Raw CSV Format

The `RawCSVParser` expects CSV files with the following columns:

| Column         | Type           | Description                             | Example                                |
| -------------- | -------------- | --------------------------------------- | -------------------------------------- |
| `date`         | ISO8601 string | Transaction date                        | `2024-01-15` or `2024-01-15T10:30:00Z` |
| `type`         | BUY or SELL    | Transaction type                        | `BUY` or `SELL`                        |
| `asset`        | string         | Asset identifier                        | `AAPL`, `VOD`                          |
| `quantity`     | number         | Number of shares/units                  | `10`, `100.5`                          |
| `price`        | number         | Price per unit in transaction currency  | `150.50`                               |
| `currency`     | string         | 3-letter currency code                  | `USD`, `GBP`, `EUR`                    |
| `exchangeRate` | number         | Exchange rate to GBP (1.0 for GBP)      | `0.79`, `1.0`                          |
| `fee`          | number         | Transaction fee in transaction currency | `9.99`, `0`                            |

### Example CSV

```csv
date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,0.79,9.99
2024-02-20,SELL,AAPL,5,155.00,USD,0.80,8.50
2024-03-10,BUY,VOD,100,1.50,GBP,1.0,5.00
```

## Parser Options

```typescript
interface ParserOptions {
    /** Timezone for dates without explicit timezone (default: 'Europe/London') */
    timezone?: string;
}

// Example with custom timezone
const parser = new RawCSVParser({ timezone: 'America/New_York' });
```

## Timezone Handling

-   **Dates with timezone info** (e.g., `2024-01-15T10:30:00Z` or `2024-01-15T10:30:00-05:00`) preserve their timezone
-   **Dates without timezone** (e.g., `2024-01-15`) use the parser's timezone setting (default: `Europe/London`)

## Error Handling

The parser throws errors on the first validation failure with detailed context:

```typescript
try {
    const transactions = await parser.parse(csvContent);
} catch (error) {
    // Error messages include row number and field context:
    // "Row 3: quantity is not a valid number: 'invalid'"
    // "Row 5: Transaction type must be BUY or SELL, got 'HOLD'"
    // "Missing required columns: date, quantity"
}
```

## Validation Rules

-   **Date**: Must be valid ISO8601 format
-   **Type**: Must be `BUY` or `SELL` (case-insensitive)
-   **Asset**: Cannot be empty
-   **Quantity**: Must be a positive number
-   **Price**: Must be a positive number
-   **Currency**: Must be a 3-letter code
-   **Exchange Rate**: Must be greater than 0
-   **Fee**: Must be a non-negative number

## Vanguard Fund Name Changes & Character Encoding

Vanguard occasionally renames funds, and CSV exports may have character encoding issues (e.g., `£` becomes `�`). The parser uses pattern matching to handle both issues:

-   **Sterling Short-Term Money Market Fund**: Uses pattern matching for any fund name containing "Short-Term Money Market" AND ("Vanguard" OR "Sterling")
    -   Handles original name: "Vanguard £ Short-Term Money Market Fund Investor GBP Inc"
    -   Handles rebranded name: "Sterling Short-Term Money Market Fund - Income"
    -   Handles encoding issues: "Vanguard � Short-Term Money Market..." (corrupted £ symbol)

All variations are automatically mapped to the same asset identifier (`STERLING_SHORT-TERM_MONEY_MARKET`) via pattern matching, so buys and sells are correctly matched regardless of fund rebranding or character encoding issues.

## IG Broker Format

The `IGParser` expects CSV files exported from IG broker with the following columns:

| Column            | Type        | Description                                | Example             |
| ----------------- | ----------- | ------------------------------------------ | ------------------- |
| `TextDate`        | DD-MM-YYYY  | Transaction date                           | `15-03-2024`        |
| `Time`            | HH:MM:SS    | Transaction time                           | `10:30:45`          |
| `Activity`        | string      | Activity type (parser filters for "TRADE") | `TRADE`             |
| `Market`          | string      | Full market/asset name                     | `Apple Inc`         |
| `Direction`       | BUY or SELL | Transaction direction                      | `BUY` or `SELL`     |
| `Quantity`        | number      | Number of shares/units (may be signed)     | `100` or `-100`     |
| `Price`           | number      | Price per unit in transaction currency     | `150.50`            |
| `Currency`        | string      | 3-letter currency code                     | `USD`, `GBP`, `EUR` |
| `Commission`      | number      | Commission fee in transaction currency     | `10.00`             |
| `Charges`         | number      | Additional charges in transaction currency | `5.00`              |
| `Conversion rate` | number      | Exchange rate to GBP                       | `0.79`, `1.0`       |

### Example CSV

```csv
TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:45,TRADE,Apple Inc,BUY,100,150.50,USD,-15050.00,10,5,-15065.00,0.79,LIMIT,XNAS,Y,17-03-2024,TEST123
20-06-2024,14:25:30,TRADE,Microsoft Corporation,SELL,50,200.00,USD,10000.00,8,2,9990.00,0.80,MARKET,XNAS,Y,22-06-2024,TEST456
```

### Key Features

-   **Date/Time Parsing**: Combines separate date (DD-MM-YYYY) and time (HH:MM:SS) fields
-   **Activity Filtering**: Automatically skips non-TRADE activities (deposits, dividends, etc.)
-   **Price Calculation**: Calculates price from Consideration/Quantity (handles pence-traded securities automatically)
-   **Fee Calculation**: Total fee = |Commission| + |Charges| (uses absolute values as IG uses negative for deductions)
-   **Signed Quantities**: Uses absolute value of quantity (IG may use negative values for sells)
-   **Full Asset Names**: Uses the complete market name from the "Market" column

### Usage Example

```typescript
import { IGParser } from './lib/parse';
import { calculateCGT } from './lib/cgt';

// Parse IG CSV
const parser = new IGParser();
const transactions = await parser.parse(csvContent);

// Calculate CGT
const results = calculateCGT(transactions);
```

## DeGiro Broker Format

The `DeGiroParser` expects CSV files exported from DeGiro broker with the following columns:

| Column                     | Type       | Description                                        | Example         |
| -------------------------- | ---------- | -------------------------------------------------- | --------------- |
| `Date`                     | DD/MM/YYYY | Transaction date                                   | `15/03/2024`    |
| `Time`                     | HH:MM      | Transaction time                                   | `10:30`         |
| `Product`                  | string     | Product/asset name                                 | `Test Fund`     |
| `ISIN`                     | string     | International Securities Identification Number     | `IE00TEST0001`  |
| `Quantity`                 | number     | Number of shares (negative = sell, positive = buy) | `100` or `-100` |
| `Price`                    | number     | Price per unit in local currency                   | `150.50`        |
| `Exchange rate`            | number     | Exchange rate to GBP                               | `1.26`, `1.0`   |
| `Transaction and/or third` | number     | Transaction fee                                    | `10.00`         |

**Note:** DeGiro CSVs contain unnamed columns for currency codes (e.g., USD, GBP, EUR). The parser automatically detects the transaction currency from these columns.

### Example CSV

```csv
Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Test Fund,IE00TEST0001,LSE,XLON,100,150.50,USD,-15050.00,USD,-11900.00,GBP,1.26,-10.00,GBP,-11910.00,GBP,test-id-123
20/06/2024,14:25,Test ETF,IE00TEST0002,LSE,XLON,-50,200.00,USD,10000.00,USD,8000.00,GBP,1.25,-5.50,GBP,7994.50,GBP,test-id-456
```

### Key Features

-   **Date/Time Parsing**: Combines separate date (DD/MM/YYYY) and time (HH:MM) fields
-   **Signed Quantities**: Negative quantity = SELL, Positive quantity = BUY
-   **Currency Detection**: Automatically extracts currency from unnamed CSV columns
-   **Fee Handling**: Parses fees from "Transaction and/or third" column
-   **Product Names**: Uses the "Product" column as asset identifier

### Usage Example

```typescript
import { DeGiroParser } from './lib/parse';
import { calculateCGT } from './lib/cgt';

// Parse DeGiro CSV
const parser = new DeGiroParser();
const transactions = await parser.parse(csvContent);

// Calculate CGT
const results = calculateCGT(transactions);
```

## Creating Custom Parsers

Extend `BaseCSVParser` to create parsers for broker-specific CSV formats:

```typescript
import { BaseCSVParser } from './lib/parse';
import { Transaction } from './lib/cgt/types';

class InteractiveBrokersParser extends BaseCSVParser {
    async parse(csvContent: string): Promise<Transaction[]> {
        const parseResult = this.parseCSV(csvContent);

        // Custom column mapping and transformation logic
        // Use base parser utilities:
        // - this.parseDate(dateStr, rowNum)
        // - this.parseDecimal(value, fieldName, rowNum)
        // - this.validateTransactionType(type, rowNum)
        // - this.validateCurrency(currency, rowNum)
        // - this.validateAsset(asset, rowNum)

        return transactions;
    }
}
```

## Base Parser Utilities

The `BaseCSVParser` provides these protected methods for custom parsers:

-   `parseDate(dateStr: string, rowNum: number): DateTime` - Parse ISO8601 dates with timezone support
-   `parseDecimal(value: string, fieldName: string, rowNum: number): Decimal` - Parse and validate numbers
-   `validateTransactionType(type: string, rowNum: number): TransactionType` - Validate BUY/SELL
-   `validateCurrency(currency: string, rowNum: number): string` - Validate currency codes
-   `validateAsset(asset: string, rowNum: number): string` - Validate asset identifiers
-   `parseCSV<T>(csvContent: string): Papa.ParseResult<T>` - Parse CSV with PapaParse
-   `validateRequiredFields(headers: string[], requiredFields: string[]): void` - Check required columns

## Integration Example

```typescript
import { RawCSVParser } from './lib/parse';
import { calculateCGTMultipleAssets } from './lib/cgt';
import { getTaxYear } from './lib/utils/tax-year';
import { readFile } from 'fs/promises';

// Read and parse CSV
const csvContent = await readFile('transactions.csv', 'utf-8');
const parser = new RawCSVParser();
const transactions = await parser.parse(csvContent);

// Calculate CGT for all assets
const resultsByAsset = calculateCGTMultipleAssets(transactions);

// Display results
for (const [asset, result] of resultsByAsset) {
    console.log(`${asset}: Net gain/loss = £${result.netGainLoss}`);
}

// Group by tax year (UK tax year: April 6 to April 5)
const disposalsByTaxYear = new Map();
for (const [asset, result] of resultsByAsset) {
    for (const disposal of result.disposals) {
        const taxYear = getTaxYear(disposal.disposal.date);
        // ... process by tax year
    }
}
```
