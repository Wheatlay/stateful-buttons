// Generates images/icon.png (128x128) using only zlib + fs.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const W = 128, H = 128;
const BG = [0x1F, 0x23, 0x28];
const GREEN = [0x2E, 0xA0, 0x43];
const WHITE = [0xFF, 0xFF, 0xFF];

// pill: 88x44 centered
const px0 = 20, py0 = 42, pw = 88, ph = 44;
const r = ph / 2;
const cy = py0 + r;
// knob on the right
const kx = px0 + pw - r, ky = cy, kr = r - 5;

function inPill(x, y) {
	const cx = x + 0.5, cyy = y + 0.5;
	if (cyy < py0 || cyy > py0 + ph || cx < px0 || cx > px0 + pw) return false;
	if (cx < px0 + r) return Math.hypot(cx - (px0 + r), cyy - cy) <= r;
	if (cx > px0 + pw - r) return Math.hypot(cx - (px0 + pw - r), cyy - cy) <= r;
	return true;
}

const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
	const row = y * (W * 3 + 1);
	raw[row] = 0;
	for (let x = 0; x < W; x++) {
		let c = BG;
		if (inPill(x, y)) c = GREEN;
		if (Math.hypot(x + 0.5 - kx, y + 0.5 - ky) <= kr) c = WHITE;
		const o = row + 1 + x * 3;
		raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
	}
}

const crcTable = [];
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
	crcTable[n] = c >>> 0;
}
function crc32(buf) {
	let c = 0xFFFFFFFF;
	for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
	return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // RGB
const png = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
	chunk('IHDR', ihdr),
	chunk('IDAT', zlib.deflateSync(raw)),
	chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'images', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
