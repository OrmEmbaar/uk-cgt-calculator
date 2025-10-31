import { describe, it, expect } from 'vitest';
import { IGParser } from '../ig-parser';
import Decimal from 'decimal.js';

describe('IGParser', () => {
    describe('Valid CSV parsing', () => {
        it('should parse a valid BUY transaction', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:45,TRADE,Apple Inc,BUY,100,150.50,USD,-15050.00,10,5,-15065.00,0.79,LIMIT,XNAS,Y,17-03-2024,TEST123`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(1);
            expect(transactions[0].type).toBe('BUY');
            expect(transactions[0].asset).toBe('Apple Inc');
            expect(transactions[0].quantity.equals(new Decimal(100))).toBe(true);
            // Price is calculated from Consideration/Quantity: 15050/100 = 150.50
            expect(transactions[0].price.equals(new Decimal(150.5))).toBe(true);
            expect(transactions[0].currency).toBe('USD');
            expect(transactions[0].exchangeRate.equals(new Decimal(0.79))).toBe(true);
            expect(transactions[0].fee.equals(new Decimal(15))).toBe(true); // 10 + 5
        });

        it('should parse a valid SELL transaction', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
20-06-2024,14:25:30,TRADE,Microsoft Corporation,SELL,50,200.00,USD,10000.00,8,2,9990.00,0.80,MARKET,XNAS,Y,22-06-2024,TEST456`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(1);
            expect(transactions[0].type).toBe('SELL');
            expect(transactions[0].asset).toBe('Microsoft Corporation');
            expect(transactions[0].quantity.equals(new Decimal(50))).toBe(true);
            expect(transactions[0].price.equals(new Decimal(200))).toBe(true);
            expect(transactions[0].fee.equals(new Decimal(10))).toBe(true); // 8 + 2
        });

        it('should parse date and time correctly', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
25-12-2023,09:15:42,TRADE,Test Fund,BUY,10,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,27-12-2023,TEST789`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].date.year).toBe(2023);
            expect(transactions[0].date.month).toBe(12);
            expect(transactions[0].date.day).toBe(25);
            expect(transactions[0].date.hour).toBe(9);
            expect(transactions[0].date.minute).toBe(15);
            expect(transactions[0].date.second).toBe(42);
        });

        it('should use custom timezone when specified', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,BUY,10,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser({ timezone: 'America/New_York' });
            const transactions = await parser.parse(csv);

            expect(transactions[0].date.zoneName).toBe('America/New_York');
        });

        it('should handle GBP transactions with exchange rate 1.0', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
10-01-2024,11:00:00,TRADE,Vodafone Group,BUY,500,1.50,GBP,-750.00,5,0,-755.00,1.0000000,LIMIT,XLON,Y,12-01-2024,TEST999`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].currency).toBe('GBP');
            expect(transactions[0].exchangeRate.equals(new Decimal(1.0))).toBe(true);
        });

        it('should handle EUR transactions with exchange rate', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
05-02-2024,13:45:00,TRADE,European Company,BUY,200,25.50,EUR,-5100.00,12,3,-5115.00,0.8690867,LIMIT,XEUR,Y,07-02-2024,EUR123`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].currency).toBe('EUR');
            expect(transactions[0].exchangeRate.equals(new Decimal(0.8690867))).toBe(true);
        });

        it('should handle zero commission', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,BUY,10,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].fee.equals(new Decimal(0))).toBe(true);
        });

        it('should handle zero charges', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,BUY,10,100,GBP,-1000,5,0,-1005,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].fee.equals(new Decimal(5))).toBe(true);
        });

        it('should use absolute value of signed quantity', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,SELL,-100,50,GBP,5000,10,0,4990,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].quantity.equals(new Decimal(100))).toBe(true);
        });

        it('should parse multiple transactions', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Apple Inc,BUY,100,150.50,USD,-15050.00,10,5,-15065.00,0.79,LIMIT,XNAS,Y,17-03-2024,TEST1
20-06-2024,14:25:30,TRADE,Microsoft Corporation,SELL,50,200.00,USD,10000.00,8,2,9990.00,0.80,MARKET,XNAS,Y,22-06-2024,TEST2
10-01-2024,11:00:00,TRADE,Vodafone Group,BUY,500,1.50,GBP,-750.00,5,0,-755.00,1.0,LIMIT,XLON,Y,12-01-2024,TEST3`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(3);
            expect(transactions[0].asset).toBe('Apple Inc');
            expect(transactions[1].asset).toBe('Microsoft Corporation');
            expect(transactions[2].asset).toBe('Vodafone Group');
        });

        it('should skip non-TRADE activities', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,DEPOSIT,Cash,BUY,0,0,GBP,1000,0,0,1000,1.0,,,Y,15-03-2024,DEP1
16-03-2024,11:00:00,TRADE,Apple Inc,BUY,100,150.50,USD,-15050.00,10,5,-15065.00,0.79,LIMIT,XNAS,Y,18-03-2024,TEST1
17-03-2024,12:00:00,DIVIDEND,Apple Inc,,,,,50,0,0,50,1.0,,,Y,17-03-2024,DIV1
18-03-2024,13:00:00,TRADE,Microsoft Corporation,SELL,50,200.00,USD,10000.00,8,2,9990.00,0.80,MARKET,XNAS,Y,20-03-2024,TEST2`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(2);
            expect(transactions[0].asset).toBe('Apple Inc');
            expect(transactions[1].asset).toBe('Microsoft Corporation');
        });

        it('should return empty array for CSV with only headers', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(0);
        });

        it('should return empty array when all rows are non-TRADE activities', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,DEPOSIT,Cash,,,,,1000,0,0,1000,1.0,,,Y,15-03-2024,DEP1
17-03-2024,12:00:00,DIVIDEND,Apple Inc,,,,,50,0,0,50,1.0,,,Y,17-03-2024,DIV1`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(0);
        });

        it('should handle lowercase direction', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,buy,10,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].type).toBe('BUY');
        });

        it('should handle lowercase currency', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,BUY,10,100,gbp,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].currency).toBe('GBP');
        });
    });

    describe('Invalid date/time formats', () => {
        it('should throw error for invalid date format', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
2024-03-15,10:30:00,TRADE,Test Asset,BUY,10,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: Invalid date format "2024-03-15". Expected DD-MM-YYYY format'
            );
        });

        it('should throw error for invalid time format', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30,TRADE,Test Asset,BUY,10,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: Invalid time format "10:30". Expected HH:MM:SS format'
            );
        });

        it('should throw error for empty date field', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
,10:30:00,TRADE,Test Asset,BUY,10,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: TextDate field is empty');
        });

        it('should throw error for empty time field', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,,TRADE,Test Asset,BUY,10,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Time field is empty');
        });

        it('should throw error for invalid date values', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
32-13-2024,10:30:00,TRADE,Test Asset,BUY,10,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Invalid date/time');
        });
    });

    describe('Invalid transaction data', () => {
        it('should throw error for invalid direction', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,HOLD,10,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: Transaction type must be BUY or SELL, got "HOLD"'
            );
        });

        it('should throw error for empty market field', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,,BUY,10,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Asset field is empty');
        });

        it('should throw error for empty quantity', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,BUY,,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Quantity field is empty');
        });

        it('should throw error for invalid quantity', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,BUY,invalid,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: quantity is not a valid number: "invalid"'
            );
        });

        it('should throw error for invalid currency code', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,BUY,10,100,GB,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: Currency code must be 3 letters, got "GB"'
            );
        });

        it('should throw error for zero exchange rate', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,BUY,10,100,USD,-1000,0,0,-1000,0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: Conversion rate must be greater than 0'
            );
        });

        it('should handle negative commission (uses absolute value)', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,BUY,10,100,GBP,-1000,-5,0,-1005,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].fee.equals(new Decimal(5))).toBe(true);
        });

        it('should handle negative charges (uses absolute value)', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,BUY,10,100,GBP,-1000,0,-5,-1005,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].fee.equals(new Decimal(5))).toBe(true);
        });

        it('should handle both negative commission and charges', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,BUY,10,100,GBP,-1000,-7.5,-2.5,-1010,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].fee.equals(new Decimal(10))).toBe(true); // 7.5 + 2.5
        });

        it('should handle empty commission and charges', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,Test Asset,BUY,10,100,GBP,-1000,,,1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].fee.equals(new Decimal(0))).toBe(true);
        });

        it('should handle securities traded in pence (price calculated from Consideration)', async () => {
            // When securities are traded in pence, Price column shows pence value (e.g., 12345)
            // but Consideration is in pounds (e.g., 123.45). By calculating from Consideration/Quantity,
            // we automatically get the correct price in pounds.
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,UK Stock Traded in Pence,BUY,100,12345,GBP,-123.45,0,0,-123.45,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].currency).toBe('GBP');
            // Price calculated from Consideration/Quantity: 123.45/100 = 1.2345 pounds per share
            expect(transactions[0].price.equals(new Decimal('1.2345'))).toBe(true);
            expect(transactions[0].exchangeRate.equals(new Decimal(1.0))).toBe(true);
        });

        it('should handle securities traded in pence with fees', async () => {
            const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:00,TRADE,UK Stock Traded in Pence,BUY,100,12345,GBP,-123.45,-7.50,-2.50,-133.45,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].currency).toBe('GBP');
            // Price from Consideration: 123.45/100 = 1.2345 pounds per share
            expect(transactions[0].price.equals(new Decimal('1.2345'))).toBe(true);
            // Fees in pounds: 7.50 + 2.50 = 10 pounds
            expect(transactions[0].fee.equals(new Decimal('10'))).toBe(true);
        });
    });

    describe('Missing required columns', () => {
        it('should throw error when required column is missing', async () => {
            const csv = `TextDate,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,TRADE,Test Asset,BUY,10,100,GBP,-1000,0,0,-1000,1.0,LIMIT,XLON,Y,17-03-2024,TEST`;

            const parser = new IGParser();

            await expect(parser.parse(csv)).rejects.toThrow('Missing required columns: Time');
        });
    });
});
