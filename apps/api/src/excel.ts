// The Excel file of the Reviews page, as today's (current-app: reviews.js `xpRun` and routes-reviews.js
// /api/export/call-reviews): always in English, one column per scorecard category, dates as real Excel dates and
// scores as real Excel percentages (85.6 is shown as 85.60%), so filters, formulas and pivot tables read them as numbers.
import type { QuickFlag, Review } from '@qsmart/db';
import ExcelJS from 'exceljs';

const TYPE: Record<Review['channel'], string> = { call: 'call', chat: 'chat', email: 'email', other: 'conversation' };

/** The categories of the reviews, in the order they first appear. */
const categoryNames = (reviews: Review[]) => [...new Set(reviews.flatMap((r) => r.categories.map((c) => c.name)))];

export async function reviewsWorkbook(reviews: Review[], sheetName: string): Promise<Buffer> {
  const categories = categoryNames(reviews);
  const head = [
    'Lead ID',
    'Date',
    'Agent',
    'Team',
    'Campaign',
    'Reviewer',
    ...categories,
    'Total Score (%)',
    'Flag',
    'Quick Flags',
    'Status',
    'Disputed',
    'Comments',
    'Link',
    'Recording Link',
    'Type',
    'Chat / email link',
    'Subject or channel',
  ];
  const firstPercent = 6;
  const lastPercent = 6 + categories.length;
  const rows = reviews.map((r) => [
    r.leadId,
    new Date(`${r.reviewedOn}T12:00:00`),
    r.agentName,
    r.teamName,
    `${r.reviewedOn} ${r.campaign || 'general'}`,
    r.reviewerName,
    ...categories.map((name) => {
      const c = r.categories.find((x) => x.name === name);
      return c && c.possible ? Math.round((c.earned / c.possible) * 1000) / 10 : '';
    }),
    r.score ?? '',
    r.flag === 'red' ? 'Red Flag' : r.flag === 'green' ? 'Green Flag' : '',
    '',
    'Completed',
    r.status === 'disputed' ? 'Yes' : 'No',
    [
      r.comment,
      ...r.categories.flatMap((c) => c.questions.filter((q) => q.comment).map((q) => `[${c.name}] ${q.comment}`)),
    ]
      .filter(Boolean)
      .join(' | '),
    r.leadLink,
    r.recordingLink,
    TYPE[r.channel],
    r.conversationLink,
    r.emailSubject || r.channelName,
  ]);

  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Reviews');
  sheet.addRow(head);
  for (const row of rows) sheet.addRow(row);
  sheet.eachRow((row, rowNumber) =>
    row.eachCell((cell, column) => {
      cell.font = { name: 'Calibri', size: 12, bold: rowNumber === 1 };
      if (rowNumber === 1) return;
      // Excel's own formats: the Date category (shown in the short date of the computer that opens it), and Percentage
      if (column === 2 && cell.value instanceof Date) cell.numFmt = 'mm-dd-yy';
      if (column - 1 >= firstPercent && column - 1 <= lastPercent && typeof cell.value === 'number') {
        cell.value = Math.round(cell.value * 10) / 1000;
        cell.numFmt = '0.00%';
      }
    }),
  );
  const wide: Record<number, number> = { 5: 34, [head.length - 2]: 30, [head.length - 1]: 40, [head.length]: 40 };
  sheet.columns.forEach((column, i) => {
    column.width = wide[i + 1] ?? Math.min(34, Math.max(11, String(head[i]).length + 4));
  });
  return Buffer.from(await book.xlsx.writeBuffer());
}

/** One conversation of the Quick Flags page: its review (if it has one) and its quick flags. */
export interface FlagRow {
  review: Review | undefined;
  flags: QuickFlag[];
}
const CHANNEL: Record<Review['channel'], string> = { call: 'Call', chat: 'Chat', email: 'Email', other: 'Other' };

/** The Excel file of the Quick Flags page, as today's (current-app: flags.js `xfExport`). */
export async function flagsWorkbook(rows: FlagRow[]): Promise<Buffer> {
  const head = [
    'Lead ID',
    'Type',
    'Date',
    'Agent',
    'Team',
    'Campaign',
    'QA Score',
    'QA flag',
    'Quick flags',
    'Comments',
    'Flagged by',
  ];
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Quick Flags');
  sheet.addRow(head);
  for (const { review, flags } of rows) {
    const first = flags[0];
    const day = review?.reviewedOn ?? first?.flaggedOn ?? '';
    const campaign = review?.campaign ?? first?.campaign ?? '';
    sheet.addRow([
      review?.leadId ?? first?.leadId ?? '',
      CHANNEL[review?.channel ?? first?.channel ?? 'call'],
      day ? new Date(`${day}T12:00:00`) : '',
      review?.agentName ?? first?.agentName ?? '',
      review?.teamName ?? first?.teamName ?? '',
      `${day} ${campaign || 'general'}`,
      review && !review.notScored ? (review.score ?? '') : '',
      review?.flag ?? '',
      flags.map((f) => f.type).join(', '),
      flags
        .map((f) => f.comment)
        .filter(Boolean)
        .join(' | '),
      [...new Set(flags.map((f) => f.byName))].join(', '),
    ]);
  }
  sheet.eachRow((row, rowNumber) =>
    row.eachCell((cell, column) => {
      cell.font = { name: 'Calibri', size: 12, bold: rowNumber === 1 };
      if (rowNumber === 1) return;
      if (column === 3 && cell.value instanceof Date) cell.numFmt = 'mm-dd-yy';
      if (column === 7 && typeof cell.value === 'number') {
        cell.value = Math.round(cell.value * 10) / 1000;
        cell.numFmt = '0.00%';
      }
    }),
  );
  sheet.columns.forEach((column, i) => {
    column.width = i === 5 || i === 9 ? 34 : Math.min(34, Math.max(11, String(head[i]).length + 4));
  });
  return Buffer.from(await book.xlsx.writeBuffer());
}
