/**
 * zipCentroids.ts
 *
 * Provides O(1) zip-code → { lat, lng } lookup using a bundled static dataset.
 * Source: https://github.com/midwire/free_zipcode_data (public domain)
 * 42,354 US zip codes, ~1.9 MB — loaded once and cached in module scope.
 */

import rawData from '../assets/data/zip-centroids.json';

interface ZipEntry {
  z: string;  // zip code
  la: number; // latitude
  lo: number; // longitude
}

// Build a Map on first import — subsequent calls are O(1)
const zipMap = new Map<string, { lat: number; lng: number }>(
  (rawData as ZipEntry[]).map((entry) => [
    entry.z,
    { lat: entry.la, lng: entry.lo },
  ])
);

/**
 * Returns the centroid coordinates for a US zip code, or null if not found.
 *
 * @example
 * const coords = getZipCoords('90210');
 * // { lat: 34.090, lng: -118.406 }
 */
export function getZipCoords(zip: string): { lat: number; lng: number } | null {
  // Normalise: strip leading/trailing whitespace, zero-pad to 5 digits
  const normalised = zip.trim().padStart(5, '0');
  return zipMap.get(normalised) ?? null;
}

/**
 * Converts an array of { zip_code, ...rest } objects into map-ready pin data
 * by looking up each zip's centroid. Entries with unknown zips are dropped.
 */
export function resolvePins<T extends { zip_code: string }>(
  items: T[]
): (T & { lat: number; lng: number })[] {
  const result: (T & { lat: number; lng: number })[] = [];
  for (const item of items) {
    const coords = getZipCoords(item.zip_code);
    if (coords) result.push({ ...item, ...coords });
  }
  return result;
}
