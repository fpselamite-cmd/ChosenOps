/**
 * Vehicle pictures live in the repo at hq/public/vehicles/<name>.png, named after the car
 * in lower case with dashes ("Sultan RS" → sultan-rs.png). Anything without a picture
 * gets a gold outline for its class.
 */
export const VEHICLE_CLASSES = [
  { id: 'sedan', label: 'Sedan' },
  { id: 'sports', label: 'Sports' },
  { id: 'super', label: 'Super' },
  { id: 'muscle', label: 'Muscle' },
  { id: 'suv', label: 'SUV' },
  { id: 'offroad', label: 'Off-road' },
  { id: 'van', label: 'Van' },
  { id: 'bike', label: 'Bike' },
] as const;

export const vehicleSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
export const vehicleSrc = (name: string) => `/vehicles/${vehicleSlug(name)}.png`;

/** Suggestions while typing; any name works. */
export const COMMON_VEHICLES: [string, string][] = [
  ['Sultan RS', 'sports'],
  ['Sultan', 'sedan'],
  ['Kuruma', 'sports'],
  ['Kuruma (Armored)', 'sports'],
  ['Elegy RH8', 'sports'],
  ['Jester', 'sports'],
  ['Comet', 'sports'],
  ['Banshee', 'sports'],
  ['Zentorno', 'super'],
  ['Adder', 'super'],
  ['T20', 'super'],
  ['Dominator', 'muscle'],
  ['Gauntlet', 'muscle'],
  ['Buffalo', 'muscle'],
  ['Baller', 'suv'],
  ['Granger', 'suv'],
  ['Cavalcade', 'suv'],
  ['Windsor', 'sedan'],
  ['Schafter', 'sedan'],
  ['Tailgater', 'sedan'],
  ['Kamacho', 'offroad'],
  ['Sandking', 'offroad'],
  ['Speedo', 'van'],
  ['Burrito', 'van'],
  ['Bati 801', 'bike'],
  ['Akuma', 'bike'],
  ['Sanchez', 'bike'],
];
