/**
 * Generates the fictional sample invoices in public/samples.
 *
 *   npm run samples
 *
 * Needs a local Chrome/Chromium for printing to PDF (set CHROME_PATH if it is not "google-chrome").
 * The generated files are committed, so the app does not need Chrome at runtime.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { buildSampleInvoices, type PhotoOptions } from "./samples/definitions";
import { renderSampleHtml } from "./samples/render-html";

const CHROME = process.env.CHROME_PATH ?? "google-chrome";
const OUTPUT_DIR = path.resolve(__dirname, "..", "public", "samples");

function runChrome(args: string[]): void {
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", ...args], {
    stdio: "ignore",
  });
}

async function makePhoto(screenshotPath: string, outputPath: string, options: PhotoOptions): Promise<void> {
  const background = { r: 92, g: 84, b: 74 };
  if (options.kind === "phone") {
    // A careful phone photo: slight tilt, warm light, softness, JPEG compression.
    // Stronger tilts (~1 degree) made gemini-3.5-flash-lite mix up rows in testing.
    await sharp(screenshotPath)
      .rotate(options.tiltDegrees, { background })
      .modulate({ brightness: 0.95, saturation: 0.9 })
      .tint({ r: 255, g: 244, b: 225 })
      .blur(0.6)
      .resize({ width: 1400 })
      .jpeg({ quality: 68 })
      .toFile(outputPath);
    return;
  }
  // An office scan: page cropped to its content, greyscale, a little contrast and softness.
  await sharp(await sharp(screenshotPath).trim({ threshold: 10 }).toBuffer())
    .extend({ top: 30, bottom: 30, left: 30, right: 30, background: "#ffffff" })
    .rotate(options.tiltDegrees, { background: "#f4f4f4" })
    .grayscale()
    .linear(1.15, -12)
    .blur(0.5)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const workDir = mkdtempSync(path.join(tmpdir(), "bcom-samples-"));

  for (const invoice of buildSampleInvoices()) {
    const htmlPath = path.join(workDir, `${invoice.fileStem}.html`);
    writeFileSync(htmlPath, renderSampleHtml(invoice), "utf8");
    const fileUrl = `file://${htmlPath}`;

    if (invoice.pdf) {
      const pdfPath = path.join(OUTPUT_DIR, `${invoice.fileStem}.pdf`);
      runChrome(["--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, fileUrl]);
      console.log(`PDF   ${path.relative(process.cwd(), pdfPath)}  (${invoice.rows.length} shipments)`);
    }

    if (invoice.photo) {
      const screenshotPath = path.join(workDir, `${invoice.fileStem}.png`);
      runChrome([`--screenshot=${screenshotPath}`, `--window-size=1240,${invoice.photo.windowHeight}`, fileUrl]);
      const extension = invoice.photo.kind === "phone" ? "jpg" : "png";
      const photoPath = path.join(OUTPUT_DIR, `${invoice.fileStem}${invoice.photo.fileSuffix}.${extension}`);
      await makePhoto(screenshotPath, photoPath, invoice.photo);
      console.log(`IMAGE ${path.relative(process.cwd(), photoPath)}  (${invoice.rows.length} shipments)`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
