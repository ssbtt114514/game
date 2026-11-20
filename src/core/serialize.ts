/** 二进制数组与 Base64 的互转工具，用于存档压缩。 */

const CHUNK = 0x8000

export function encodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK, bytes.length))
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export function decodeBytes(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function encodeU16(values: Uint16Array): string {
  return encodeBytes(new Uint8Array(values.buffer, values.byteOffset, values.byteLength))
}

export function decodeU16(encoded: string): Uint16Array {
  const bytes = decodeBytes(encoded)
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return new Uint16Array(copy.buffer)
}

export function encodeU32(values: Uint32Array): string {
  return encodeBytes(new Uint8Array(values.buffer, values.byteOffset, values.byteLength))
}

export function decodeU32(encoded: string): Uint32Array {
  const bytes = decodeBytes(encoded)
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return new Uint32Array(copy.buffer)
}

export function encodeI8(values: Int8Array): string {
  return encodeBytes(new Uint8Array(values.buffer, values.byteOffset, values.byteLength))
}

export function decodeI8(encoded: string): Int8Array {
  const bytes = decodeBytes(encoded)
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return new Int8Array(copy.buffer)
}
