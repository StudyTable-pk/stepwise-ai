// pdf-parse ships no TypeScript types. Import the low-level entry point
// ("pdf-parse/lib/pdf-parse.js") to skip its module.parent debug branch.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info?: Record<string, unknown>;
  }
  function pdfParse(data: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PdfParseResult>;
  export = pdfParse;
}
