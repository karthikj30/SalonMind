import "server-only";
import QRCode from "qrcode";

/** Inline SVG QR (generated server-side — no third-party QR API sees the payment link). */
export async function qrSvg(text: string, size = 180) {
  return QRCode.toString(text, { type: "svg", width: size, margin: 1, errorCorrectionLevel: "M" });
}
