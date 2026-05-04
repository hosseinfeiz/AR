const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0,O,1,I,L

export function generateRefId(length = 8): string {
  const arr = new Uint32Array(length)
  crypto.getRandomValues(arr)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[arr[i]! % ALPHABET.length]
  }
  return out
}
