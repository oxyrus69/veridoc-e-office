/** Minimal QR Code encoder (byte mode, error correction level M) — no external API. */

// Level M tables (index by version).
const ECC_PER_BLOCK_M = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28,
];
const ECC_BLOCKS_M = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38,
  40, 43, 45, 47, 49,
];

type Bit = number;

class BitBuffer {
  bits: Bit[] = [];
  append(value: number, length: number) {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
  }
}

const ALIGNMENT_POSITIONS: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78],
  [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];

function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK_M[version] * ECC_BLOCKS_M[version];
}

function encodeText(text: string, version: number): BitBuffer {
  const bytes = new TextEncoder().encode(text);
  const capacityBits = dataCodewords(version) * 8;
  const buffer = new BitBuffer();
  buffer.append(0b0100, 4); // byte mode
  if (version >= 10) buffer.append(bytes.length, 16);
  else buffer.append(bytes.length, 8);
  for (const byte of bytes) buffer.append(byte, 8);
  buffer.append(0, Math.min(4, capacityBits - buffer.bits.length));
  while (buffer.bits.length % 8 !== 0) buffer.bits.push(0);
  for (let pad = 0xec; buffer.bits.length < capacityBits; pad ^= 0xec ^ 0x11) buffer.append(pad, 8);
  return buffer;
}

function multiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function reedSolomonDivisor(degree: number): number[] {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = multiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = multiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= multiply(coef, factor);
    });
  }
  return result;
}

function addEccAndInterleave(data: number[], version: number): number[] {
  const numBlocks = ECC_BLOCKS_M[version];
  const blockEccLength = ECC_PER_BLOCK_M[version];
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLength = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const divisor = reedSolomonDivisor(blockEccLength);
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const dataLength = shortBlockLength - blockEccLength + (i < numShortBlocks ? 0 : 1);
    const block = data.slice(k, k + dataLength);
    k += dataLength;
    blocks.push(block);
  }

  const eccBlocks = blocks.map((block) => reedSolomonRemainder(block, divisor));

  const result: number[] = [];
  const maxDataLength = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxDataLength; i += 1) {
    for (const block of blocks) {
      if (i < block.length) result.push(block[i]);
    }
  }
  for (let i = 0; i < blockEccLength; i += 1) {
    for (const block of eccBlocks) result.push(block[i]);
  }
  return result;
}

class Matrix {
  size: number;
  modules: (boolean | null)[][];
  isFunction: boolean[][];

  constructor(version: number) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean | null>(this.size).fill(null));
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }

  setFunctionModule(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }
}

function drawFormatBits(matrix: Matrix, mask: number) {
  const data = (0b00 << 3) | mask; // ECC level M = 00
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  const bit = (i: number) => ((bits >>> i) & 1) !== 0;

  for (let i = 0; i <= 5; i += 1) matrix.setFunctionModule(8, i, bit(i));
  matrix.setFunctionModule(8, 7, bit(6));
  matrix.setFunctionModule(8, 8, bit(7));
  matrix.setFunctionModule(7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) matrix.setFunctionModule(14 - i, 8, bit(i));

  const size = matrix.size;
  for (let i = 0; i < 8; i += 1) matrix.setFunctionModule(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i += 1) matrix.setFunctionModule(8, size - 15 + i, bit(i));
  matrix.setFunctionModule(8, size - 8, true);
}

function drawFinder(matrix: Matrix, cx: number, cy: number) {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= matrix.size || y >= matrix.size) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      matrix.setFunctionModule(x, y, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignment(matrix: Matrix, version: number) {
  const positions = ALIGNMENT_POSITIONS[version];
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = 0; j < positions.length; j += 1) {
      const x = positions[i];
      const y = positions[j];
      if (matrix.isFunction[y][x]) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          matrix.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }
}

function drawVersionBits(matrix: Matrix, version: number) {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i += 1) {
    const bit = ((bits >>> i) & 1) !== 0;
    const a = matrix.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    matrix.setFunctionModule(a, b, bit);
    matrix.setFunctionModule(b, a, bit);
  }
}

function drawFunctionPatterns(matrix: Matrix, version: number) {
  const size = matrix.size;
  for (let i = 0; i < size; i += 1) {
    matrix.setFunctionModule(6, i, i % 2 === 0);
    matrix.setFunctionModule(i, 6, i % 2 === 0);
  }
  drawFinder(matrix, 3, 3);
  drawFinder(matrix, size - 4, 3);
  drawFinder(matrix, 3, size - 4);
  drawAlignment(matrix, version);
  drawFormatBits(matrix, 0);
  drawVersionBits(matrix, version);
}

function drawCodewords(matrix: Matrix, codewords: number[]) {
  let i = 0;
  const size = matrix.size;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (matrix.isFunction[y][x]) continue;
        const bit = i < codewords.length * 8 ? ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0 : false;
        matrix.modules[y][x] = bit;
        i += 1;
      }
    }
  }
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(matrix: Matrix, mask: number) {
  const fn = MASKS[mask];
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (matrix.isFunction[y][x]) continue;
      if (fn(x, y)) matrix.modules[y][x] = !matrix.modules[y][x];
    }
  }
}

function cloneMatrix(matrix: Matrix): Matrix {
  const copy = Object.create(Matrix.prototype) as Matrix;
  copy.size = matrix.size;
  copy.modules = matrix.modules.map((row) => row.slice());
  copy.isFunction = matrix.isFunction.map((row) => row.slice());
  return copy;
}

function penaltyScore(matrix: Matrix): number {
  const size = matrix.size;
  let score = 0;
  const at = (x: number, y: number) => matrix.modules[y][x] === true;

  for (let y = 0; y < size; y += 1) {
    let run = 1;
    for (let x = 1; x < size; x += 1) {
      if (at(x, y) === at(x - 1, y)) {
        run += 1;
        if (run === 5) score += 3;
        else if (run > 5) score += 1;
      } else run = 1;
    }
  }
  for (let x = 0; x < size; x += 1) {
    let run = 1;
    for (let y = 1; y < size; y += 1) {
      if (at(x, y) === at(x, y - 1)) {
        run += 1;
        if (run === 5) score += 3;
        else if (run > 5) score += 1;
      } else run = 1;
    }
  }
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = at(x, y);
      if (color === at(x + 1, y) && color === at(x, y + 1) && color === at(x + 1, y + 1)) score += 3;
    }
  }
  let dark = 0;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (at(x, y)) dark += 1;
  const total = size * size;
  const ratio = Math.abs((dark * 100) / total - 50);
  score += Math.floor(ratio / 5) * 10;
  return score;
}

export type QrMatrix = { size: number; modules: boolean[][] };

export function encodeQr(text: string): QrMatrix {
  let version = 1;
  for (; version <= 40; version += 1) {
    const needed = new TextEncoder().encode(text).length;
    const headerBits = 4 + (version >= 10 ? 16 : 8);
    if (headerBits + needed * 8 <= dataCodewords(version) * 8) break;
  }
  if (version > 40) throw new Error("QR payload too large");

  const buffer = encodeText(text, version);
  const dataBytes: number[] = [];
  for (let i = 0; i < buffer.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (buffer.bits[i + j] ?? 0);
    dataBytes.push(byte);
  }
  const codewords = addEccAndInterleave(dataBytes, version);

  const base = new Matrix(version);
  drawFunctionPatterns(base, version);
  drawCodewords(base, codewords);

  let best: Matrix | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = cloneMatrix(base);
    applyMask(candidate, mask);
    drawFormatBits(candidate, mask);
    const score = penaltyScore(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  const matrix = best as Matrix;
  return {
    size: matrix.size,
    modules: matrix.modules.map((row) => row.map((cell) => cell === true)),
  };
}

/** Server-rendered SVG path string, one path element for all dark modules. */
export function qrSvgPath(matrix: QrMatrix, moduleSize = 4, quietZone = 4): { path: string; size: number } {
  const size = (matrix.size + quietZone * 2) * moduleSize;
  let path = "";
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (!matrix.modules[y][x]) continue;
      const px = (x + quietZone) * moduleSize;
      const py = (y + quietZone) * moduleSize;
      path += `M${px} ${py}h${moduleSize}v${moduleSize}h-${moduleSize}z`;
    }
  }
  return { path, size };
}
