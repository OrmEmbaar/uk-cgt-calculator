import { describe, it, expect } from 'vitest';
import { VanguardParser } from '../vanguard-parser';
import Decimal from 'decimal.js';

describe('VanguardParser', () => {
    describe('Valid CSV parsing', () => {
        it('should parse OEIC buy transaction', async () => {
            const csv = `Date,Details,Amount,Balance
01/01/2020,Bought 10.5000 FTSE Developed Europe ex-U.K. Equity Index Fund - Accumulation,"-1,500.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(1);
            expect(transactions[0].type).toBe('BUY');
            expect(transactions[0].asset).toBe('FTSE_DEVELOPED_EUROPE_EQUITY');
            expect(transactions[0].quantity.equals(new Decimal('10.5'))).toBe(true);
            expect(transactions[0].price.equals(new Decimal('1500').div('10.5'))).toBe(true);
            expect(transactions[0].currency).toBe('GBP');
            expect(transactions[0].exchangeRate.equals(new Decimal(1.0))).toBe(true);
            expect(transactions[0].fee.equals(new Decimal(0))).toBe(true);
        });

        it('should parse ETF buy transaction with ticker', async () => {
            const csv = `Date,Details,Amount,Balance
15/03/2020,Bought 100 S&P 500 UCITS ETF - Distributing (VUSA),"-5,000.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(1);
            expect(transactions[0].type).toBe('BUY');
            expect(transactions[0].asset).toBe('VUSA');
            expect(transactions[0].quantity.equals(new Decimal(100))).toBe(true);
            expect(transactions[0].price.equals(new Decimal('50'))).toBe(true);
        });

        it('should parse ETF sell transaction', async () => {
            const csv = `Date,Details,Amount,Balance
20/05/2020,Sold 50 FTSE All-World UCITS ETF Distributing (VWRL),"3,000.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(1);
            expect(transactions[0].type).toBe('SELL');
            expect(transactions[0].quantity.equals(new Decimal(50))).toBe(true);
            expect(transactions[0].price.equals(new Decimal('60'))).toBe(true);
        });

        it('should parse OEIC sell transaction', async () => {
            const csv = `Date,Details,Amount,Balance
10/06/2020,Sold 20.5000 Japan Stock Index Fund - Accumulation,"2,500.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(1);
            expect(transactions[0].type).toBe('SELL');
            expect(transactions[0].asset).toBe('JAPAN_STOCK');
            expect(transactions[0].quantity.equals(new Decimal('20.5'))).toBe(true);
        });

        it('should match fee to same-day transaction', async () => {
            const csv = `Date,Details,Amount,Balance
15/03/2020,Bought 100 S&P 500 UCITS ETF - Distributing (VUSA),"-5,000.00",0
15/03/2020,ETF dealing fee (buy) S&P 500 UCITS ETF,-7.5,0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(1);
            expect(transactions[0].fee.equals(new Decimal(7.5))).toBe(true);
        });

        it('should match fees to correct assets when multiple transactions on same day', async () => {
            const csv = `Date,Details,Amount,Balance
29/10/2024,Sold 983 S&P 500 UCITS ETF - Distributing (VUSA),"83,642.88",0
29/10/2024,ETF dealing fee (sell) S&P 500 UCITS ETF - Distributing (VUSA),-7.5,0
29/10/2024,Sold 830 FTSE All-World UCITS ETF - Distributing (VWRL),"88,771.82",0
29/10/2024,ETF dealing fee (sell) FTSE All-World UCITS ETF - Distributing (VWRL),-7.5,0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(2);

            // VUSA should get its own fee
            const vusaTxn = transactions.find((t) => t.asset === 'VUSA');
            expect(vusaTxn).toBeDefined();
            expect(vusaTxn!.fee.equals(new Decimal(7.5))).toBe(true);

            // VWRL should get its own fee
            const vwrlTxn = transactions.find((t) => t.asset === 'VWRL');
            expect(vwrlTxn).toBeDefined();
            expect(vwrlTxn!.fee.equals(new Decimal(7.5))).toBe(true);
        });

        it('should handle multiple transactions on same day', async () => {
            const csv = `Date,Details,Amount,Balance
01/01/2020,Bought 10.5000 FTSE Developed Europe ex-U.K. Equity Index Fund - Accumulation,"-1,500.00",0
01/01/2020,Bought 8.2500 FTSE U.K. All Share Index Unit Trust - Accumulation,"-1,000.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(2);
            expect(transactions[0].date.day).toBe(1);
            expect(transactions[1].date.day).toBe(1);
        });

        it('should skip non-transaction rows silently', async () => {
            const csv = `Date,Details,Amount,Balance
01/01/2020,Deposit for investment purchases,"5,000.00",0
02/01/2020,Bought 10.5000 FTSE Developed Europe ex-U.K. Equity Index Fund - Accumulation,"-1,500.00",0
03/01/2020,Cash Account Interest,0.5,0
04/01/2020,DIV: VUSA.XLON.GB @ GBP 0.25,50.00,0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(1);
            expect(transactions[0].type).toBe('BUY');
        });

        it('should parse dates correctly in DD/MM/YYYY format', async () => {
            const csv = `Date,Details,Amount,Balance
25/12/2021,Bought 75 FTSE All-World UCITS ETF Distributing (VWRL),"-6,000.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].date.year).toBe(2021);
            expect(transactions[0].date.month).toBe(12);
            expect(transactions[0].date.day).toBe(25);
        });

        it('should use custom currency and exchange rate', async () => {
            const csv = `Date,Details,Amount,Balance
01/01/2020,Bought 10.5000 FTSE Developed Europe ex-U.K. Equity Index Fund - Accumulation,"-1,500.00",0`;

            const parser = new VanguardParser({
                currency: 'USD',
                exchangeRate: 1.27,
            });
            const transactions = await parser.parse(csv);

            expect(transactions[0].currency).toBe('USD');
            expect(transactions[0].exchangeRate.equals(new Decimal(1.27))).toBe(true);
        });

        it('should handle quantity with decimals', async () => {
            const csv = `Date,Details,Amount,Balance
01/02/2020,Bought .7500 FTSE U.K. All Share Index Unit Trust - Accumulation,-150,0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].quantity.equals(new Decimal('0.75'))).toBe(true);
        });

        it('should handle commas in quantity', async () => {
            const csv = `Date,Details,Amount,Balance
01/03/2020,"Bought 1,234.5678 Global Bond Index Fund - Accumulation","-10,000.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].quantity.equals(new Decimal('1234.5678'))).toBe(true);
        });

        it('should return empty array for CSV with only headers', async () => {
            const csv = `Date,Details,Amount,Balance`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(0);
        });

        it('should return empty array when all rows are non-transactions', async () => {
            const csv = `Date,Details,Amount,Balance
01/01/2020,Cash Account Interest,0.5,0
02/01/2020,DIV: VUSA.XLON.GB @ GBP 0.25,50.00,0
03/01/2020,Deposit for investment purchases,"5,000.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(0);
        });
    });

    describe('Asset identifier extraction', () => {
        it('should extract ticker for standard ETF format', async () => {
            const csv = `Date,Details,Amount,Balance
15/03/2020,Bought 100 S&P 500 UCITS ETF - Distributing (VUSA),"-5,000.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].asset).toBe('VUSA');
        });

        it('should extract ticker VWRL', async () => {
            const csv = `Date,Details,Amount,Balance
20/05/2020,Bought 75 FTSE All-World UCITS ETF Distributing (VWRL),"-6,000.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].asset).toBe('VWRL');
        });

        it('should extract ticker VFEM', async () => {
            const csv = `Date,Details,Amount,Balance
10/07/2020,Bought 200 FTSE Emerging Markets UCITS ETF Distributing (VFEM),"-8,000.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].asset).toBe('VFEM');
        });

        it('should generate identifier for OEIC without ticker', async () => {
            const csv = `Date,Details,Amount,Balance
01/04/2020,Bought 25.5000 Emerging Markets Stock Index Fund - Accumulation,"-3,000.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].asset).toBe('EMERGING_MARKETS_STOCK');
        });

        it('should generate identifier for Pacific ex-Japan fund', async () => {
            const csv = `Date,Details,Amount,Balance
15/05/2020,Bought 30.2500 Pacific ex-Japan Stock Index Fund - Accumulation,"-4,000.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].asset).toBe('PACIFIC_STOCK');
        });

        it('should generate identifier for Global Small-Cap', async () => {
            const csv = `Date,Details,Amount,Balance
20/06/2020,Bought 18.7500 Global Small-Cap Index Fund - Accumulation,"-2,500.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].asset).toBe('GLOBAL_SMALL-CAP');
        });

        it('should generate identifier for U.S. Equity Index Fund', async () => {
            const csv = `Date,Details,Amount,Balance
25/07/2020,Bought 12.5000 U.S. Equity Index Fund - Accumulation,"-3,500.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].asset).toBe('US_EQUITY');
            expect(transactions[0].assetFullName).toBe('U.S. Equity Index Fund - Accumulation');
        });
    });

    describe('Invalid input handling', () => {
        it('should throw error for invalid date format', async () => {
            const csv = `Date,Details,Amount,Balance
2020-01-01,Bought 10.5000 Test Fund - Accumulation,"-1,500.00",0`;

            const parser = new VanguardParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: Invalid date format "2020-01-01". Expected DD/MM/YYYY format'
            );
        });

        it('should throw error for empty date', async () => {
            const csv = `Date,Details,Amount,Balance
,Bought 10.5000 Test Fund - Accumulation,"-1,500.00",0`;

            const parser = new VanguardParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Date field is empty');
        });

        it('should throw error for invalid date values', async () => {
            const csv = `Date,Details,Amount,Balance
32/13/2020,Bought 10.5000 Test Fund - Accumulation,"-1,500.00",0`;

            const parser = new VanguardParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Invalid date');
        });

        it('should throw error for missing required columns', async () => {
            const csv = `Date,Details,Amount
01/01/2020,Bought 10.5000 Test Fund - Accumulation,"-1,500.00"`;

            const parser = new VanguardParser();

            await expect(parser.parse(csv)).rejects.toThrow('Missing required columns: Balance');
        });

        it('should throw error for empty amount', async () => {
            const csv = `Date,Details,Amount,Balance
01/01/2020,Bought 10.5000 Test Fund - Accumulation,,0`;

            const parser = new VanguardParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Amount field is empty');
        });

        it('should throw error for invalid amount', async () => {
            const csv = `Date,Details,Amount,Balance
01/01/2020,Bought 10.5000 Test Fund - Accumulation,invalid,0`;

            const parser = new VanguardParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Invalid amount "invalid"');
        });

        it('should throw error for invalid quantity', async () => {
            const csv = `Date,Details,Amount,Balance
01/01/2020,Bought 1.2.3 Test Fund - Accumulation,"-1,500.00",0`;

            const parser = new VanguardParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: quantity is not a valid number');
        });
    });

    describe('Price calculation', () => {
        it('should calculate correct price from amount and quantity', async () => {
            const csv = `Date,Details,Amount,Balance
01/01/2020,Bought 10 Test Fund - Accumulation,"-2,000.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].price.equals(new Decimal(200))).toBe(true);
        });

        it('should handle decimal price calculation', async () => {
            const csv = `Date,Details,Amount,Balance
15/03/2020,Bought 75 S&P 500 UCITS ETF - Distributing (VUSA),"-3,750.50",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].price.toDecimalPlaces(4).toString()).toBe('50.0067');
        });

        it('should use absolute value for negative amounts', async () => {
            const csv = `Date,Details,Amount,Balance
01/01/2020,Bought 10 Test Fund,"-1,000.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].price.equals(new Decimal(100))).toBe(true);
        });

        it('should use absolute value for positive amounts (sells)', async () => {
            const csv = `Date,Details,Amount,Balance
01/02/2020,Sold 10 Test Fund,"1,200.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].price.equals(new Decimal(120))).toBe(true);
        });
    });

    describe('Fund name changes', () => {
        it('should treat renamed funds as the same asset', async () => {
            // Vanguard renamed "Vanguard £ Short-Term Money Market Fund Investor GBP Inc"
            // to "Sterling Short-Term Money Market Fund - Income"
            const csv = `Date,Details,Amount,Balance
04/03/2020,"Bought 100 Vanguard £ Short-Term Money Market Fund Investor GBP Inc","-100.00",0
10/03/2020,"Sold 30 Vanguard £ Short-Term Money Market Fund Investor GBP Inc","30.00",0
04/05/2020,"Sold 40 Sterling Short-Term Money Market Fund - Income","40.00",0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            // All transactions should have the same asset identifier
            expect(transactions).toHaveLength(3);
            expect(transactions[0].asset).toBe('STERLING_SHORT-TERM_MONEY_MARKET');
            expect(transactions[1].asset).toBe('STERLING_SHORT-TERM_MONEY_MARKET');
            expect(transactions[2].asset).toBe('STERLING_SHORT-TERM_MONEY_MARKET');

            // Verify quantities
            expect(transactions[0].type).toBe('BUY');
            expect(transactions[0].quantity.equals(new Decimal(100))).toBe(true);
            expect(transactions[1].type).toBe('SELL');
            expect(transactions[1].quantity.equals(new Decimal(30))).toBe(true);
            expect(transactions[2].type).toBe('SELL');
            expect(transactions[2].quantity.equals(new Decimal(40))).toBe(true);
        });

        it('should parse actual Vanguard CSV with fund name changes', async () => {
            // Real-world test with exact data from user's CSV
            const csv = `Date,Details,Amount,Balance
04/03/2020,"Bought 97,470.7588 Vanguard £ Short-Term Money Market Fund Investor GBP Inc","-97,500.00","28,668.52"
10/03/2020,"Sold 4,998.0008 Vanguard £ Short-Term Money Market Fund Investor GBP Inc","5,000.00","23,726.44"
04/05/2020,"Sold 29,994.0012 Sterling Short-Term Money Market Fund - Income","30,000.00","30,055.33"`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            // All transactions should have the same asset identifier
            expect(transactions).toHaveLength(3);
            expect(transactions[0].asset).toBe('STERLING_SHORT-TERM_MONEY_MARKET');
            expect(transactions[1].asset).toBe('STERLING_SHORT-TERM_MONEY_MARKET');
            expect(transactions[2].asset).toBe('STERLING_SHORT-TERM_MONEY_MARKET');
        });

        it('should handle character encoding issues with fund names via pattern matching', async () => {
            // Pattern matching handles any character corruption (£ becomes �, missing, etc.)
            const csv = `Date,Details,Amount,Balance
04/03/2020,"Bought 97,470.7588 Vanguard � Short-Term Money Market Fund Investor GBP Inc","-97,500.00","28,668.52"
10/03/2020,"Sold 4,998.0008 Vanguard XXX Short-Term Money Market Fund Investor GBP Inc","5,000.00","23,726.44"
04/05/2020,"Sold 29,994.0012 Sterling Short-Term Money Market Fund - Income","30,000.00","30,055.33"`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            // All transactions should match via pattern (contains "Short-Term Money Market" + Vanguard/Sterling)
            expect(transactions).toHaveLength(3);
            expect(transactions[0].asset).toBe('STERLING_SHORT-TERM_MONEY_MARKET');
            expect(transactions[1].asset).toBe('STERLING_SHORT-TERM_MONEY_MARKET');
            expect(transactions[2].asset).toBe('STERLING_SHORT-TERM_MONEY_MARKET');
        });
    });

    describe('Real-world examples', () => {
        it('should parse complex multi-transaction CSV', async () => {
            const csv = `Date,Details,Amount,Balance
01/01/2020,Deposit for investment purchases,"10,000.00",0
02/01/2020,Bought 15.5000 FTSE Developed Europe ex-U.K. Equity Index Fund - Accumulation,"-2,000.00",0
03/01/2020,Bought 50.7500 Emerging Markets Stock Index Fund - Accumulation,"-5,000.00",0
04/01/2020,Bought 100 Test ETF Fund (TEST),"-3,000.00",0
04/01/2020,ETF dealing fee (buy) Test ETF Fund,-7.5,0
05/01/2020,Sold 100 Test ETF Fund (TEST),"3,100.00",0
05/01/2020,ETF dealing fee (sell) Test ETF Fund,-7.5,0
06/01/2020,Cash Account Interest,0.5,0`;

            const parser = new VanguardParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(4);
            expect(transactions[0].type).toBe('BUY');
            expect(transactions[0].asset).toBe('FTSE_DEVELOPED_EUROPE_EQUITY');
            expect(transactions[1].type).toBe('BUY');
            expect(transactions[1].asset).toBe('EMERGING_MARKETS_STOCK');
            expect(transactions[2].type).toBe('BUY');
            expect(transactions[2].fee.equals(new Decimal(7.5))).toBe(true);
            expect(transactions[3].type).toBe('SELL');
            expect(transactions[3].fee.equals(new Decimal(7.5))).toBe(true);
        });
    });
});
