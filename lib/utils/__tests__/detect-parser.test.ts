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
    });
});
