import { describe, it, expect } from 'vitest';
import { DeGiroParser } from '../degiro-parser';
import Decimal from 'decimal.js';

describe('DeGiroParser', () => {
    describe('Valid CSV parsing', () => {
        it('should parse a valid BUY transaction (positive quantity)', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Test Fund,IE00TEST0001,LSE,XLON,100,150.50,USD,-15050.00,USD,-11900.00,GBP,1.26,-10.00,GBP,-11910.00,GBP,test-id-123`;

            const parser = new DeGiroParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(1);
            expect(transactions[0].type).toBe('BUY');
            expect(transactions[0].asset).toBe('Test Fund');
            expect(transactions[0].quantity.equals(new Decimal(100))).toBe(true);
            expect(transactions[0].price.equals(new Decimal(150.5))).toBe(true);
            expect(transactions[0].currency).toBe('USD');
            expect(transactions[0].exchangeRate.equals(new Decimal(1.26))).toBe(true);
            expect(transactions[0].fee.equals(new Decimal(10))).toBe(true);
        });

        it('should parse a valid SELL transaction (negative quantity)', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
20/06/2024,14:25,Test ETF,IE00TEST0002,LSE,XLON,-50,200.00,USD,10000.00,USD,8000.00,GBP,1.25,-5.50,GBP,7994.50,GBP,test-id-456`;

            const parser = new DeGiroParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(1);
            expect(transactions[0].type).toBe('SELL');
            expect(transactions[0].asset).toBe('Test ETF');
            expect(transactions[0].quantity.equals(new Decimal(50))).toBe(true);
            expect(transactions[0].price.equals(new Decimal(200))).toBe(true);
            expect(transactions[0].fee.equals(new Decimal(5.5))).toBe(true);
        });

        it('should parse date and time correctly', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
25/12/2023,09:15,Test Fund,IE00TEST0003,LSE,XLON,10,100,GBP,-1000,GBP,-1000,GBP,1.0,,GBP,-1000,GBP,test-id-789`;

            const parser = new DeGiroParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].date.year).toBe(2023);
            expect(transactions[0].date.month).toBe(12);
            expect(transactions[0].date.day).toBe(25);
            expect(transactions[0].date.hour).toBe(9);
            expect(transactions[0].date.minute).toBe(15);
            expect(transactions[0].date.second).toBe(0);
        });

        it('should use custom timezone when specified', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Test Asset,IE00TEST0004,LSE,XLON,10,100,GBP,-1000,GBP,-1000,GBP,1.0,,GBP,-1000,GBP,test-id`;

            const parser = new DeGiroParser({ timezone: 'America/New_York' });
            const transactions = await parser.parse(csv);

            expect(transactions[0].date.zoneName).toBe('America/New_York');
        });

        it('should handle GBP transactions with exchange rate 1.0', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
10/01/2024,11:00,Vodafone Group,IE00TEST0005,LSE,XLON,500,1.50,GBP,-750.00,GBP,-750.00,GBP,1.0,-5.00,GBP,-755.00,GBP,test-id`;

            const parser = new DeGiroParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].currency).toBe('GBP');
            expect(transactions[0].exchangeRate.equals(new Decimal(1.0))).toBe(true);
        });

        it('should handle EUR transactions with exchange rate', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
05/02/2024,13:45,European Company,IE00TEST0006,LSE,XLON,200,25.50,EUR,-5100.00,EUR,-4350.00,GBP,1.17,-3.00,GBP,-4353.00,GBP,test-id`;

            const parser = new DeGiroParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].currency).toBe('EUR');
            expect(transactions[0].exchangeRate.equals(new Decimal(1.17))).toBe(true);
        });

        it('should handle zero fee (empty fee field)', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Test Asset,IE00TEST0007,LSE,XLON,10,100,GBP,-1000,GBP,-1000,GBP,1.0,,GBP,-1000,GBP,test-id`;

            const parser = new DeGiroParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].fee.equals(new Decimal(0))).toBe(true);
        });

        it('should handle missing exchange rate (assumes GBP)', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Test Asset,IE00TEST0008,LSE,XLON,10,100,GBP,-1000,GBP,-1000,GBP,,,GBP,-1000,GBP,test-id`;

            const parser = new DeGiroParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].exchangeRate.equals(new Decimal(1.0))).toBe(true);
        });

        it('should parse multiple transactions', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Apple Inc,IE00TEST0009,LSE,XLON,100,150.50,USD,-15050.00,USD,-11900.00,GBP,1.26,-10.00,GBP,-11910.00,GBP,test-1
20/06/2024,14:25,Microsoft Corporation,IE00TEST0010,LSE,XLON,-50,200.00,USD,10000.00,USD,8000.00,GBP,1.25,-5.00,GBP,7995.00,GBP,test-2
10/01/2024,11:00,Vodafone Group,IE00TEST0011,LSE,XLON,500,1.50,GBP,-750.00,GBP,-750.00,GBP,1.0,-3.00,GBP,-753.00,GBP,test-3`;

            const parser = new DeGiroParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(3);
            expect(transactions[0].asset).toBe('Apple Inc');
            expect(transactions[0].type).toBe('BUY');
            expect(transactions[1].asset).toBe('Microsoft Corporation');
            expect(transactions[1].type).toBe('SELL');
            expect(transactions[2].asset).toBe('Vodafone Group');
            expect(transactions[2].type).toBe('BUY');
        });

        it('should return empty array for CSV with only headers', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID`;

            const parser = new DeGiroParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(0);
        });

        it('should handle decimal quantities', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Test Fund,IE00TEST0012,LSE,XLON,10.5678,100.25,GBP,-1059.67,GBP,-1059.67,GBP,1.0,,GBP,-1059.67,GBP,test-id`;

            const parser = new DeGiroParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].quantity.equals(new Decimal('10.5678'))).toBe(true);
            expect(transactions[0].price.equals(new Decimal('100.25'))).toBe(true);
        });

        it('should handle GBp (pence) and convert to GBP (pounds)', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Test Fund,IE00TEST0013,LSE,XLON,100,12345,GBp,-123450,GBp,-123450,GBp,1.0,,GBp,-123450,GBp,test-id`;

            const parser = new DeGiroParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].currency).toBe('GBP');
            expect(transactions[0].price.equals(new Decimal('123.45'))).toBe(true); // 12345 pence = 123.45 pounds
            expect(transactions[0].exchangeRate.equals(new Decimal(1.0))).toBe(true);
        });

        it('should handle GBp with fees and convert to GBP', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Test Fund,IE00TEST0014,LSE,XLON,100,12345,GBp,-123450,GBp,-123450,GBp,1.0,-250,GBp,-123700,GBp,test-id`;

            const parser = new DeGiroParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].currency).toBe('GBP');
            expect(transactions[0].price.equals(new Decimal('123.45'))).toBe(true); // 12345 pence = 123.45 pounds
            expect(transactions[0].fee.equals(new Decimal('2.50'))).toBe(true); // 250 pence = 2.50 pounds
        });
    });

    describe('Invalid date/time formats', () => {
        it('should throw error for invalid date format', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
2024-03-15,10:30,Test Asset,IE00TEST0013,LSE,XLON,10,100,GBP,-1000,GBP,-1000,GBP,1.0,,GBP,-1000,GBP,test-id`;

            const parser = new DeGiroParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: Invalid date format "2024-03-15". Expected DD/MM/YYYY format'
            );
        });

        it('should throw error for invalid time format', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30:45,Test Asset,IE00TEST0014,LSE,XLON,10,100,GBP,-1000,GBP,-1000,GBP,1.0,,GBP,-1000,GBP,test-id`;

            const parser = new DeGiroParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: Invalid time format "10:30:45". Expected HH:MM format'
            );
        });

        it('should throw error for empty date field', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
,10:30,Test Asset,IE00TEST0015,LSE,XLON,10,100,GBP,-1000,GBP,-1000,GBP,1.0,,GBP,-1000,GBP,test-id`;

            const parser = new DeGiroParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Date field is empty');
        });

        it('should throw error for empty time field', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,,Test Asset,IE00TEST0016,LSE,XLON,10,100,GBP,-1000,GBP,-1000,GBP,1.0,,GBP,-1000,GBP,test-id`;

            const parser = new DeGiroParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Time field is empty');
        });

        it('should throw error for invalid date values', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
32/13/2024,10:30,Test Asset,IE00TEST0017,LSE,XLON,10,100,GBP,-1000,GBP,-1000,GBP,1.0,,GBP,-1000,GBP,test-id`;

            const parser = new DeGiroParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Invalid date/time');
        });
    });

    describe('Invalid transaction data', () => {
        it('should throw error for empty product field', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,,IE00TEST0018,LSE,XLON,10,100,GBP,-1000,GBP,-1000,GBP,1.0,,GBP,-1000,GBP,test-id`;

            const parser = new DeGiroParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Asset field is empty');
        });

        it('should throw error for empty quantity', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Test Asset,IE00TEST0019,LSE,XLON,,100,GBP,-1000,GBP,-1000,GBP,1.0,,GBP,-1000,GBP,test-id`;

            const parser = new DeGiroParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Quantity field is empty');
        });

        it('should throw error for zero quantity', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Test Asset,IE00TEST0020,LSE,XLON,0,100,GBP,-1000,GBP,-1000,GBP,1.0,,GBP,-1000,GBP,test-id`;

            const parser = new DeGiroParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Quantity cannot be zero');
        });

        it('should throw error for invalid quantity', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Test Asset,IE00TEST0021,LSE,XLON,invalid,100,GBP,-1000,GBP,-1000,GBP,1.0,,GBP,-1000,GBP,test-id`;

            const parser = new DeGiroParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: Quantity is not a valid number: "invalid"'
            );
        });

        it('should throw error for negative price', async () => {
            const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Test Asset,IE00TEST0022,LSE,XLON,10,-100,GBP,1000,GBP,1000,GBP,1.0,,GBP,1000,GBP,test-id`;

            const parser = new DeGiroParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Price cannot be negative');
        });
    });

    describe('Missing required columns', () => {
        it('should throw error when required column is missing', async () => {
            const csv = `Date,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,Test Asset,IE00TEST0024,LSE,XLON,10,100,GBP,-1000,GBP,-1000,GBP,1.0,,GBP,-1000,GBP,test-id`;

            const parser = new DeGiroParser();

            await expect(parser.parse(csv)).rejects.toThrow('Missing required columns: Time');
        });
    });
});
