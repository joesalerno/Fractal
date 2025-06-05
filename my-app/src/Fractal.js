import React, { useEffect, useRef, useCallback } from 'react';
import { Decimal } from 'decimal.js';
import { decimalToFloatNArray, PRECISION_LEVEL_N } from './utils/precisionUtils';

// Vertex shader source (remains unchanged)
const vsSource = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_position * 0.5 + 0.5;
  }
`;

// GLSL source for high-precision math (hp_math.glsl)
const hpMathSource = `precision highp float;
#ifndef HP_MATH_GLSL
#define HP_MATH_GLSL

#define PRECISION_N 4

vec2 twoSum(float a, float b) {
    float s = a + b;
    float bb = s - a;
    float e = (a - (s - bb)) + (b - bb);
    return vec2(s, e);
}

vec2 quickTwoSum(float a, float b) {
    float s = a + b;
    float e = b - (s - a);
    return vec2(s, e);
}

vec2 twoProd(float a, float b) {
    float p = a * b;
    const float SPLITTER = 134217729.0; // (2^27 + 1)
    float ca = a * SPLITTER;
    float ah = (ca - (ca - a));
    float al = a - ah;
    float cb = b * SPLITTER;
    float bh = (cb - (cb - b));
    float bl = b - bh;
    float err = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
    return vec2(p, err);
}

void normalize_hp(in float v_in[PRECISION_N], out float v_out[PRECISION_N]) {
    for (int k = 0; k < PRECISION_N; ++k) {
        v_out[k] = v_in[k]; // Copy input to output working array
    }

    // Right-to-left pass (most significant component is at index 0)
    // Iterate from second to last component down to the second component (index 1)
    // Each step: v[i-1] = v[i-1] + v[i]
    for (int i = PRECISION_N - 1; i > 0; --i) {
        vec2 sum_result = twoSum(v_out[i-1], v_out[i]); // Use twoSum for robustness
        v_out[i-1] = sum_result.x;
        v_out[i]   = sum_result.y;
    }

    // Left-to-right pass for final carry propagation
    float new_carry = 0.0;
    for (int i = 0; i < PRECISION_N; ++i) {
        // If v_out[i] is large and new_carry is small, quickTwoSum is fine.
        // However, new_carry can accumulate. Using twoSum is safer.
        vec2 sum_result = twoSum(v_out[i], new_carry);
        v_out[i] = sum_result.x;
        new_carry = sum_result.y;
    }
    // If new_carry is non-zero here, it represents an overflow or underflow beyond PRECISION_N components.
}

void hp_add(in float x[PRECISION_N], in float y[PRECISION_N], out float z[PRECISION_N]) {
    float current_carry = 0.0;
    for (int i = PRECISION_N - 1; i >= 0; --i) {
        vec2 r = twoSum(x[i], y[i]); // sum of current components
        vec2 t_sum = twoSum(r.x, current_carry); // add carry from less significant position
        z[i] = t_sum.x;
        current_carry = twoSum(r.y, t_sum.y).x; // Sum errors to form new carry, more robustly
    }
    // Final current_carry is lost (overflow for this precision level)

    float temp_z[PRECISION_N]; // Temporary array for normalization input
    for(int i=0; i<PRECISION_N; ++i) temp_z[i] = z[i];
    normalize_hp(temp_z, z);
}

void hp_mul(in float x[PRECISION_N], in float y[PRECISION_N], out float z[PRECISION_N]) {
    float C[PRECISION_N];
    for(int k=0; k<PRECISION_N; ++k) C[k] = 0.0; // Initialize result C to zero

    float temp_prod_hp[PRECISION_N]; // To store the product of x[i] * Y
    float normalized_temp_prod_hp[PRECISION_N]; // For normalized version of above

    for (int i = 0; i < PRECISION_N; ++i) { // Iterate through components of X (x_i)
        if (x[i] == 0.0) {
            // If x[i] is zero, then x[i]*Y is zero. No need to add anything to C for this term.
            // hp_add requires its inputs to be somewhat normalized, so adding a zero array is fine.
            // We can effectively skip this iteration's addition to C.
            continue;
        }

        float single_float_carry = 0.0;
        for (int j = PRECISION_N - 1; j >= 0; --j) { // Calculate x[i] * y[j] and sum into temp_prod_hp
            vec2 prod_res = twoProd(y[j], x[i]); // y_j * x_i
            vec2 sum_res  = twoSum(prod_res.x, single_float_carry); // add carry
            temp_prod_hp[j] = sum_res.x;
            single_float_carry = twoSum(prod_res.y, sum_res.y).x; // Sum errors robustly for new carry
        }
        // Any remaining single_float_carry here is for a component less significant than temp_prod_hp[PRECISION_N-1]
        // and is effectively lost for this x_i * Y product line, which is standard.

        normalize_hp(temp_prod_hp, normalized_temp_prod_hp); // Normalize the x_i * Y product line

        // Add normalized_temp_prod_hp to C
        float P[PRECISION_N]; // temp for addition result
        hp_add(C, normalized_temp_prod_hp, P); // C = C + normalized(x_i * Y)
        for(int k=0; k<PRECISION_N; ++k) C[k] = P[k]; // Copy result back to C
    }

    // Final result C is already normalized because hp_add normalizes its output.
    for(int k=0; k<PRECISION_N; ++k) z[k] = C[k];
}

void floatToHp(float val, out float result[PRECISION_N]) {
    result[0] = val;
    for (int i = 1; i < PRECISION_N; ++i) {
        result[i] = 0.0;
    }
}

void hp_neg(in float a[PRECISION_N], out float res[PRECISION_N]) {
    for (int i = 0; i < PRECISION_N; ++i) {
        res[i] = -a[i];
    }
}

void hp_sub(in float a[PRECISION_N], in float b[PRECISION_N], out float res[PRECISION_N]) {
    float neg_b[PRECISION_N];
    hp_neg(b, neg_b);
    hp_add(a, neg_b, res);
}

bool hp_greaterThan_float(in float hp_val[PRECISION_N], float val) {
    if (hp_val[0] > val) return true;
    if (hp_val[0] < val) return false;
    float sum_rest = 0.0;
    for (int i = 1; i < PRECISION_N; ++i) {
        sum_rest += hp_val[i];
    }
    return sum_rest > 1e-7;
}
#endif // HP_MATH_GLSL
`;

// Fragment shader source (fractal.frag)
const fsSourceOriginal = `
precision highp float;
varying vec2 v_texCoord;
uniform float u_hp_scale_re[PRECISION_N];
uniform float u_hp_offset_re[PRECISION_N];
uniform float u_hp_offset_im[PRECISION_N];
uniform float u_aspectRatio;
uniform int u_maxIterations;

void main() {
    float c_re[PRECISION_N];
    float c_im[PRECISION_N];
    float z_re[PRECISION_N];
    float z_im[PRECISION_N];
    float z_sq_re_calc[PRECISION_N];
    float z_sq_im_calc[PRECISION_N];
    float temp_hp1[PRECISION_N];
    float magnitude_sq[PRECISION_N];

    float screen_x_float = (v_texCoord.x - 0.5) * 2.0 * u_aspectRatio;
    float screen_y_float = (v_texCoord.y - 0.5) * 2.0;

    float hp_screen_x[PRECISION_N];
    floatToHp(screen_x_float, hp_screen_x);
    float hp_screen_y[PRECISION_N];
    floatToHp(screen_y_float, hp_screen_y);

    hp_mul(hp_screen_x, u_hp_scale_re, temp_hp1);
    hp_add(temp_hp1, u_hp_offset_re, c_re);
    hp_mul(hp_screen_y, u_hp_scale_re, temp_hp1);
    hp_add(temp_hp1, u_hp_offset_im, c_im);

    floatToHp(0.0, z_re);
    floatToHp(0.0, z_im);

    int iterations = 0;
    for (int i_loop = 0; i_loop < 100000; ++i_loop) {
        if (iterations >= u_maxIterations) break;

        float zr_sq[PRECISION_N];
        hp_mul(z_re, z_re, zr_sq);
        float zi_sq[PRECISION_N];
        hp_mul(z_im, z_im, zi_sq);
        hp_sub(zr_sq, zi_sq, z_sq_re_calc);

        float hp_two[PRECISION_N];
        floatToHp(2.0, hp_two);
        hp_mul(z_re, z_im, temp_hp1);
        hp_mul(hp_two, temp_hp1, z_sq_im_calc);

        hp_add(z_sq_re_calc, c_re, z_re);
        hp_add(z_sq_im_calc, c_im, z_im);

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

    if (iterations == u_maxIterations) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        float iter_float = float(iterations);
        float hue = mod(iter_float * 0.05, 1.0);
        float saturation = 0.8;
        float value = 1.0;
        if (iter_float < 2.0) value = iter_float / 2.0;

        vec3 hsv = vec3(hue, saturation, value);
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(hsv.xxx + K.xyz) * 6.0 - K.www);
        gl_FragColor = vec4(hsv.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), hsv.y), 1.0);
    }
}
`;

// Concatenate shader sources
const finalFsSource = hpMathSource + "\n" + fsSourceOriginal;

// Configure Decimal.js precision if needed (default is 20)
// Decimal.set({ precision: 30 }); // Example: for very deep zooms, might need more for JS side

const Fractal = () => {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const programRef = useRef(null);
  const bufferRef = useRef(null);

  const uniformLocationsRef = useRef({
    hpScaleRe: null,
    hpOffsetRe: null,
    hpOffsetIm: null,
    aspectRatio: null,
    maxIterations: null,
  });
  const attribLocationsRef = useRef({ vertexPosition: null });

  // State using Decimal.js
  const zoom = useRef(new Decimal(1.0));
  const offset = useRef({ re: new Decimal(-0.7), im: new Decimal(0.0) });
  const maxIterations = useRef(100); // Standard JS number is fine

  const isDragging = useRef(false);
  const lastMousePosition = useRef({ x: 0, y: 0 });

  const drawScene = useCallback(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    const shaderProgram = programRef.current;
    const positionBuffer = bufferRef.current;

    if (!gl || !canvas || !shaderProgram || !positionBuffer || !uniformLocationsRef.current.hpScaleRe) {
      return;
    }

    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(shaderProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(attribLocationsRef.current.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(attribLocationsRef.current.vertexPosition);

    // HP Uniforms
    const aspectRatioValue = gl.canvas.width / gl.canvas.height;
    const hpScaleVal = new Decimal(1.0).div(zoom.current);

    const hpScaleReArray = decimalToFloatNArray(hpScaleVal, PRECISION_LEVEL_N);
    // Assuming scale is uniform for Re and Im. If separate, make another u_hp_scale_im uniform
    const hpOffsetReArray = decimalToFloatNArray(offset.current.re, PRECISION_LEVEL_N);
    const hpOffsetImArray = decimalToFloatNArray(offset.current.im, PRECISION_LEVEL_N);

    gl.uniform1fv(uniformLocationsRef.current.hpScaleRe, hpScaleReArray);
    gl.uniform1fv(uniformLocationsRef.current.hpOffsetRe, hpOffsetReArray);
    gl.uniform1fv(uniformLocationsRef.current.hpOffsetIm, hpOffsetImArray);
    gl.uniform1f(uniformLocationsRef.current.aspectRatio, aspectRatioValue);
    gl.uniform1i(uniformLocationsRef.current.maxIterations, maxIterations.current);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error("WebGL not supported - this is expected in JSDOM/test environments.");
      return;
    }
    glRef.current = gl;

    const loadShader = (glCtx, type, source) => {
      const shader = glCtx.createShader(type);
      glCtx.shaderSource(shader, source);
      glCtx.compileShader(shader);
      if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
        const log = glCtx.getShaderInfoLog(shader);
        console.error('Error compiling shader:', log);
        alert('Shader compilation error: ' + log);
        glCtx.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const initShaderProgram = (glCtx, vertSource, fragSource) => {
      const vertexShader = loadShader(glCtx, glCtx.VERTEX_SHADER, vertSource);
      const fragmentShader = loadShader(glCtx, glCtx.FRAGMENT_SHADER, fragSource);
      if (!vertexShader || !fragmentShader) return null;

      const shaderProgram = glCtx.createProgram();
      glCtx.attachShader(shaderProgram, vertexShader);
      glCtx.attachShader(shaderProgram, fragmentShader);
      glCtx.linkProgram(shaderProgram);
      if (!glCtx.getProgramParameter(shaderProgram, glCtx.LINK_STATUS)) {
        const log = glCtx.getProgramInfoLog(shaderProgram);
        console.error('Error linking program:', log);
        alert('Shader program linking error: ' + log);
        return null;
      }
      programRef.current = shaderProgram;
      return shaderProgram;
    };

    const shaderProgram = initShaderProgram(gl, vsSource, finalFsSource);
    if (!shaderProgram) return;

    attribLocationsRef.current = {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'a_position'),
    };
    uniformLocationsRef.current = {
      hpScaleRe: gl.getUniformLocation(shaderProgram, 'u_hp_scale_re'),
      hpOffsetRe: gl.getUniformLocation(shaderProgram, 'u_hp_offset_re'),
      hpOffsetIm: gl.getUniformLocation(shaderProgram, 'u_hp_offset_im'),
      aspectRatio: gl.getUniformLocation(shaderProgram, 'u_aspectRatio'),
      maxIterations: gl.getUniformLocation(shaderProgram, 'u_maxIterations'),
    };

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1, 1, -1, -1, 1, 1, 1, -1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    bufferRef.current = positionBuffer;

    drawScene(); // Initial draw

    const handleWheel = (event) => {
      event.preventDefault();
      const canvasElem = canvasRef.current;
      if (!canvasElem) return;

      const canvasRect = canvasElem.getBoundingClientRect();
      // Use Decimal for mouse position calculations
      const mouseX = new Decimal(event.clientX - canvasRect.left);
      const mouseY = new Decimal(event.clientY - canvasRect.top);

      const ndcX = mouseX.div(canvasRect.width).times(2).minus(1);
      const ndcY = new Decimal(1).minus(mouseY.div(canvasRect.height).times(2)); // Y is flipped for typical screen to NDC

      const aspectRatioDec = new Decimal(canvasRect.width).div(canvasRect.height);
      const currentScaleVal = new Decimal(1.0).div(zoom.current);

      // Complex coordinates under mouse before zoom
      const complexMouseReBefore = ndcX.times(aspectRatioDec).times(currentScaleVal).plus(offset.current.re);
      const complexMouseImBefore = ndcY.times(currentScaleVal).plus(offset.current.im);

      const zoomFactor = new Decimal(Math.pow(0.9, event.deltaY * 0.01)); // Adjust sensitivity
      zoom.current = zoom.current.times(zoomFactor);

      // Update max iterations (example logic)
      try {
          // Decimal.log() is natural log. For log10, use .log(10) or .dividedBy(Decimal.ln(10)).
          // Simple heuristic: more iterations for higher zoom.
          const logZoom = Decimal.abs(zoom.current.log()); // Use abs in case zoom becomes < 1
          maxIterations.current = Math.max(50, Math.min(2000, Math.floor(50 + logZoom.toNumber() * 15)));
      } catch (e) { /* handle potential errors if zoom is 0 or negative */ }


      // New offset to keep mouse point fixed
      const newScaleVal = new Decimal(1.0).div(zoom.current);
      offset.current.re = complexMouseReBefore.minus(ndcX.times(aspectRatioDec).times(newScaleVal));
      offset.current.im = complexMouseImBefore.minus(ndcY.times(newScaleVal));

      requestAnimationFrame(drawScene);
    };

    const handleMouseDown = (event) => {
      isDragging.current = true;
      lastMousePosition.current = { x: event.clientX, y: event.clientY };
      canvasRef.current.style.cursor = 'grabbing';
    };

    const handleMouseMove = (event) => {
      if (!isDragging.current) return;
      const canvasElem = canvasRef.current;
      if (!canvasElem) return;

      const dx = new Decimal(event.clientX - lastMousePosition.current.x);
      const dy = new Decimal(event.clientY - lastMousePosition.current.y);

      const canvasRect = canvasElem.getBoundingClientRect(); // Get current dimensions
      const currentScaleVal = new Decimal(1.0).div(zoom.current);
      const aspectRatioDec = new Decimal(canvasRect.width).div(canvasRect.height);

      // Pan factor calculation (how much one pixel drag moves in complex plane)
      const panFactorRe = currentScaleVal.times(aspectRatioDec).times(2).div(new Decimal(canvasRect.width));
      const panFactorIm = currentScaleVal.times(2).div(new Decimal(canvasRect.height));

      offset.current.re = offset.current.re.minus(dx.times(panFactorRe));
      offset.current.im = offset.current.im.plus(dy.times(panFactorIm)); // Plus because screen Y is often inverted from math Y

      lastMousePosition.current = { x: event.clientX, y: event.clientY };
      requestAnimationFrame(drawScene);
    };

    const handleMouseUpOrLeave = () => {
      isDragging.current = false;
      canvasRef.current.style.cursor = 'grab';
    };

    const handleResize = () => {
        requestAnimationFrame(drawScene);
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUpOrLeave);
    canvas.addEventListener('mouseleave', handleMouseUpOrLeave);
    window.addEventListener('resize', handleResize);
    canvas.style.cursor = 'grab';


    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUpOrLeave);
      canvas.removeEventListener('mouseleave', handleMouseUpOrLeave);
      window.removeEventListener('resize', handleResize);
    };
  }, [drawScene]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
};

export default Fractal;
