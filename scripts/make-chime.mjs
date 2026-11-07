import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Synthesize the bundled notification chime.
 *
 * The sound is an original two-tone bell (A5 then E6) with a short exponential
 * decay and a soft octave overtone. It is generated here instead of shipping a
 * downloaded asset, so the plugin has no third-party audio license.
 */
const SAMPLE_RATE = 44_100
const DURATION = 0.55
const SEGMENTS = [
  { start: 0, length: 0.22, frequency: 880, gain: 0.5 },
  { start: 0.14, length: 0.34, frequency: 1318.51, gain: 0.42 },
  { start: 0.14, length: 0.34, frequency: 659.25, gain: 0.16 },
]
const TAU = Math.PI * 2

const totalSamples = Math.ceil(SAMPLE_RATE * DURATION)
const samples = new Float32Array(totalSamples)
for (const segment of SEGMENTS) {
  const from = Math.floor(segment.start * SAMPLE_RATE)
  const length = Math.floor(segment.length * SAMPLE_RATE)
  for (let index = 0; index < length; index += 1) {
    const at = from + index
    if (at >= totalSamples) break
    const t = index / SAMPLE_RATE
    const attack = Math.min(1, index / (SAMPLE_RATE * 0.012))
    const decay = Math.exp(-5.2 * t)
    const wobble = 1 + 0.003 * Math.sin(TAU * 5.5 * t)
    samples[at] += segment.gain * attack * decay * Math.sin(TAU * segment.frequency * wobble * t)
  }
}

// Short fade-out to avoid a click at the end of the buffer.
const fade = Math.floor(SAMPLE_RATE * 0.02)
for (let index = 0; index < fade; index += 1) {
  const at = totalSamples - fade + index
  if (at >= 0) samples[at] *= 0.5 * (1 + Math.cos(Math.PI * (index / fade)))
}

let peak = 0
for (const value of samples) peak = Math.max(peak, Math.abs(value))
const scale = peak > 0 ? 0.82 / peak : 1

const pcm = Buffer.alloc(totalSamples * 2)
for (let index = 0; index < totalSamples; index += 1) {
  const value = Math.max(-1, Math.min(1, samples[index] * scale))
  pcm.writeInt16LE(Math.round(value * 32_767), index * 2)
}

const header = Buffer.alloc(44)
header.write('RIFF', 0, 'ascii')
header.writeUInt32LE(36 + pcm.length, 4)
header.write('WAVE', 8, 'ascii')
header.write('fmt ', 12, 'ascii')
header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20)
header.writeUInt16LE(1, 22)
header.writeUInt32LE(SAMPLE_RATE, 24)
header.writeUInt32LE(SAMPLE_RATE * 2, 28)
header.writeUInt16LE(2, 32)
header.writeUInt16LE(16, 34)
header.write('data', 36, 'ascii')
header.writeUInt32LE(pcm.length, 40)

const destination = path.resolve(fileURLToPath(new URL('../assets/notify.wav', import.meta.url)))
mkdirSync(path.dirname(destination), { recursive: true })
writeFileSync(destination, Buffer.concat([header, pcm]))
console.log(`wrote ${destination} (${String(header.length + pcm.length)} bytes)`)
