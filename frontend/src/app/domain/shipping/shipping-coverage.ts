import { ShippingOptionId } from './shipping.entity';

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export const SIMULATED_COVERAGE_KM = { STANDARD: 25, EXPRESS: 10 } as const;

export interface Coverage {
  readonly ok: boolean;
  readonly distanceKm: number | null;
  readonly reason: string;
}

export function isGeoPoint(point: { latitude: number | null; longitude: number | null } | null): point is GeoPoint {
  if (!point || point.latitude === null || point.longitude === null) {
    return false;
  }
  return (
    Number.isFinite(point.latitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    Number.isFinite(point.longitude) &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

export function distanceKm(from: GeoPoint, to: GeoPoint): number {
  const earth = 6371;
  const lat = radians(to.latitude - from.latitude);
  const lng = radians(to.longitude - from.longitude);
  const a =
    Math.sin(lat / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(lng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function coverageFor(
  option: ShippingOptionId,
  pin: { latitude: number | null; longitude: number | null },
  origin: { latitude: number | null; longitude: number | null },
): Coverage {
  if (!isGeoPoint(pin)) {
    return { ok: false, distanceKm: null, reason: 'Marcá el punto en el mapa para registrar la ubicación.' };
  }
  if (option === 'PICKUP') {
    return { ok: true, distanceKm: null, reason: 'Retiro: la ubicación queda registrada y no depende de la distancia.' };
  }
  if (!isGeoPoint(origin)) {
    return { ok: false, distanceKm: null, reason: 'Esta instalación no publicó un origen. No se valida la cobertura.' };
  }
  const kilometers = Math.round(distanceKm(pin, origin) * 10) / 10;
  const limit = option === 'EXPRESS' ? SIMULATED_COVERAGE_KM.EXPRESS : SIMULATED_COVERAGE_KM.STANDARD;
  if (kilometers <= limit) {
    return { ok: true, distanceKm: kilometers, reason: `A ${kilometers} km del origen. Dentro de la simulación (${limit} km).` };
  }
  return { ok: false, distanceKm: kilometers, reason: `A ${kilometers} km del origen. Esta simulación cubre hasta ${limit} km.` };
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}
