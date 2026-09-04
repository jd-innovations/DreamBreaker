export type QRScannerHandle = {
  /** Re-arms scanning after the caller has shown an error state and the user taps "Scan Again". */
  resume: () => void;
};

export type QRScannerProps = {
  /**
   * Fired at most once per lock cycle with the raw decoded QR text.
   * Business-domain validation (is this token valid/redeemable/authorized)
   * is deliberately NOT this component's job — callers classify and act on
   * the raw string (see `@/lib/qrPayload`).
   */
  onScanned: (raw: string) => void;
  onClose: () => void;
  /** Shown under the scan frame. Defaults to a generic scan instruction. */
  instruction?: string;
};
