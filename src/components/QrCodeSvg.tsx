import { encodeQr, qrSvgPath } from "@/lib/qr";

/**
 * Renders a QR code as an SVG path. Pure server-safe (no `react` state).
 * The payload usually points at `/verify/<CODE>` so a scan lands on the
 * public verification portal.
 */
export function QrCodeSvg({
  value,
  size = 148,
  moduleSize = 4,
  quietZone = 4,
  label,
  className,
}: {
  value: string;
  size?: number;
  moduleSize?: number;
  quietZone?: number;
  label?: string;
  className?: string;
}) {
  const matrix = encodeQr(value);
  const { path, size: computed } = qrSvgPath(matrix, moduleSize, quietZone);
  const dim = size ?? computed;
  return (
    <svg
      width={dim}
      height={dim}
      viewBox={`0 0 ${computed} ${computed}`}
      role="img"
      aria-label={label ?? `QR code ${value}`}
      className={className}
    >
      <rect width={computed} height={computed} fill="#ffffff" />
      <path d={path} fill="#0f172a" />
    </svg>
  );
}
