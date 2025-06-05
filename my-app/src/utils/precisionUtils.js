import { Decimal } from 'decimal.js';

// Default precision level (number of float components)
export const PRECISION_LEVEL_N = 4;

// Set precision for decimal.js operations if needed (default is 20)
// Decimal.set({ precision: 50 }); // Example: Increase precision for internal calculations

export function decimalToFloatNArray(value, numComponents = PRECISION_LEVEL_N) {
  let decimalValue;

  if (value instanceof Decimal) {
    decimalValue = value;
  } else {
    try {
      // Ensure that numbers are converted to string first for Decimal constructor
      // to avoid potential precision loss if 'value' is already a float.
      decimalValue = new Decimal(String(value));
    } catch (e) {
      throw new Error("Input must be a Decimal instance or convertible to Decimal (e.g., string or number). Original error: " + e.message);
    }
  }

  const parts = new Array(numComponents).fill(0.0);
  let tempDecimal = decimalValue;

  for (let i = 0; i < numComponents; i++) {
    // Convert the current Decimal value (or remainder) to a standard JavaScript float
    const floatPart = tempDecimal.toNumber();
    parts[i] = floatPart;

    if (i < numComponents - 1) {
      // Calculate the remainder with full Decimal precision for the next iteration
      tempDecimal = tempDecimal.minus(new Decimal(floatPart));

      // Optimization: if remainder is exactly zero, all subsequent parts will also be zero.
      if (tempDecimal.isZero()) {
        // No need to explicitly fill the rest of 'parts' with 0.0 as it's pre-filled.
        break;
      }
    }
    // For the last component (i === numComponents - 1), parts[i] is already set.
    // tempDecimal might still hold a tiny residual error if decimalValue wasn't perfectly
    // representable by the sum of N floats, but parts[i] is our best float for this last chunk.
  }
  return parts;
}
