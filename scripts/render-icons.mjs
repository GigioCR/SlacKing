// Draws the SlacKing icon (a sloth wearing a crown) and renders every PNG the app uses.
// Needs sharp, which the app doesn't depend on:  npm i --no-save sharp && node scripts/render-icons.mjs
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const out = fileURLToPath(new URL('../public/icons', import.meta.url))
mkdirSync(out, { recursive: true })

// Ink line: black outlines on white, nothing filled but the nose.
const INK = '#121212'
const PAPER = '#FFFFFF'

// 512×512 art, centred so it fits the maskable safe zone (a circle of radius 205 around 256,256).
const sloth = `
  <g fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
    <!-- head and face -->
    <circle cx="256" cy="300" r="146"/>
    <ellipse cx="256" cy="322" rx="112" ry="92" stroke-width="7"/>
    <!-- eye stripes, sloping down and out -->
    <path d="M160 330 Q186 280 238 300 M352 330 Q326 280 274 300"/>
    <!-- sleepy closed eyes and smile -->
    <path d="M196 314 Q212 326 228 314 M284 314 Q300 326 316 314" stroke-width="8"/>
    <path d="M228 374 Q256 398 284 374" stroke-width="8"/>
    <!-- crown, tipped a little; filled with paper so the head line doesn't show through -->
    <g transform="rotate(-9 256 160)">
      <path d="M178 204 L178 124 L218 162 L256 96 L294 162 L334 124 L334 204 Z" fill="${PAPER}"/>
      <path d="M178 182 L334 182"/>
    </g>
  </g>
  <ellipse cx="256" cy="346" rx="20" ry="13" fill="${INK}"/>`

// A thin grey edge, so the white icon doesn't vanish on a light wallpaper.
const EDGE = '#CFCFCF'
const edge = `<rect x="5" y="5" width="502" height="502" rx="108" fill="none" stroke="${EDGE}" stroke-width="10"/>`

// "any" icon: rounded square with the edge drawn inside it.
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${PAPER}"/>${edge}${sloth}</svg>`
// Maskable: Android cuts its own shape (circle on most phones, squircle on some), so an edge drawn
// along the square would be cut away. Instead the tile is grey with a white disc inside: a circle
// mask leaves a thin grey rim, and other shapes show grey corners around the disc.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${EDGE}"/><circle cx="256" cy="256" r="244" fill="${PAPER}"/><g transform="translate(256 256) scale(0.86) translate(-256 -256)">${sloth}</g></svg>`
// iPhone rounds the corners itself and fills transparency with black, so this one is opaque.
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${PAPER}"/>${edge}${sloth}</svg>`

// Android's status-bar badge uses only the shape (alpha), drawn in white: the crown alone reads best.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <path d="M14 74 L14 30 L32 46 L48 18 L64 46 L82 30 L82 74 Z" fill="#fff"/>
  <circle cx="14" cy="27" r="6" fill="#fff"/><circle cx="48" cy="15" r="6" fill="#fff"/><circle cx="82" cy="27" r="6" fill="#fff"/>
</svg>`

// Next.js serves app/icon.png as the browser-tab icon and app/apple-icon.png for iPhones.
const app = fileURLToPath(new URL('../app', import.meta.url))
const png = (svg, size, file) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toFile(file)
await Promise.all([
  png(rounded, 192, `${out}/icon-192.png`),
  png(rounded, 512, `${out}/icon-512.png`),
  png(maskable, 512, `${out}/icon-maskable-512.png`),
  png(badge, 96, `${out}/badge-96.png`),
  png(rounded, 512, `${app}/icon.png`),
  png(apple, 180, `${app}/apple-icon.png`),
])
console.log('rendered to', out, 'and', app)
