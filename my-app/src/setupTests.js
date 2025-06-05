// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock HTMLCanvasElement.prototype.getContext for WebGL globally
HTMLCanvasElement.prototype.getContext = jest.fn((contextType) => {
  if (contextType === 'webgl' || contextType === 'experimental-webgl') {
    // Define WebGLRenderingContext constants if they are used by the mock
    const WebGLRenderingContext = {
      COMPILE_STATUS: 0x8B82,
      LINK_STATUS: 0x8B86,
      // Add other constants if your mock or code uses them
    };
    return {
      getParameter: jest.fn(),
      createShader: jest.fn(() => ({ id: 'dummyShader' })),
      shaderSource: jest.fn(),
      compileShader: jest.fn(),
      getShaderParameter: jest.fn((shader, param) => {
        if (param === WebGLRenderingContext.COMPILE_STATUS) return true;
        return undefined;
      }),
      getShaderInfoLog: jest.fn(() => ''),
      createProgram: jest.fn(() => ({ id: 'dummyProgram' })),
      attachShader: jest.fn(),
      linkProgram: jest.fn(),
      getProgramParameter: jest.fn((program, param) => {
        if (param === WebGLRenderingContext.LINK_STATUS) return true;
        return undefined;
      }),
      getProgramInfoLog: jest.fn(() => ''),
      useProgram: jest.fn(),
      getAttribLocation: jest.fn(() => 0),
      getUniformLocation: jest.fn(() => ({ id: 'dummyUniformLocation' })),
      enableVertexAttribArray: jest.fn(),
      createBuffer: jest.fn(() => ({ id: 'dummyBuffer' })),
      bindBuffer: jest.fn(),
      bufferData: jest.fn(),
      vertexAttribPointer: jest.fn(),
      viewport: jest.fn(),
      clearColor: jest.fn(),
      clear: jest.fn(),
      uniform1f: jest.fn(),
      uniform1i: jest.fn(),
      uniform2f: jest.fn(),
      drawArrays: jest.fn(),
    };
  }
  return null; // For other contexts
});

// You might also want to mock other canvas properties if they are accessed during tests
// For example, clientWidth and clientHeight are often used for canvas sizing.
// Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, value: 600 });
// Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, value: 400 });
