import { Decimal } from 'decimal.js';
import { decimalToFloatNArray, PRECISION_LEVEL_N } from './precisionUtils';

describe('decimalToFloatNArray', () => {
  const N = PRECISION_LEVEL_N; // Using the exported N for consistency

  // Helper to reconstruct the Decimal value from parts for testing
  const reconstructDecimal = (parts) => {
    let sum = new Decimal(0);
    parts.forEach(part => {
      // It's important to convert part to string if it's a float,
      // to maintain precision when creating new Decimal for summation.
      sum = sum.plus(new Decimal(String(part)));
    });
    return sum;
  };

  test('should convert a simple integer', () => {
    const d = new Decimal(123);
    const parts = decimalToFloatNArray(d, N);
    expect(parts[0]).toBe(123);
    for (let i = 1; i < N; i++) {
      expect(parts[i]).toBe(0);
    }
    const reconstructed = reconstructDecimal(parts);
    expect(reconstructed.equals(d)).toBe(true);
  });

  test('should convert a simple float that is exactly representable', () => {
    const val = 123.5; // Exactly representable as float
    const d = new Decimal(val);
    const parts = decimalToFloatNArray(d, N);
    expect(parts[0]).toBe(val);
    for (let i = 1; i < N; i++) {
      expect(parts[i]).toBe(0);
    }
    const reconstructed = reconstructDecimal(parts);
    expect(reconstructed.equals(d)).toBe(true);
  });

  test('should convert a typical float (not always exact sum for N parts after first)', () => {
    const val = 123.456;
    const d = new Decimal(val); // d will hold this with high precision
    const parts = decimalToFloatNArray(d, N);

    expect(parts[0]).toBe(val); // The first part should be the closest float

    // The sum of parts should be very close to the original Decimal
    const reconstructed = reconstructDecimal(parts);
    const diff = d.minus(reconstructed).abs();
    // Tolerance needs to be set based on expected precision of N floats.
    // For N=4, this is roughly quadruple precision, so error should be very small.
    expect(diff.toNumber()).toBeLessThan(1e-15); // Typical float precision for the final error
  });


  test('should convert a high precision Decimal', () => {
    const highPrecisionStr = "1.2345678901234567890123456789";
    const d = new Decimal(highPrecisionStr);
    const parts = decimalToFloatNArray(d, N);

    const reconstructed = reconstructDecimal(parts);
    const diff = d.minus(reconstructed).abs();
    // Using Decimal.set({ precision: 50 }) or more for d might be needed if default 20 isn't enough for the string.
    // The default precision of decimal.js (20 digits) is less than the input string here.
    // Let's adjust the expectation or the Decimal precision for the test.
    // For this test, let's assume default precision for Decimal creation, and check consistency.
    // The parts will try to represent 'new Decimal(highPrecisionStr)' which itself is truncated to decimal.js precision.

    // Check that the first part is the float representation of d (which is d.toNumber())
    expect(parts[0]).toBe(d.toNumber());
    expect(parts.some(p => p !== 0 || Object.is(p, -0) )).toBe(true); // Check not all zero (unless input is 0)

    // The reconstructed sum from float parts should be close to the original Decimal value
    // up to the precision limitations of summing N floats.
    // The error bound here is tricky. It's related to (N-1) times epsilon roughly for the sum.
    expect(diff.toNumber()).toBeLessThan(1e-15); // Expect error within standard float epsilon range for the sum
  });

  test('should convert a high precision Decimal with increased internal precision for Decimal', () => {
    const oldPrecision = Decimal.precision;
    Decimal.set({ precision: 30 }); // Set higher precision for this test

    const highPrecisionStr = "1.2345678901234567890123456789"; // 29 decimal places
    const d = new Decimal(highPrecisionStr);
    const parts = decimalToFloatNArray(d, N);

    const reconstructed = reconstructDecimal(parts);
    const diff = d.minus(reconstructed).abs();

    expect(parts[0]).toBe(d.toNumber());
    expect(diff.toNumber()).toBeLessThan(1e-15);

    Decimal.set({ precision: oldPrecision }); // Reset precision
  });


  test('should convert zero', () => {
    const d = new Decimal(0);
    const parts = decimalToFloatNArray(d, N);
    parts.forEach(part => expect(part).toBe(0));
    const reconstructed = reconstructDecimal(parts);
    expect(reconstructed.equals(d)).toBe(true);
  });

  test('should convert a negative number with high precision', () => {
    const oldPrecision = Decimal.precision;
    Decimal.set({ precision: 30 });

    const highPrecisionStr = "-1.2345678901234567890123456789";
    const d = new Decimal(highPrecisionStr);
    const parts = decimalToFloatNArray(d, N);

    const reconstructed = reconstructDecimal(parts);
    const diff = d.minus(reconstructed).abs();
    expect(diff.toNumber()).toBeLessThan(1e-15);
    expect(parts[0]).toBe(d.toNumber()); // First part should be the most significant float part

    Decimal.set({ precision: oldPrecision });
  });

  test('input value as string number', () => {
    const val = "123.456789123456789";
    const d = new Decimal(val);
    const parts = decimalToFloatNArray(val, N); // Pass string directly
    const reconstructed = reconstructDecimal(parts);
    const diff = d.minus(reconstructed).abs();
    expect(diff.toNumber()).toBeLessThan(1e-15);
  });

  test('input value as JavaScript number', () => {
    const val = 123.45678912345678; // This will have standard float precision
    const d = new Decimal(String(val)); // Reference Decimal created from stringified float
    const parts = decimalToFloatNArray(val, N); // Pass number directly

    // The parts should sum up to a Decimal that's very close to the Decimal created from string(val)
    const reconstructed = reconstructDecimal(parts);
    const diff = d.minus(reconstructed).abs();
    expect(diff.toNumber()).toBeLessThan(1e-15);
    // The first part should be the number itself if it's passed as a float
    expect(parts[0]).toBe(val);
  });

  test('should handle numComponents argument', () => {
    const d = new Decimal("1.234567890123456789");
    const parts2 = decimalToFloatNArray(d, 2);
    expect(parts2.length).toBe(2);
    const reconstructed2 = reconstructDecimal(parts2);
    expect(d.minus(reconstructed2).abs().toNumber()).toBeLessThan(1e-15);

    const parts5 = decimalToFloatNArray(d, 5);
    expect(parts5.length).toBe(5);
    const reconstructed5 = reconstructDecimal(parts5);
    expect(d.minus(reconstructed5).abs().toNumber()).toBeLessThan(1e-15);
  });

});
