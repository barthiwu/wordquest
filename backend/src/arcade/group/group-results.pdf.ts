import PDFDocument from 'pdfkit';
import {
  cellVerdict,
  CellVerdict,
  formatDuration,
  gameLabel,
  GroupResultSheet,
  formatSeconds,
  SheetPlayer,
} from './group-results.util';

/**
 * Renders the result sheet as a PDF: a summary table, then one block per
 * player listing every word with what they typed -- green when it was right,
 * red when it was wrong -- and the time they used.
 *
 * pdfkit's built-in fonts cover Latin text only, so any character outside
 * Latin-1 (a name in Arabic or Chinese, say) prints as "?". The CSV keeps
 * every character.
 */

const GREEN = '#1B7F3B';
const RED = '#C62828';
const GREY = '#6B7280';
const INK = '#111827';
const RULE = '#D1D5DB';
const BAND = '#F3F4F6';

const MARGIN = 40;
const ROW_H = 17;

/** Text pdfkit's standard fonts can draw: Latin-1 only, no control characters. */
export function pdfSafe(text: string | null | undefined): string {
  let out = '';
  for (const ch of (text ?? '').normalize('NFC')) {
    const code = ch.codePointAt(0) as number;
    if (code < 0x20 || code === 0x7f) out += ' ';
    else out += code <= 0xff ? ch : '?';
  }
  return out;
}

/** Cuts text to fit a width in the current font, ending in "..." (pdfkit's own ellipsis only works while wrapping). */
function fit(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string {
  if (doc.widthOfString(text) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && doc.widthOfString(`${out}...`) > maxWidth) out = out.slice(0, -1);
  return `${out}...`;
}

const VERDICT_TEXT: Record<CellVerdict, string> = {
  CORRECT: 'Correct',
  WRONG: 'Wrong',
  TIMED_OUT: 'Timed out',
  NOT_ANSWERED: '-',
};

const VERDICT_COLOR: Record<CellVerdict, string> = {
  CORRECT: GREEN,
  WRONG: RED,
  TIMED_OUT: RED,
  NOT_ANSWERED: GREY,
};

export function renderResultPdf(sheet: GroupResultSheet): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: pdfSafe(sheet.title ?? `${gameLabel(sheet.game)} results`),
        Producer: 'WordQuest',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      draw(doc, sheet);
      stampPageNumbers(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function draw(doc: PDFKit.PDFDocument, sheet: GroupResultSheet): void {
  const width = doc.page.width - MARGIN * 2;
  const bottom = (): number => doc.page.height - MARGIN - 14;

  // ── Heading ──
  const gameName = gameLabel(sheet.game);
  doc.font('Helvetica-Bold').fontSize(18).fillColor(INK);
  doc.text(pdfSafe(sheet.title ?? `${gameName} results`), MARGIN, MARGIN, { width });
  doc.font('Helvetica').fontSize(9).fillColor(GREY);
  const when = new Date(sheet.endedAt ?? sheet.generatedAt)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 16);
  doc.text(
    `${gameName}  |  ${sheet.words.length} words  |  ${sheet.players.length} players  |  ` +
      `${sheet.final ? 'Final results' : 'Round still running - results so far'}  |  ${when} UTC`,
    { width },
  );
  doc.moveDown(0.6);
  doc.font('Helvetica').fontSize(8).fillColor(GREY);
  doc.text(
    sheet.typedKind === 'LETTERS'
      ? 'Each word shows the letters the player guessed, in order. Green = the word was solved, red = it was not.'
      : 'Each word shows exactly what the player typed. Green = correct, red = wrong.',
    { width },
  );
  doc.moveDown(0.8);

  // ── Summary table ──
  const sumCols = [
    { label: 'Rank', w: 40 },
    { label: 'Player', w: width - 40 - 80 - 80 - 100 },
    { label: 'Correct', w: 80 },
    { label: 'Answered', w: 80 },
    { label: 'Total time', w: 100 },
  ];
  let y = doc.y;
  const headerRow = (cols: Array<{ label: string; w: number }>, atY: number): number => {
    doc.rect(MARGIN, atY, width, ROW_H).fill(BAND);
    let x = MARGIN;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
    for (const c of cols) {
      doc.text(c.label, x + 4, atY + 4, { lineBreak: false });
      x += c.w;
    }
    return atY + ROW_H;
  };
  y = headerRow(sumCols, y);
  sheet.players.forEach((p, i) => {
    if (y + ROW_H > bottom()) {
      doc.addPage();
      y = headerRow(sumCols, MARGIN);
    }
    const cells = [
      p.rank === null ? '-' : String(p.rank),
      pdfSafe(p.name) + (p.isHost ? ' (host)' : ''),
      `${p.correct} / ${sheet.words.length}`,
      String(p.answered),
      p.state === 'NOT_STARTED' ? 'did not start' : formatDuration(p.totalTimeMs),
    ];
    if (i % 2 === 1) doc.rect(MARGIN, y, width, ROW_H).fill('#FAFAFA');
    let x = MARGIN;
    doc.font('Helvetica').fontSize(9).fillColor(INK);
    cells.forEach((text, c) => {
      doc.text(fit(doc, text, sumCols[c].w - 8), x + 4, y + 4, { lineBreak: false });
      x += sumCols[c].w;
    });
    y += ROW_H;
  });

  // ── One block per player ──
  const cols = [
    { label: '#', w: 28 },
    { label: 'Word', w: 130 },
    { label: sheet.typedKind === 'LETTERS' ? 'Letters guessed' : 'Typed', w: 170 },
    { label: 'Result', w: 110 },
    { label: 'Time (s)', w: width - 28 - 130 - 170 - 110 },
  ];
  for (const p of sheet.players) {
    y += 20;
    const blockMin = ROW_H * 3 + 24;
    if (y + blockMin > bottom()) {
      doc.addPage();
      y = MARGIN;
    }
    y = playerHeading(doc, p, sheet.words.length, y, width);
    y = headerRow(cols, y);
    if (p.state === 'NOT_STARTED') {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(GREY);
      doc.text('Did not start the round.', MARGIN + 4, y + 4, { lineBreak: false });
      y += ROW_H;
      continue;
    }
    sheet.words.forEach((w, i) => {
      if (y + ROW_H > bottom()) {
        doc.addPage();
        y = headerRow(cols, MARGIN);
      }
      const cell = p.cells[i];
      const verdict = cellVerdict(cell);
      const color = VERDICT_COLOR[verdict];
      const typed =
        cell.typed === null ? '-' : cell.typed === '' ? '(no answer)' : pdfSafe(cell.typed);
      let x = MARGIN;
      const put = (text: string, w2: number, fill: string, bold = false): void => {
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9)
          .fillColor(fill);
        doc.text(fit(doc, text, w2 - 8), x + 4, y + 4, { lineBreak: false });
        x += w2;
      };
      put(String(w.index + 1), cols[0].w, GREY);
      put(pdfSafe(w.word), cols[1].w, INK);
      put(typed, cols[2].w, color, true);
      put(VERDICT_TEXT[verdict], cols[3].w, color);
      put(cell.timeMs === null ? '-' : formatSeconds(cell.timeMs), cols[4].w, GREY);
      doc
        .moveTo(MARGIN, y + ROW_H)
        .lineTo(MARGIN + width, y + ROW_H)
        .lineWidth(0.4)
        .stroke(RULE);
      y += ROW_H;
    });
  }
}

function playerHeading(
  doc: PDFKit.PDFDocument,
  p: SheetPlayer,
  wordCount: number,
  y: number,
  width: number,
): number {
  const rank = p.rank === null ? '' : `#${p.rank}  `;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK);
  doc.text(
    fit(doc, `${rank}${pdfSafe(p.name)}${p.isHost ? ' (host)' : ''}`, width - 210),
    MARGIN,
    y,
    {
      lineBreak: false,
    },
  );
  doc.font('Helvetica').fontSize(9).fillColor(GREY);
  doc.text(
    p.state === 'NOT_STARTED'
      ? 'did not start'
      : `${p.correct} / ${wordCount} correct  |  total time ${formatDuration(p.totalTimeMs)}`,
    MARGIN + width - 200,
    y + 2,
    { width: 200, align: 'right', lineBreak: false },
  );
  return y + 18;
}

/** "Page 2 of 5" in the bottom margin of every page. */
function stampPageNumbers(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    // Writing inside the bottom margin would otherwise start a new page.
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(GREY);
    doc.text(
      `WordQuest  |  Page ${i + 1} of ${range.count}`,
      MARGIN,
      doc.page.height - MARGIN + 6,
      {
        width: doc.page.width - MARGIN * 2,
        align: 'center',
        lineBreak: false,
      },
    );
    doc.page.margins.bottom = saved;
  }
}
