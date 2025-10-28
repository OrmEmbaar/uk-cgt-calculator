/**
 * Example usage of the CSV parser with the CGT calculator
 *
 * This file demonstrates how to:
 * 1. Parse a CSV file into transactions
 * 2. Calculate CGT for the transactions
 * 3. Display the results
 */

import { RawCSVParser } from './raw-parser';
import { calculateCGTMultipleAssets } from '../cgt/calculator';

// Example CSV content
const exampleCSV = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,100,150.00,USD,0.79,10.00
2024-02-20,BUY,AAPL,50,155.00,USD,0.80,8.00
2024-03-10,SELL,AAPL,75,160.00,USD,0.78,12.00
2024-04-05,BUY,VOD,500,1.50,GBP,1.0,5.00
2024-05-12,SELL,VOD,200,1.65,GBP,1.0,3.50`;

async function main() {
    try {
        // Create parser with default options (timezone: Europe/London)
        const parser = new RawCSVParser();

        // Parse the CSV content
        console.log('Parsing CSV...\n');
        const transactions = await parser.parse(exampleCSV);

        console.log(`Parsed ${transactions.length} transactions:\n`);
        transactions.forEach((t, i) => {
            console.log(
                `${i + 1}. ${t.date.toISODate()} - ${t.type} ${t.quantity} ${t.asset} @ ${t.currency} ${
                    t.price
                }`
            );
        });

        // Calculate CGT for all assets
        console.log('\n\nCalculating CGT...\n');
        const resultsByAsset = calculateCGTMultipleAssets(transactions);

        // Display results for each asset
        for (const [asset, result] of resultsByAsset) {
            console.log(`\n${'='.repeat(50)}`);
            console.log(`Asset: ${asset}`);
            console.log(`${'='.repeat(50)}`);

            // Display each disposal
            result.disposals.forEach((disposal, i) => {
                console.log(`\nDisposal ${i + 1} (${disposal.disposal.date.toISODate()}):`);
                console.log(`  Quantity: ${disposal.disposal.quantity}`);
                console.log(`  Proceeds: £${disposal.totalProceedsGBP.toFixed(2)}`);
                console.log(`  Cost Basis: £${disposal.totalCostBasisGBP.toFixed(2)}`);
                console.log(`  Gain/Loss: £${disposal.totalGainLossGBP.toFixed(2)}`);

                // Show matching breakdown
                console.log(`  Matching breakdown:`);
                disposal.matchedPortions.forEach((portion) => {
                    console.log(
                        `    - ${portion.matchType}: ${
                            portion.quantity
                        } shares, gain/loss: £${portion.gainLossGBP.toFixed(2)}`
                    );
                });
            });

            // Display summary
            console.log(`\nSummary for ${asset}:`);
            console.log(`  Total Gains: £${result.totalGains.toFixed(2)}`);
            console.log(`  Total Losses: £${result.totalLosses.toFixed(2)}`);
            console.log(`  Net Gain/Loss: £${result.netGainLoss.toFixed(2)}`);
            console.log(
                `  Final Pool: ${
                    result.finalPoolState.quantity
                } shares at £${result.finalPoolState.totalCostGBP.toFixed(2)} total cost`
            );
        }

        console.log(`\n${'='.repeat(50)}\n`);
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

// Run the example if this file is executed directly
if (require.main === module) {
    main();
}

export { main };
