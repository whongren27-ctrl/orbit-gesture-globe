import { readFile, writeFile } from 'node:fs/promises';
import { feature } from 'topojson-client';
import { geoContains } from 'd3-geo';

const topology = JSON.parse(await readFile(new URL('../public/data/land-110m.json', import.meta.url), 'utf8'));
const land = feature(topology, topology.objects.land);
const values = [];
const radius = 2.008;
const sampleCount = 72_000;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
for (let i = 0; i < sampleCount; i++) {
  const y = 1 - 2 * (i + 0.5) / sampleCount;
  const lat = Math.asin(y) * 180 / Math.PI;
  const lng = ((i * goldenAngle * 180 / Math.PI + 180) % 360) - 180;
  if (!geoContains(land, [lng, lat])) continue;
  const phi = (90 - lat) * Math.PI / 180;
  const theta = lng * Math.PI / 180;
  values.push(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.cos(theta));
}
const points = new Float32Array(values);
await writeFile(new URL('../public/data/land-points.bin', import.meta.url), Buffer.from(points.buffer));
console.log(`Generated ${points.length / 3} land points (${Buffer.byteLength(Buffer.from(points.buffer))} bytes)`);
