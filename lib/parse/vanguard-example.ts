/**
 * Example usage of the Vanguard CSV parser
 */

import { VanguardParser } from './vanguard-parser';
import { calculateCGTMultipleAssets } from '../cgt/calculator';

// Example Vanguard CSV content
const exampleVanguardCSV = `Date,Details,Amount,Balance
01/01/2020,Deposit for investment purchases,"10,000.00",0
02/01/2020,Bought 15.5000 FTSE Developed Europe ex-U.K. Equity Index Fund - Accumulation,"-2,000.00",0
03/01/2020,Bought 50.7500 Emerging Markets Stock Index Fund - Accumulation,"-5,000.00",0
04/01/2020,Bought 100 S&P 500 UCITS ETF - Distributing (VUSA),"-3,000.00",0
04/01/2020,ETF dealing fee (buy) S&P 500 UCITS ETF,-7.5,0
05/01/2020,Sold 100 S&P 500 UCITS ETF - Distributing (VUSA),"3,100.00",0
05/01/2020,ETF dealing fee (sell) S&P 500 UCITS ETF,-7.5,0
06/01/2020,Cash Account Interest,0.5,0
07/01/2020,DIV: VUSA.XLON.GB @ GBP 0.25,50.00,0`;

async function main() {
    try {
        console.log('Parsing Vanguard CSV...\n');

        // Create parser (all transactions are in GBP for Vanguard)
        const parser = new VanguardParser({
            timezone: 'Europe/London',
            currency: 'GBP',
            exchangeRate: 1.0,
        });

        // Parse the CSV
        const transactions = await parser.parse(exampleVanguardCSV);

        console.log(`Parsed ${transactions.length} transactions:\n`);
        transactions.forEach((t, i) => {
            console.log(
                `${i + 1}. ${t.date.toISODate()} - ${t.type} ${t.quantity} ${
                    t.asset
                } @ £${t.price.toFixed(2)} (fee: £${t.fee.toFixed(2)})`
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

            if (result.disposals.length > 0) {
                result.disposals.forEach((disposal, i) => {
                    console.log(`\nDisposal ${i + 1} (${disposal.disposal.date.toISODate()}):`);
                    console.log(`  Quantity: ${disposal.disposal.quantity}`);
                    console.log(`  Proceeds: £${disposal.totalProceedsGBP.toFixed(2)}`);
                    console.log(`  Cost Basis: £${disposal.totalCostBasisGBP.toFixed(2)}`);
                    console.log(`  Gain/Loss: £${disposal.totalGainLossGBP.toFixed(2)}`);
                });

                console.log(`\nSummary for ${asset}:`);
                console.log(`  Total Gains: £${result.totalGains.toFixed(2)}`);
                console.log(`  Total Losses: £${result.totalLosses.toFixed(2)}`);
                console.log(`  Net Gain/Loss: £${result.netGainLoss.toFixed(2)}`);
            }

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
