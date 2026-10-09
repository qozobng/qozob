// =========================================================================
// MINIMAL XLSX WRITER (no dependencies)
// Builds a real Excel workbook in the browser: stored (uncompressed) zip +
// SpreadsheetML parts. Every sheet carries a title, a "Generated: <date time> WAT"
// stamp, optional filter lines, a bold frozen header row with auto-filter, and
// typed cells (numbers / dates stay numeric so Excel can sum and sort them).
//
// Text is always written as an inline string, so a value such as "=HYPERLINK(...)"
// typed by a user is shown as text and never evaluated as a formula.
// =========================================================================

export type XlsxColumnType = 'text' | 'number' | 'integer' | 'money' | 'date' | 'datetime' | 'boolean';

export interface XlsxColumn {
  header: string;
  type?: XlsxColumnType;
  /** Character width; auto-sized from the data when omitted. */
  width?: number;
}

export type XlsxValue = string | number | boolean | Date | null | undefined;

export interface XlsxSheet {
  /** Tab name (trimmed to Excel's 31-char limit, illegal characters removed). */
  name: string;
  /** Big bold line at the top of the sheet. Defaults to the tab name. */
  title?: string;
  /** Extra lines under the "Generated" stamp, e.g. "Period: 1 Oct – 9 Oct 2026". */
  meta?: string[];
  columns: XlsxColumn[];
  rows: XlsxValue[][];
}

export interface XlsxOptions {
  /** Shown in the "Generated" line, e.g. the admin's email. */
  generatedBy?: string | null;
  /** Override the generation time (defaults to now). */
  generatedAt?: Date;
}

// ---------- helpers ----------

const enc = new TextEncoder();
const WAT_OFFSET_MS = 60 * 60 * 1000; // Nigeria is UTC+1 all year (no DST)

// eslint-disable-next-line no-control-regex
const BAD_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function esc(s: string): string {
  return s
    .replace(BAD_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colLetter(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Formats a date as "09 Oct 2026, 12:37" in Lagos time. */
export function formatWat(d: Date | string | number | null | undefined, withTime = true): string {
  if (d == null || d === '') return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return typeof d === 'string' ? d : '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date);
}

function toMs(v: XlsxValue): number | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Excel serial date in WAT. */
function excelSerial(ms: number): number {
  return (ms + WAT_OFFSET_MS) / 86400000 + 25569;
}

function sanitiseSheetName(name: string, used: Set<string>): string {
  let base = (name || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim() || 'Sheet';
  base = base.slice(0, 31);
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

// ---------- styles ----------
// cellXfs index map
const S = {
  normal: 0,
  header: 1,
  datetime: 2,
  date: 3,
  title: 4,
  meta: 5,
  integer: 6,
  decimal: 7,
} as const;

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2">' +
  '<numFmt numFmtId="164" formatCode="dd mmm yyyy hh:mm"/>' +
  '<numFmt numFmtId="165" formatCode="dd mmm yyyy"/>' +
  '</numFmts>' +
  '<fonts count="4">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF1E1B4B"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="14"/><color rgb="FF312E81"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE0E7FF"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FF818CF8"/></bottom><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="8">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

// ---------- cells ----------

function strCell(ref: string, text: string, style: number = S.normal): string {
  const t = text.length > 32000 ? text.slice(0, 32000) + '…' : text;
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${esc(t)}</t></is></c>`;
}

function numCell(ref: string, n: number, style: number = S.normal): string {
  return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${n}</v></c>`;
}

function valueCell(ref: string, v: XlsxValue, type: XlsxColumnType): string {
  if (v === null || v === undefined || v === '') return '';
  switch (type) {
    case 'number':
    case 'integer':
    case 'money': {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[,₦\s]/g, '')) : NaN;
      if (Number.isFinite(n)) {
        const style = type === 'integer' ? S.integer : type === 'money' ? S.decimal : S.normal;
        return numCell(ref, n, style);
      }
      return strCell(ref, String(v));
    }
    case 'date':
    case 'datetime': {
      const ms = toMs(v);
      if (ms !== null) return numCell(ref, excelSerial(ms), type === 'date' ? S.date : S.datetime);
      return strCell(ref, String(v));
    }
    case 'boolean':
      return strCell(ref, v === true || v === 'true' ? 'Yes' : v === false || v === 'false' ? 'No' : String(v));
    default:
      return strCell(ref, v instanceof Date ? formatWat(v) : String(v));
  }
}

function displayLength(v: XlsxValue, type: XlsxColumnType): number {
  if (v === null || v === undefined) return 0;
  if (type === 'datetime') return 17;
  if (type === 'date') return 11;
  return String(v).length;
}

// ---------- sheet ----------

function sheetXml(sheet: XlsxSheet, generatedLine: string): { xml: string; filterRef: string } {
  const cols = sheet.columns;
  const lastCol = colLetter(Math.max(cols.length - 1, 0));
  const top: string[] = [sheet.title || sheet.name, generatedLine, ...(sheet.meta || []).filter(Boolean)];
  const headerRow = top.length + 2; // blank spacer row before the header
  const rowsXml: string[] = [];

  top.forEach((line, i) => {
    const r = i + 1;
    rowsXml.push(`<row r="${r}">${strCell(`A${r}`, line, i === 0 ? S.title : S.meta)}</row>`);
  });

  rowsXml.push(
    `<row r="${headerRow}">${cols.map((c, i) => strCell(`${colLetter(i)}${headerRow}`, c.header, S.header)).join('')}</row>`,
  );

  sheet.rows.forEach((row, ri) => {
    const r = headerRow + 1 + ri;
    const cells = cols.map((c, ci) => valueCell(`${colLetter(ci)}${r}`, row[ci], c.type || 'text')).join('');
    rowsXml.push(`<row r="${r}">${cells}</row>`);
  });

  // Column widths: explicit, or auto from header + first 300 rows
  const sample = sheet.rows.slice(0, 300);
  const widths = cols.map((c, ci) => {
    if (c.width) return c.width;
    let w = c.header.length + 2;
    for (const row of sample) w = Math.max(w, displayLength(row[ci], c.type || 'text') + 2);
    return Math.min(Math.max(w, 8), 60);
  });

  const lastRow = headerRow + sheet.rows.length;
  const filterRef = `$A$${headerRow}:$${lastCol}$${lastRow}`;

  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<dimension ref="A1:${lastCol}${Math.max(lastRow, headerRow)}"/>` +
    '<sheetViews><sheetView workbookViewId="0">' +
    `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>` +
    `<selection pane="bottomLeft" activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/>` +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${rowsXml.join('')}</sheetData>` +
    (cols.length ? `<autoFilter ref="A${headerRow}:${lastCol}${lastRow}"/>` : '') +
    '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>';

  return { xml, filterRef };
}

// ---------- zip (stored) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStored(files: { name: string; data: Uint8Array }[], when = new Date()): Uint8Array {
  const dosTime = ((when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2)) & 0xffff;
  const dosDate = (((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()) & 0xffff;

  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);

    chunks.push(local, f.data);
    central.push(cen);
    offset += local.length + size;
  }

  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of [...chunks, ...central, end]) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

// ---------- public API ----------

export function buildXlsx(sheets: XlsxSheet[], opts: XlsxOptions = {}): Uint8Array {
  const list = sheets.length ? sheets : [{ name: 'Report', columns: [], rows: [] }];
  const now = opts.generatedAt || new Date();
  const generatedLine = `Generated: ${formatWat(now)} WAT${opts.generatedBy ? ` by ${opts.generatedBy}` : ''} · Qozob`;

  const used = new Set<string>();
  const names = list.map((s) => sanitiseSheetName(s.name, used));
  const built = list.map((s) => sheetXml(s, generatedLine));

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    names
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';

  const quoted = (n: string) => `'${n.replace(/'/g, "''")}'`;
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="16000" windowHeight="9000"/></bookViews>' +
    `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
    '<definedNames>' +
    built
      .map((b, i) =>
        list[i].columns.length
          ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(quoted(names[i]))}!${b.filterRef}</definedName>`
          : '',
      )
      .join('') +
    '</definedNames>' +
    '</workbook>';

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    names
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>';

  const iso = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${esc(list[0].title || list[0].name)}</dc:title>` +
    `<dc:creator>${esc(opts.generatedBy || 'Qozob')}</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>` +
    '</cp:coreProperties>';

  const app =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    '<Application>Qozob</Application></Properties>';

  const files = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'docProps/core.xml', data: enc.encode(core) },
    { name: 'docProps/app.xml', data: enc.encode(app) },
    { name: 'xl/workbook.xml', data: enc.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRels) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES_XML) },
    ...built.map((b, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(b.xml) })),
  ];

  return zipStored(files, now);
}

/** "qozob-stations" -> "qozob-stations-2026-10-09-1237.xlsx" (Lagos time). */
export function stampedFilename(base: string, when = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(when);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const slug = base.toLowerCase().replace(/\.xlsx$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
  return `${slug}-${get('year')}-${get('month')}-${get('day')}-${get('hour').replace('24', '00')}${get('minute')}.xlsx`;
}

/** Builds the workbook and triggers a browser download. */
export function downloadXlsx(baseName: string, sheets: XlsxSheet[], opts: XlsxOptions = {}): void {
  const now = opts.generatedAt || new Date();
  const bytes = buildXlsx(sheets, { ...opts, generatedAt: now });
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = stampedFilename(baseName, now);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

