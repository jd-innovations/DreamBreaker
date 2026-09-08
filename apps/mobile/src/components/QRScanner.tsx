// Type-resolution fallback only. Metro always prefers the platform-specific
// file at bundle time (.native.tsx on iOS/Android, .web.tsx on web) — this
// plain .tsx exists purely so TypeScript's module resolver can find the import.
export { QRScanner } from './QRScanner.native';
export type { QRScannerHandle, QRScannerProps } from './QRScanner.types';
