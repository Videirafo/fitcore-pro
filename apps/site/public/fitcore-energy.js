(() => {
  const hero = document.querySelector('.fcx-hero');
  if (!hero || hero.querySelector('.fitcore-energy-canvas')) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'fitcore-energy-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  hero.prepend(canvas);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    canvas.remove();
    return;
  }

  const vertexSource = `
    attribute vec2 aPosition;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;
    uniform vec2 uResolution;
    uniform vec2 uPointer;
    uniform float uTime;
    uniform float uBurst;

    float hash(vec2 p) {
      p = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 34.5);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amp = 0.52;
      mat2 twist = mat2(0.78, -0.63, 0.63, 0.78);
      for (int i = 0; i < 5; i++) {
        value += amp * noise(p);
        p = twist * p * 2.05 + 19.3;
        amp *= 0.49;
      }
      return value;
    }

    mat2 rot(float a) {
      float s = sin(a), c = cos(a);
      return mat2(c, -s, s, c);
    }

    void main() {
      vec2 frag = gl_FragCoord.xy;
      vec2 uv = (frag - 0.5 * uResolution.xy) / max(uResolution.y, 1.0);
      uv.y *= -1.0;

      vec2 pointer = (uPointer - 0.5 * uResolution.xy) / max(uResolution.y, 1.0);
      pointer.y *= -1.0;
      float pointerDistance = length(uv - pointer);
      float pointerForce = exp(-pointerDistance * pointerDistance * 8.0);

      float radius = length(uv);
      float angle = atan(uv.y, uv.x);
      vec2 p = rot(0.42 * sin(uTime * 0.19) + radius * 0.58) * uv;
      p += 0.14 * vec2(
        sin(angle * 2.8 + uTime * 0.44),
        cos(angle * 2.1 - uTime * 0.37)
      );
      p += pointerForce * vec2(
        0.18 * sin(uTime * 1.4 + pointerDistance * 18.0),
        0.18 * cos(uTime * 1.1 - pointerDistance * 15.0)
      );

      float n1 = fbm(p * 2.35 + vec2(uTime * 0.09, -uTime * 0.055));
      float n2 = fbm((p + n1 * 0.42) * 3.35 - vec2(uTime * 0.062, uTime * 0.072));
      float n3 = fbm((p - n2 * 0.25) * 5.2 + vec2(-uTime * 0.04, uTime * 0.05));

      float ribbonA = smoothstep(0.52, 0.80, n1 * 0.52 + n2 * 0.72);
      float ribbonB = smoothstep(0.64, 0.87, n2 * 0.64 + n3 * 0.54);
      float delta = abs(n1 - n2);
      float filament = smoothstep(0.08, 0.28, delta) * (1.0 - smoothstep(0.35, 0.86, delta));
      float pulseRadius = 0.11 + uTime * 0.16;
      float burst = uBurst * exp(-pow((radius - pulseRadius) * 6.4, 2.0));
      float ink = clamp(ribbonA * 0.78 + ribbonB * 0.56 + filament * 0.18 + pointerForce * 0.40 + burst * 0.56, 0.0, 1.0);

      vec3 acid = vec3(0.24, 0.95, 0.43);
      vec3 lime = vec3(0.58, 1.00, 0.34);
      vec3 violet = vec3(0.56, 0.27, 1.00);
      vec3 magenta = vec3(0.93, 0.18, 0.78);
      vec3 cyan = vec3(0.18, 0.78, 1.00);

      vec3 color = mix(acid, violet, smoothstep(0.30, 0.84, n2));
      color = mix(color, lime, smoothstep(0.76, 0.96, n1 + pointerForce * 0.25) * 0.48);
      color = mix(color, magenta, smoothstep(0.72, 0.96, n3) * 0.32);
      color = mix(color, cyan, smoothstep(0.80, 1.0, n1 + n2 * 0.30) * 0.20);

      float edge = smoothstep(0.03, 0.72, radius);
      float alpha = ink * mix(0.60, 0.92, edge);
      gl_FragColor = vec4(color, alpha * 0.72);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || 'Shader compilation failed');
    }
    return shader;
  }

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) {
    console.warn('[FitCore] energy field disabled:', error);
    canvas.remove();
    return;
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const position = gl.getAttribLocation(program, 'aPosition');
  const resolution = gl.getUniformLocation(program, 'uResolution');
  const pointer = gl.getUniformLocation(program, 'uPointer');
  const time = gl.getUniformLocation(program, 'uTime');
  const burst = gl.getUniformLocation(program, 'uBurst');

  gl.useProgram(program);
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  const state = {
    width: 0,
    height: 0,
    pointerX: 0,
    pointerY: 0,
    targetX: 0,
    targetY: 0,
    hasPointer: false,
    visible: true,
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.1 : 1.45);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (width === state.width && height === state.height) return;
    state.width = width;
    state.height = height;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    state.pointerX = state.pointerX || width * 0.68;
    state.pointerY = state.pointerY || height * 0.46;
    state.targetX = state.targetX || state.pointerX;
    state.targetY = state.targetY || state.pointerY;
  }

  function mapPointer(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    state.targetX = ((clientX - rect.left) / Math.max(rect.width, 1)) * state.width;
    state.targetY = ((clientY - rect.top) / Math.max(rect.height, 1)) * state.height;
    state.hasPointer = true;
  }

  window.addEventListener('pointermove', (event) => mapPointer(event.clientX, event.clientY), { passive: true });
  window.addEventListener('touchmove', (event) => {
    const touch = event.touches && event.touches[0];
    if (touch) mapPointer(touch.clientX, touch.clientY);
  }, { passive: true });

  const observer = new IntersectionObserver(([entry]) => {
    state.visible = Boolean(entry && entry.isIntersecting);
  }, { threshold: 0.02 });
  observer.observe(hero);

  const start = performance.now();

  function draw(now) {
    resize();
    if (state.visible) {
      const elapsed = Math.max(0, (now - start) / 1000);
      const breathing = 0.76 + Math.sin(elapsed * 0.31) * 0.13;
      const orbitX = state.width * (0.50 + Math.cos(elapsed * 0.92) * 0.26 * breathing);
      const orbitY = state.height * (0.48 + Math.sin(elapsed * 0.74) * 0.24 * breathing);
      if (!state.hasPointer) {
        state.targetX = orbitX;
        state.targetY = orbitY;
      }
      state.pointerX += (state.targetX - state.pointerX) * 0.07;
      state.pointerY += (state.targetY - state.pointerY) * 0.07;

      gl.uniform2f(resolution, state.width, state.height);
      gl.uniform2f(pointer, state.pointerX, state.pointerY);
      gl.uniform1f(time, reduceMotion ? 0.75 : elapsed);
      gl.uniform1f(burst, Math.max(0, 1 - elapsed / 1.8));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (!reduceMotion) requestAnimationFrame(draw);
  }

  resize();
  requestAnimationFrame(draw);

  function splitWords(element, className, stagger) {
    if (!element || element.dataset.energySplit === 'true') return;
    element.dataset.energySplit = 'true';
    let index = 0;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (!node.nodeValue || !node.nodeValue.trim()) return;
      const fragment = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          fragment.appendChild(document.createTextNode(part));
          return;
        }
        const span = document.createElement('span');
        span.className = className;
        span.style.setProperty('--fitcore-word-delay', `${index * stagger}ms`);
        span.textContent = part;
        fragment.appendChild(span);
        index += 1;
      });
      node.parentNode.replaceChild(fragment, node);
    });
  }

  splitWords(document.querySelector('.fcx-hero h1'), 'fitcore-energy-word fitcore-energy-word-title', 48);
  splitWords(document.querySelector('.fcx-hero-copy > p'), 'fitcore-energy-word fitcore-energy-word-copy', 16);
  document.documentElement.classList.add('fitcore-energy-ready');
})();
