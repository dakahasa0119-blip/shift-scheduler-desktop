import type { ExportCellTone, ExportWorkbook } from "./exportWorkbook";

export function renderWorkbookAsXlsx(workbook: ExportWorkbook): Uint8Array {
  const sheet = workbook.sheets[0];
  return buildZip([
    file("[Content_Types].xml", contentTypesXml()),
    file("_rels/.rels", rootRelsXml()),
    file("xl/workbook.xml", workbookXml(sheet.name)),
    file("xl/_rels/workbook.xml.rels", workbookRelsXml()),
    file("xl/styles.xml", stylesXml()),
    file("xl/worksheets/sheet1.xml", worksheetXml(workbook)),
  ]);
}

function worksheetXml(workbook: ExportWorkbook): string {
  const sheet = workbook.sheets[0];
  const rows = sheet.rows
    .map((row, rowIndex) => {
      const cells = row.cells
        .map((cell, columnIndex) => {
          const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
          const style = styleIndex(cell.tone || "plain");
          return `<c r="${ref}" t="inlineStr" s="${style}"><is><t>${escapeXml(cell.value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  const freezePane = `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${sheet.frozenColumns}" ySplit="${sheet.frozenRows}" topLeftCell="C4" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`;
  const pageSetup = `<pageSetup orientation="${sheet.print.orientation}" fitToWidth="${sheet.print.fitToWidth}" fitToHeight="0"/>`;
  const printOptions = `<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>`;

  return xml(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freezePane}<sheetData>${rows}</sheetData>${printOptions}${pageSetup}</worksheet>`,
  );
}

function contentTypesXml(): string {
  return xml(
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      "</Types>",
  );
}

function rootRelsXml(): string {
  return xml(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>",
  );
}

function workbookXml(sheetName: string): string {
  return xml(
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
      "</workbook>",
  );
}

function workbookRelsXml(): string {
  return xml(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>",
  );
}

function stylesXml(): string {
  return xml(
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font><font><b/><sz val="11"/><name val="Yu Gothic"/></font></fonts>' +
      '<fills count="11"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      fill("F8FBFF") +
      fill("E9EFFF") +
      fill("EEF2F5") +
      fill("F3F0EA") +
      fill("EDF7EE") +
      fill("F0F0F0") +
      fill("E8F6EF") +
      fill("FDEBEC") +
      fill("FFF4DF") +
      "</fills>" +
      '<borders count="1"><border><left style="thin"><color rgb="FFD7DCE2"/></left><right style="thin"><color rgb="FFD7DCE2"/></right><top style="thin"><color rgb="FFD7DCE2"/></top><bottom style="thin"><color rgb="FFD7DCE2"/></bottom></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="11">' +
      xf(0, false) +
      xf(2, false) +
      xf(3, true) +
      xf(4, false) +
      xf(5, false) +
      xf(6, false) +
      xf(7, false) +
      xf(8, false) +
      xf(9, true) +
      xf(10, false) +
      xf(9, true) +
      "</cellXfs>" +
      "</styleSheet>",
  );
}

function fill(rgb: string): string {
  return `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
}

function xf(fillId: number, bold: boolean): string {
  return `<xf numFmtId="0" fontId="${bold ? 1 : 0}" fillId="${fillId}" borderId="0" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`;
}

function styleIndex(tone: ExportCellTone): number {
  const map: Record<ExportCellTone, number> = {
    plain: 0,
    work: 1,
    night: 2,
    afterNight: 3,
    off: 4,
    leave: 5,
    supplyExclusion: 6,
    requestMatched: 7,
    requestUnmet: 8,
    diagnostic: 9,
    warning: 10,
    blocked: 8,
  };
  return map[tone];
}

function columnName(index: number): string {
  let value = "";
  let current = index;
  while (current > 0) {
    const mod = (current - 1) % 26;
    value = String.fromCharCode(65 + mod) + value;
    current = Math.floor((current - mod) / 26);
  }
  return value;
}

function xml(content: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${content}`;
}

function escapeXml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ZipInputFile {
  name: string;
  data: Uint8Array;
}

function file(name: string, content: string): ZipInputFile {
  return {
    name,
    data: encodeUtf8(content),
  };
}

function buildZip(files: ZipInputFile[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((entry) => {
    const nameBytes = encodeUtf8(entry.name);
    const crc = crc32(entry.data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      entry.data,
    ]);
    localParts.push(local);

    centralParts.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(entry.data.length),
        u32(entry.data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]),
    );
    offset += local.length;
  });

  const centralDirectory = concat(centralParts);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...localParts, centralDirectory, end]);
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  bytes[0] = value & 0xff;
  bytes[1] = (value >>> 8) & 0xff;
  return bytes;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[0] = value & 0xff;
  bytes[1] = (value >>> 8) & 0xff;
  bytes[2] = (value >>> 16) & 0xff;
  bytes[3] = (value >>> 24) & 0xff;
  return bytes;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
