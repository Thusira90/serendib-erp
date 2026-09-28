import "server-only";
import QRCode from "qrcode";

/**
 * Render a QR code as an SVG string.
 * We generate SVG (not PNG) because it embeds inline in HTML with no image
 * loader, scales cleanly for print sheets, and is theme-agnostic.
 */
export async function renderQrSvg(
  data: string,
  {
    size = 240,
    dark = "#0F1414",
    light = "#FFFFFF",
    margin = 2,
  }: { size?: number; dark?: string; light?: string; margin?: number } = {}
): Promise<string> {
  const svg = await QRCode.toString(data, {
    type: "svg",
    width: size,
    margin,
    errorCorrectionLevel: "M",
    color: { dark, light },
  });
  // Strip fixed width/height and add preserveAspectRatio so the QR fits
  // whatever CSS container it lands in (e.g. a 32×32 mm sticker slot).
  // The viewBox emitted by qrcode is preserved, which keeps the modules
  // crisp at any scale.
  return svg
    .replace(/\swidth="[^"]*"/, "")
    .replace(/\sheight="[^"]*"/, "")
    .replace(/<svg\s/, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" ');
}

export function publicVerifyUrl(code: string, base?: string | null) {
  const origin = base?.replace(/\/$/, "") ?? "";
  return `${origin}/verify/${encodeURIComponent(code)}`;
}
