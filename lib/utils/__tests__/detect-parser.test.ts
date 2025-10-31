import { describe, it, expect } from 'vitest';
import { detectCSVFormat } from '../detect-parser';

describe('CSV Format Detection', () => {
    it('should detect Raw CSV format', () => {
        const csv = `date,type,asset,quantity,price,currency,exchangeRate,fee
2024-01-15,BUY,AAPL,10,150.50,USD,0.79,9.99`;

        expect(detectCSVFormat(csv)).toBe('raw');
    });

    it('should detect Vanguard format', () => {
        const csv = `Date,Details,Amount,Balance
01/01/2020,Bought 10.5000 Test Fund,"-1,500.00",0`;

        expect(detectCSVFormat(csv)).toBe('vanguard');
    });

    it('should detect IG format', () => {
        const csv = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID
15-03-2024,10:30:45,TRADE,Apple Inc,BUY,100,150.50,USD,-15050.00,10,5,-15065.00,0.79,LIMIT,XNAS,Y,17-03-2024,TEST123`;

        expect(detectCSVFormat(csv)).toBe('ig');
    });

    it('should detect DeGiro format', () => {
        const csv = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID
15/03/2024,10:30,Test Fund,IE00TEST0001,LSE,XLON,100,150.50,USD,-15050.00,USD,-11900.00,GBP,1.26,-10.00,GBP,-11910.00,GBP,test-id-123`;

        expect(detectCSVFormat(csv)).toBe('degiro');
    });

    it('should detect Raw CSV with different column order', () => {
        const csv = `type,date,asset,fee,quantity,price,currency,exchangeRate
BUY,2024-01-15,AAPL,9.99,10,150.50,USD,0.79`;

        expect(detectCSVFormat(csv)).toBe('raw');
    });

    it('should detect Vanguard format with whitespace in headers', () => {
        const csv = `  Date  ,  Details  ,  Amount  ,  Balance  
01/01/2020,Bought 10.5000 Test Fund,"-1,500.00",0`;

        expect(detectCSVFormat(csv)).toBe('vanguard');
    });

    it('should detect IG format with whitespace in headers', () => {
        const csv = `  TextDate  ,  Time  ,  Activity  ,  Market  ,  Direction  ,  Quantity  ,  Price  ,  Currency  ,  Consideration  ,  Commission  ,  Charges  ,  Cost/Proceeds  ,  Conversion rate  ,  Order type  ,  Venue ID  ,  Settled?  ,  Settlement date  ,  Order ID  
15-03-2024,10:30:45,TRADE,Apple Inc,BUY,100,150.50,USD,-15050.00,10,5,-15065.00,0.79,LIMIT,XNAS,Y,17-03-2024,TEST123`;

        expect(detectCSVFormat(csv)).toBe('ig');
    });

    it('should detect DeGiro format with whitespace in headers', () => {
        const csv = `  Date  ,  Time  ,  Product  ,  ISIN  ,  Reference  ,  Venue  ,  Quantity  ,  Price  ,,  Local value  ,,  Value  ,,  Exchange rate  ,  Transaction and/or third  ,,  Total  ,,  Order ID  
15/03/2024,10:30,Test Fund,IE00TEST0001,LSE,XLON,100,150.50,USD,-15050.00,USD,-11900.00,GBP,1.26,-10.00,GBP,-11910.00,GBP,test-id-123`;

        expect(detectCSVFormat(csv)).toBe('degiro');
    });

    it('should return unknown for unrecognized format', () => {
        const csv = `foo,bar,baz
1,2,3`;

        expect(detectCSVFormat(csv)).toBe('unknown');
    });

    it('should return unknown for empty CSV', () => {
        expect(detectCSVFormat('')).toBe('unknown');
    });

    it('should handle CSV with only headers', () => {
        const csvRaw = `date,type,asset,quantity,price,currency,exchangeRate,fee`;
        expect(detectCSVFormat(csvRaw)).toBe('raw');

        const csvVanguard = `Date,Details,Amount,Balance`;
        expect(detectCSVFormat(csvVanguard)).toBe('vanguard');

        const csvIG = `TextDate,Time,Activity,Market,Direction,Quantity,Price,Currency,Consideration,Commission,Charges,Cost/Proceeds,Conversion rate,Order type,Venue ID,Settled?,Settlement date,Order ID`;
        expect(detectCSVFormat(csvIG)).toBe('ig');

        const csvDeGiro = `Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction and/or third,,Total,,Order ID`;
        expect(detectCSVFormat(csvDeGiro)).toBe('degiro');
    });
});
