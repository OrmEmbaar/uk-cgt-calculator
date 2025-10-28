import { describe, it, expect } from 'vitest';
import { RawCSVParser } from '../raw-parser';
import Decimal from 'decimal.js';
import { DateTime } from 'luxon';

describe('RawCSVParser', () => {
    describe('Valid CSV parsing', () => {
        it('should parse a valid CSV with single transaction', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(1);
            expect(transactions[0].type).toBe('BUY');
            expect(transactions[0].asset).toBe('AAPL');
            expect(transactions[0].quantity.equals(new Decimal(10))).toBe(true);
            expect(transactions[0].price.equals(new Decimal(150.5))).toBe(true);
            expect(transactions[0].currency).toBe('USD');
            expect(transactions[0].exchangeRate.equals(new Decimal(0.79))).toBe(true);
            expect(transactions[0].fee.equals(new Decimal(9.99))).toBe(true);
        });

        it('should parse date with default timezone (Europe/London)', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].date.zoneName).toBe('Europe/London');
            expect(transactions[0].date.year).toBe(2024);
            expect(transactions[0].date.month).toBe(1);
            expect(transactions[0].date.day).toBe(15);
        });

        it('should parse date with explicit timezone in ISO8601 format', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15T14:30:00Z,BUY,AAPL,10,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].date.zoneName).toBe('UTC');
            expect(transactions[0].date.hour).toBe(14);
            expect(transactions[0].date.minute).toBe(30);
        });

        it('should parse date with explicit timezone offset', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15T14:30:00-05:00,BUY,AAPL,10,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].date.offset).toBe(-300); // -5 hours in minutes
        });

        it('should use custom timezone when specified', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser({ timezone: 'America/New_York' });
            const transactions = await parser.parse(csv);

            expect(transactions[0].date.zoneName).toBe('America/New_York');
        });

        it('should parse multiple transactions', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,0.79,9.99
2024-02-20,SELL,AAPL,5,155.00,USD,0.80,8.50
2024-03-10,BUY,GOOGL,3,2800.00,USD,0.79,15.00`;

            const parser = new RawCSVParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(3);
            expect(transactions[0].type).toBe('BUY');
            expect(transactions[1].type).toBe('SELL');
            expect(transactions[2].type).toBe('BUY');
            expect(transactions[2].asset).toBe('GOOGL');
        });

        it('should parse transaction with zero fee', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,0.79,0`;

            const parser = new RawCSVParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].fee.equals(new Decimal(0))).toBe(true);
        });

        it('should parse GBP transaction with exchange rate 1.0', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,VOD,100,1.50,GBP,1.0,5.00`;

            const parser = new RawCSVParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].currency).toBe('GBP');
            expect(transactions[0].exchangeRate.equals(new Decimal(1.0))).toBe(true);
        });

        it('should handle lowercase transaction types', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,buy,AAPL,10,150.50,USD,0.79,9.99
2024-02-20,sell,AAPL,5,155.00,USD,0.80,8.50`;

            const parser = new RawCSVParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].type).toBe('BUY');
            expect(transactions[1].type).toBe('SELL');
        });

        it('should handle lowercase currency codes', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,usd,0.79,9.99`;

            const parser = new RawCSVParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].currency).toBe('USD');
        });

        it('should return empty array for CSV with only headers', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee`;

            const parser = new RawCSVParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(0);
        });
    });

    describe('Invalid date formats', () => {
        it('should throw error for invalid date format', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
15/01/2024,BUY,AAPL,10,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Invalid date format "15/01/2024"');
        });

        it('should throw error for empty date field', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
,BUY,AAPL,10,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Date field is empty');
        });

        it('should throw error for completely invalid date', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
not-a-date,BUY,AAPL,10,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Invalid date format');
        });
    });

    describe('Invalid transaction types', () => {
        it('should throw error for invalid transaction type', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,HOLD,AAPL,10,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: Transaction type must be BUY or SELL, got "HOLD"'
            );
        });

        it('should throw error for empty transaction type', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,,AAPL,10,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Transaction type field is empty');
        });
    });

    describe('Missing required columns', () => {
        it('should throw error when date column is missing', async () => {
            const csv = `type,asset,quantity,price,currency,exchangeRate,fee
BUY,AAPL,10,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Missing required columns: date');
        });

        it('should throw error when multiple columns are missing', async () => {
            const csv = `date,type,asset
2024-01-15,BUY,AAPL`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Missing required columns');
        });
    });

    describe('Invalid decimal values', () => {
        it('should throw error for non-numeric quantity', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,ten,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: quantity is not a valid number: "ten"'
            );
        });

        it('should throw error for negative quantity', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,-10,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: quantity cannot be negative');
        });

        it('should throw error for empty quantity', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: quantity field is empty');
        });

        it('should throw error for negative price', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,-150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: price cannot be negative');
        });

        it('should throw error for non-numeric fee', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,0.79,free`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: fee is not a valid number: "free"');
        });

        it('should throw error for negative fee', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,0.79,-9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: fee cannot be negative');
        });
    });

    describe('Invalid exchange rates', () => {
        it('should throw error for zero exchange rate', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,0,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: exchangeRate must be greater than 0'
            );
        });

        it('should throw error for negative exchange rate', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,-0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: exchangeRate cannot be negative');
        });

        it('should throw error for empty exchange rate', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: exchangeRate field is empty');
        });
    });

    describe('Invalid currency codes', () => {
        it('should throw error for invalid currency code format', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,US,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 1: Currency code must be 3 letters, got "US"'
            );
        });

        it('should throw error for empty currency code', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Currency field is empty');
        });

        it('should throw error for numeric currency code', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,123,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Currency code must be 3 letters');
        });
    });

    describe('Invalid asset identifiers', () => {
        it('should throw error for empty asset field', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,,10,150.50,USD,0.79,9.99`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow('Row 1: Asset field is empty');
        });
    });

    describe('Error reporting with row numbers', () => {
        it('should report correct row number for error in second row', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,0.79,9.99
2024-02-20,INVALID,AAPL,5,155.00,USD,0.80,8.50`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 2: Transaction type must be BUY or SELL, got "INVALID"'
            );
        });

        it('should report correct row number for error in third row', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,0.79,9.99
2024-02-20,SELL,AAPL,5,155.00,USD,0.80,8.50
2024-03-10,BUY,GOOGL,invalid,2800.00,USD,0.79,15.00`;

            const parser = new RawCSVParser();

            await expect(parser.parse(csv)).rejects.toThrow(
                'Row 3: quantity is not a valid number: "invalid"'
            );
        });
    });

    describe('Edge cases', () => {
        it('should handle whitespace in fields', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
  2024-01-15  ,  BUY  ,  AAPL  ,  10  ,  150.50  ,  USD  ,  0.79  ,  9.99  `;

            const parser = new RawCSVParser();
            const transactions = await parser.parse(csv);

            expect(transactions).toHaveLength(1);
            expect(transactions[0].asset).toBe('AAPL');
            expect(transactions[0].type).toBe('BUY');
        });

        it('should handle decimal values with many decimal places', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10.123456789,150.505050,USD,0.791234567,9.99876543`;

            const parser = new RawCSVParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].quantity.equals(new Decimal('10.123456789'))).toBe(true);
            expect(transactions[0].price.equals(new Decimal('150.505050'))).toBe(true);
        });

        it('should handle very large numbers', async () => {
            const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,BRK.A,1,500000.00,USD,0.79,50.00`;

            const parser = new RawCSVParser();
            const transactions = await parser.parse(csv);

            expect(transactions[0].price.equals(new Decimal('500000.00'))).toBe(true);
        });
    });
});
