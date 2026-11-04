// Renders the PWA PNG icons from public/icons/logo.svg: node scripts/make-icons.mjs
import { readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("public/icons/logo.svg", "utf8");
// Maskable: the OS crops to its own shape, so drop the rounded corners and keep the mark inside the safe zone.
const flat = svg.replaceAll('rx="112" ', "");
const maskable = flat.replace('<g id="mark">', '<g transform="translate(256 256) scale(0.86) translate(-256 -256)">');

const render = (input, size, out) => sharp(Buffer.from(input), { density: 288 }).resize(size, size).png().toFile(out);

await render(svg, 192, "public/icons/icon-192.png");
await render(svg, 512, "public/icons/icon-512.png");
await render(svg, 180, "public/icons/apple-touch-icon.png");
await render(maskable, 512, "public/icons/icon-maskable-512.png");
