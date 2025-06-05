// High-precision math functions from hp_math.glsl are assumed to be prepended here.
// Make sure PRECISION_N is defined in hp_math.glsl (e.g., #define PRECISION_N 4)

precision highp float; // Underlying floats are still highp

varying vec2 v_texCoord;

// New High-Precision Uniforms
uniform float u_hp_scale_re[PRECISION_N]; // Effectively 1.0 / zoom
uniform float u_hp_offset_re[PRECISION_N];
uniform float u_hp_offset_im[PRECISION_N];
uniform float u_aspectRatio; // canvas.width / canvas.height

uniform int u_maxIterations;

void main() {
    // Temporary arrays for hp numbers. GLSL requires fixed-size arrays.
    float c_re[PRECISION_N];
    float c_im[PRECISION_N];
    float z_re[PRECISION_N];
    float z_im[PRECISION_N];
    float z_sq_re_calc[PRECISION_N]; // To store z_re*z_re - z_im*z_im
    float z_sq_im_calc[PRECISION_N]; // To store 2*z_re*z_im

    // Temporary arrays for intermediate calculations
    float temp_hp1[PRECISION_N];
    float temp_hp2[PRECISION_N];
    float magnitude_sq[PRECISION_N];

    // Convert v_texCoord from [0,1] to complex plane coordinates 'c' using HP math
    // Map texCoord to screen space: x in [-aspectRatio, aspectRatio], y in [-1, 1]
    float screen_x_float = (v_texCoord.x - 0.5) * 2.0 * u_aspectRatio;
    float screen_y_float = (v_texCoord.y - 0.5) * 2.0;

    float hp_screen_x[PRECISION_N];
    floatToHp(screen_x_float, hp_screen_x);

    float hp_screen_y[PRECISION_N];
    floatToHp(screen_y_float, hp_screen_y);

    // c_re = (hp_screen_x * u_hp_scale_re) + u_hp_offset_re;
    hp_mul(hp_screen_x, u_hp_scale_re, temp_hp1);
    hp_add(temp_hp1, u_hp_offset_re, c_re);

    // c_im = (hp_screen_y * u_hp_scale_re) + u_hp_offset_im; // Assuming uniform scale for re/im
    hp_mul(hp_screen_y, u_hp_scale_re, temp_hp1);
    hp_add(temp_hp1, u_hp_offset_im, c_im);

    // Initialize z for Mandelbrot iteration: z = 0 + 0i
    floatToHp(0.0, z_re);
    floatToHp(0.0, z_im);

    int iterations = 0; // Use 'iterations' to avoid confusion with loop variable 'i'
    for (int i_loop = 0; i_loop < 100000; ++i_loop) { // Hard cap on loop to prevent infinite loops from shader errors
        if (iterations >= u_maxIterations) break;

        // z_next_re = z_re*z_re - z_im*z_im + c_re
        // z_next_im = 2*z_re*z_im + c_im

        // Calculate z_re*z_re and z_im*z_im
        float zr_sq[PRECISION_N];
        hp_mul(z_re, z_re, zr_sq);
        float zi_sq[PRECISION_N];
        hp_mul(z_im, z_im, zi_sq);

        // Calculate z_sq_re_calc = zr_sq - zi_sq
        hp_sub(zr_sq, zi_sq, z_sq_re_calc);

        // Calculate z_sq_im_calc = 2.0 * z_re * z_im
        float hp_two[PRECISION_N];
        floatToHp(2.0, hp_two);
        hp_mul(z_re, z_im, temp_hp1);       // temp_hp1 = z_re * z_im
        hp_mul(hp_two, temp_hp1, z_sq_im_calc); // z_sq_im_calc = 2.0 * temp_hp1

        // Update z: z_re = z_sq_re_calc + c_re; z_im = z_sq_im_calc + c_im;
        hp_add(z_sq_re_calc, c_re, z_re);
        hp_add(z_sq_im_calc, c_im, z_im);

        // Check escape condition: dot(z,z) > 4.0  (i.e. z_re*z_re + z_im*z_im > 4.0)
        // We already have zr_sq and zi_sq from this iteration's z_re and z_im (before update)
        // Need to re-calculate zr_sq and zi_sq with *new* z_re, z_im
        float new_zr_sq[PRECISION_N];
        hp_mul(z_re, z_re, new_zr_sq);
        float new_zi_sq[PRECISION_N];
        hp_mul(z_im, z_im, new_zi_sq);
        hp_add(new_zr_sq, new_zi_sq, magnitude_sq);

        if (hp_greaterThan_float(magnitude_sq, 4.0)) {
            break;
        }
        iterations++;
    }

    // Coloring
    if (iterations == u_maxIterations) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // In the set
    } else {
        // Smooth coloring based on escape iteration and magnitude
        // float smoothed_iter = float(iterations) + 1.0 - log(log(sqrt(magnitude_sq[0] + magnitude_sq[1]))) / log(2.0);
        // Using just iterations for now, as magnitude_sq is HP. Converting magnitude_sq to float for log is tricky.
        // A simple approach:
        float iter_float = float(iterations);

        // Color based on iterations (simple cyclic color)
        // Using a common HSV to RGB conversion
        float hue = mod(iter_float * 0.05, 1.0); // Adjust 0.05 for color density
        float saturation = 0.8;
        float value = 1.0;

        if (iter_float < 2.0) value = iter_float / 2.0; // Fade in black for very low iterations

        vec3 hsv = vec3(hue, saturation, value);
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(hsv.xxx + K.xyz) * 6.0 - K.www);
        gl_FragColor = vec4(hsv.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), hsv.y), 1.0);
    }
}
