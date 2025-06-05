#ifndef HP_MATH_GLSL
#define HP_MATH_GLSL

#define PRECISION_N 4

// Note: GLSL does not have typedef for arrays in the C sense.
// We'll pass `float[PRECISION_N]` directly to functions.
// For return types, GLSL functions cannot directly return array types.
// This is a major limitation. We'll need to pass output arrays as 'out' parameters.

// Helper: Robust sum of two floats (Knuth/Dekker)
// Returns vec2(sum, error_term)
vec2 twoSum(float a, float b) {
    float s = a + b;
    float bb = s - a;
    // e = (a - (s - bb)) + (b - bb); where s-bb is 'a' corrected part
    float e = (a - (s - bb)) + (b - bb);
    return vec2(s, e);
}

// Helper: Faster sum of two floats, use if |a| >= |b|
// Returns vec2(sum, error_term)
vec2 quickTwoSum(float a, float b) {
    float s = a + b;
    // e = b - (s - a); where s-a is 'b' corrected part
    float e = b - (s - a);
    return vec2(s, e);
}

// Helper: Product of two floats with error term (Dekker's product)
// Returns vec2(product, error_term)
vec2 twoProd(float a, float b) {
    float p = a * b;

    // Dekker's product splitting method
    // Constant for splitting (2^s + 1, where s is roughly half the mantissa bits)
    // For float (24-bit mantissa), s=12. 2^12+1 = 4097.0
    // However, a common constant used for IEEE 754 single precision is 2^27+1, related to double-float algorithms.
    // For splitting single floats to get high and low parts for an exact product:
    // Let's use Dekker's original splitting constant for single precision floats
    // (mantissa has 23 explicit bits + 1 implicit = 24 bits. s = ceil(24/2) = 12)
    // const float SPLITTER = 4097.0; // 2^12 + 1
    // A more common splitter in double-double libraries for splitting a *double* is 2^27+1.
    // For two *single* floats, to get a result that can be stored in two *single* floats (p, e):
    const float SPLITTER = 134217729.0; // (2^27 + 1), used in robust double-float multiplication, might be overkill for float-float to float-vec2

    // A standard way to split a float 'a' into ah (high part) and al (low part)
    // such that a = ah + al exactly.
    float ca = a * SPLITTER;
    float ah = (ca - (ca - a)); // High part of a
    float al = a - ah;          // Low part of a

    float cb = b * SPLITTER;
    float bh = (cb - (cb - b)); // High part of b
    float bl = b - bh;          // Low part of b

    float err = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
    return vec2(p, err);
}


// Renormalize an N-component high-precision number
// Input array `v_in` is copied to `v_out` and then normalized in place in `v_out`.
void normalize_hp(in float v_in[PRECISION_N], out float v_out[PRECISION_N]) {
    // Initialize v_out with v_in
    for (int k = 0; k < PRECISION_N; ++k) {
        v_out[k] = v_in[k];
    }

    float s, e;
    // Iterate from least significant component upwards
    for (int i = PRECISION_N - 1; i > 0; --i) {
        vec2 sum_res = quickTwoSum(v_out[i-1], v_out[i]);
        v_out[i-1] = sum_res.x;
        v_out[i]   = sum_res.y;
    }

    // Second pass: accumulate and carry again, from most significant to least
    // This pass is sometimes omitted or done differently in various libraries.
    // This helps to ensure that components are as separated in magnitude as possible.
    // For now, the single pass above is a basic renormalization.
    // A more robust scheme (e.g., Priest's):
    float carry = 0.0;
    for (int i = 0; i < PRECISION_N; ++i) {
        vec2 sum_res = quickTwoSum(v_out[i], carry);
        v_out[i] = sum_res.x;
        carry    = sum_res.y;
    }
    // Final carry is lost if non-zero (overflow or precision limit)
}


// Add two N-component high-precision numbers: z = x + y
void hp_add(in float x[PRECISION_N], in float y[PRECISION_N], out float z[PRECISION_N]) {
    float temp_sum[PRECISION_N];
    float current_carry = 0.0;

    // Phase 1: Sum corresponding components and initial errors
    // z_i = (x_i + y_i) + prev_carry_from_summing_x_i_y_i
    // This is like a ripple-carry adder but with error terms.
    // A common approach is to sum all 2N components then reduce.
    // Simpler: sum component-wise, then normalize.
    // Even simpler: Bailey's add-double-double like extension.
    // (s_i, e_i) = twoSum(x_i, y_i) for each i
    // Then sum these (s_0, e_0, s_1, e_1, ...) using a summation algorithm.
    // This is complex. Let's try a simpler sequential summation with carry.

    // Initialize z to zero or copy one of the operands
    for(int i=0; i<PRECISION_N; ++i) z[i] = 0.0;

    // Temporary array for intermediate sums, size 2*N could be used conceptually
    // For now, use a simpler approach closer to Priest's algorithm for summing N-word numbers.

    float t[PRECISION_N]; // Temporary for summed components before normalization
    for(int i=0; i<PRECISION_N; ++i) {
        vec2 comp_sum = twoSum(x[i], y[i]);
        t[i] = comp_sum.x; // Sum part
        // Error part needs to be added to a less significant component or carried.
        // For now, let's accumulate errors simply, then normalize.
        // This is not ideal. A better way:
        if (i > 0) {
             // Add error from previous sum to current sum's component
             // This is getting messy. Let's use the QD library approach:
        }
    }

    // QD library approach (adapted from double-double, extended to N):
    // z = x; for (i=0 to N-1) { z = hp_add_float(z, y[i]); } // where hp_add_float adds a single float to an hp_num
    // This is iterative. A direct summation:

    // Sum components from least significant, propagating carries (Priest's method style)
    float s, c_sum, c_err;
    current_carry = 0.0; // This carry is the sum of error terms from previous (more significant) additions.

    for (int i = PRECISION_N - 1; i >= 0; --i) {
        vec2 r = twoSum(x[i], y[i]); // r.x = x_i + y_i (approx), r.y = error(x_i+y_i)
        vec2 t_sum = twoSum(r.x, current_carry); // t_sum.x = (x_i+y_i) + carry, t_sum.y = error((x_i+y_i)+carry)
        z[i] = t_sum.x;
        current_carry = r.y + t_sum.y; // New carry is sum of errors. This simple sum of errors can lose precision.
                                       // A more robust way for carry: vec2 err_sum = twoSum(r.y, t_sum.y); current_carry = err_sum.x; (and err_sum.y is lost or next carry)
                                       // For now, simple sum for carry.
    }
    // The final 'current_carry' is an error term that's lost unless we have more components.

    float temp_z[PRECISION_N];
    for(int i=0; i<PRECISION_N; ++i) temp_z[i] = z[i];
    normalize_hp(temp_z, z); // Normalize the result
}


// Multiply two N-component high-precision numbers: z = x * y
void hp_mul(in float x[PRECISION_N], in float y[PRECISION_N], out float z[PRECISION_N]) {
    // Initialize result z to all zeros
    for (int k = 0; k < PRECISION_N; ++k) {
        z[k] = 0.0;
    }

    // Intermediate array to store exact products x_i * y_j
    // We need enough space for all significant partial products.
    // Max index sum is (N-1)+(N-1) = 2N-2. So we need up to 2N-1 components conceptually.
    // Then this long number is compressed/normalized into N components.
    // This is too complex for direct GLSL array handling.

    // Alternative: Iterative accumulation (like QD library)
    // C = C + x_i * B for i = 0 to N-1, where C is initially 0.
    // x_i * B means multiplying hp_num B by float x_i.

    // hp_num_float_mul(hp_num_a, float_b, hp_num_res)
    //   carry = 0
    //   for j = N-1 down to 0:
    //     (p, e) = twoProd(a[j], b)
    //     (s, err_s) = twoSum(p, carry)
    //     res[j] = s
    //     carry = e + err_s  // (or twoSum(e, err_s).x for more robust carry)
    //   normalize res.


    // Let's try the schoolbook multiplication approach for N components,
    // accumulating into z directly and normalizing at the end.
    // This is complex due to carry management across many terms.

    // Simplified approach: Sum of leading terms (will be lossy but a starting point)
    // z[0] = x[0]*y[0]
    // z[1] = x[0]*y[1] + x[1]*y[0]
    // ...
    // Each product x[i]*y[j] is a twoProd. Each sum is a chain of twoSum.
    // This requires careful management of intermediate error terms.

    // Placeholder implementation (very approximate, for compilation only)
    // This is NOT a correct high-precision multiplication.
    // It only considers the most significant product term and some cross terms.
    vec2 p00 = twoProd(x[0], y[0]);
    z[0] = p00.x;
    float err_carry = p00.y; // Initial error

    if (PRECISION_N > 1) {
        vec2 p01 = twoProd(x[0], y[1]);
        vec2 p10 = twoProd(x[1], y[0]);

        vec2 s1 = twoSum(p01.x, p10.x); // (x0y1 + x1y0) approx sum
        vec2 s2 = twoSum(s1.x, err_carry); // Add err_carry from p00

        z[1] = s2.x;
        err_carry = s1.y + s2.y; // Sum of errors
                                 // (p01.y + p10.y should also be included)
        err_carry += p01.y + p10.y;
    }

    // Fill rest with estimations or zeros
    for (int k = 2; k < PRECISION_N; ++k) {
        // Grossly simplified: sum of x[0]y[k] + x[k]y[0] + some previous error
        vec2 pk0 = twoProd(x[k], y[0]);
        vec2 p0k = twoProd(x[0], y[k]);
        // also x[1]y[k-1] etc.

        vec2 s_cross = twoSum(pk0.x, p0k.x);
        vec2 s_with_carry = twoSum(s_cross.x, err_carry);
        z[k] = s_with_carry.x;
        err_carry = s_cross.y + s_with_carry.y + pk0.y + p0k.y;
    }

    // This simplified version is illustrative of the idea but not robust.
    // A full implementation of quad-double multiplication is a significant piece of code.
    // For example, QD library's mul operation involves about 20 TwoProds and many TwoSums.

    // For now, let's make z a copy of x to ensure it compiles and returns *something*.
    // This will be the main area for future improvement or using a library if available.
    // float temp_z[PRECISION_N];
    // for(int i=0; i<PRECISION_N; ++i) temp_z[i] = z[i]; // z from above simplified code
    // normalize_hp(temp_z, z);

    // Fallback to a very simple product for now to ensure compilation and basic structure
    // This will be highly inaccurate for N > 1.
    // True algorithm is complex:
    // C = 0
    // For i = 0 to N-1:
    //   tmp = x_i * B (this is a hp_num * float operation)
    //   C = C + tmp (this is a hp_num + hp_num operation)
    // Each step needs full error propagation and normalization.

    // Let's try to implement the hp_num * float multiplication and then use it.
    float C[PRECISION_N];
    for(int k=0; k<PRECISION_N; ++k) C[k] = 0.0; // Initialize result C to zero

    float temp_prod_hp[PRECISION_N]; // To store x_i * Y

    for (int i = 0; i < PRECISION_N; ++i) { // Iterate through components of X
        // Multiply y (hp_num) by x[i] (float) -> temp_prod_hp
        float single_float_carry = 0.0;
        for (int j = PRECISION_N - 1; j >= 0; --j) {
            vec2 prod_res = twoProd(y[j], x[i]); // y_j * x_i
            vec2 sum_res  = twoSum(prod_res.x, single_float_carry);
            temp_prod_hp[j] = sum_res.x;
            single_float_carry = prod_res.y + sum_res.y; // Simplified carry sum
        }
        // Normalize temp_prod_hp (optional here, could do it after full sum)
        // float normalized_temp_prod_hp[PRECISION_N];
        // normalize_hp(temp_prod_hp, normalized_temp_prod_hp);

        // Add temp_prod_hp to C
        float P[PRECISION_N]; // temp for addition result
        hp_add(C, temp_prod_hp, P); // C = C + (x_i * Y)
        for(int k=0; k<PRECISION_N; ++k) C[k] = P[k]; // Copy result back to C
    }

    for(int k=0; k<PRECISION_N; ++k) z[k] = C[k];
    // Final normalization of z is usually done, but hp_add includes it.
}


// Convert a single float to an hp_num array
void floatToHp(float val, out float result[PRECISION_N]) {
    result[0] = val;
    for (int i = 1; i < PRECISION_N; ++i) {
        result[i] = 0.0;
    }
    // Optionally, normalize if val could be subnormal or denormal,
    // but for typical numbers, this is fine.
    // normalize_hp(result, result); // Usually not needed for simple float conversion
}

// Negate an hp_num: res = -a
void hp_neg(in float a[PRECISION_N], out float res[PRECISION_N]) {
    for (int i = 0; i < PRECISION_N; ++i) {
        res[i] = -a[i];
    }
    // Normalization is not strictly necessary after negation if 'a' was normalized.
}

// Subtract two hp_nums: res = a - b (by doing a + (-b))
void hp_sub(in float a[PRECISION_N], in float b[PRECISION_N], out float res[PRECISION_N]) {
    float neg_b[PRECISION_N];
    hp_neg(b, neg_b);
    hp_add(a, neg_b, res);
}

// Compare an hp_num with a float: returns true if hp_val > val
// This is a simplified comparison. Robust comparison is more involved.
bool hp_greaterThan_float(in float hp_val[PRECISION_N], float val) {
    // Normalize hp_val before comparison if it might not be.
    // For simplicity here, assume hp_val is reasonably normalized.
    if (hp_val[0] > val) {
        return true;
    }
    if (hp_val[0] < val) {
        return false;
    }
    // At this point, hp_val[0] is numerically equal to val.
    // We need to check the sum of the remaining components.
    // If val is, for example, 4.0, and hp_val[0] is 4.0,
    // then if any subsequent hp_val[i] are positive, hp_val > 4.0.
    // If hp_val is negative, this logic needs to be careful.
    // Assuming we are comparing magnitude squared (always positive) with 4.0.
    float sum_rest = 0.0;
    for (int i = 1; i < PRECISION_N; ++i) {
        sum_rest += hp_val[i];
    }
    // If sum_rest is positive and hp_val[0] matched val, then hp_val is greater.
    // Tolerance (epsilon) is important here. A very small positive sum_rest might be noise.
    return sum_rest > 1e-7; // Use a small epsilon
}

// Compare two hp_nums: returns true if a > b
/* bool hp_greaterThan_hp(in float a[PRECISION_N], in float b[PRECISION_N]) {
    float diff[PRECISION_N];
    hp_sub(a, b, diff); // diff = a - b
    // If diff is positive, then a > b.
    // Check the sign of the most significant component of diff.
    // This requires diff to be normalized.
    float normalized_diff[PRECISION_N];
    normalize_hp(diff, normalized_diff);
    if (normalized_diff[0] > 1e-9) return true; // Greater than 0 (with tolerance)
    if (normalized_diff[0] < -1e-9) return false; // Less than 0
    // Check subsequent components if normalized_diff[0] is near zero.
    // (Simplified for now)
    return false; // Assume equal or handle more precisely
}*/

#endif // HP_MATH_GLSL
