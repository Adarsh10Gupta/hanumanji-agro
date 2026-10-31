import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { NextResponse } from 'next/server';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { Enquiry } from '@/lib/models';

const safeText = (value: unknown) => String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
const inr = (amount: number) => `INR ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount)}`;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await owner()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await db();
    const { id } = await params;
    const enquiry: any = await Enquiry.findById(id).lean();
    const quotation = enquiry?.quotation;
    if (!enquiry) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
    if (!quotation?.lines?.length) return NextResponse.json({ error: 'Save a quotation draft before downloading it.' }, { status: 409 });

    const pdf = await PDFDocument.create();
    pdf.setTitle(`Hanumanji Agro quotation ${safeText(enquiry.reference)}`);
    pdf.setAuthor('Hanumanji Agro');
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const green = rgb(0.16, 0.24, 0.17);
    const muted = rgb(0.42, 0.45, 0.4);
    const border = rgb(0.86, 0.85, 0.8);
    const total = quotation.lines.reduce((sum: number, line: any) => sum + Number(line.quantity) * Number(line.unitPrice), 0) + Number(quotation.transport || 0) + Number(quotation.additionalCharges || 0);
    if (!Number.isFinite(total)) return NextResponse.json({ error: 'Quotation totals are invalid.' }, { status: 422 });

    let page = pdf.addPage([595.28, 841.89]);
    let y = 790;
    const margin = 48;
    const width = 595.28 - margin * 2;
    const line = (text: string, size = 10, font = regular, color = green, gap = 18) => {
      page.drawText(safeText(text), { x: margin, y, size, font, color, maxWidth: width });
      y -= gap;
    };
    const paragraph = (text: string, maxChars = 88) => {
      const words = safeText(text).split(/\s+/);
      let row = '';
      for (const word of words) {
        if ((row + ' ' + word).trim().length > maxChars && row) { line(row, 9, regular, muted, 14); row = word; }
        else row = (row + ' ' + word).trim();
      }
      if (row) line(row, 9, regular, muted, 14);
    };

    page.drawRectangle({ x: 0, y: 760, width: 595.28, height: 81.89, color: green });
    page.drawText('HANUMANJI AGRO', { x: margin, y: 805, size: 15, font: bold, color: rgb(1, 1, 1) });
    page.drawText('ROOTED IN NATURE · KALIMPONG, NORTHEAST INDIA', { x: margin, y: 785, size: 8, font: regular, color: rgb(0.86, 0.89, 0.82) });
    y = 724;
    line('QUOTATION', 10, bold, muted, 25);
    line(enquiry.reference, 22, bold, green, 30);
    line(`Prepared for: ${enquiry.customerSnapshot?.name || 'Customer'}`, 11, regular, green, 18);
    line(`Date: ${new Date(enquiry.createdAt).toLocaleDateString('en-IN')}`, 9, regular, muted, 22);
    page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, thickness: 1, color: border });
    y -= 25;

    const columns = [margin, margin + 246, margin + 355, margin + 430, margin + width];
    page.drawText('PRODUCT', { x: columns[0], y, size: 8, font: bold, color: muted });
    page.drawText('QUANTITY', { x: columns[1], y, size: 8, font: bold, color: muted });
    page.drawText('UNIT PRICE', { x: columns[2], y, size: 8, font: bold, color: muted });
    page.drawText('AMOUNT', { x: columns[3], y, size: 8, font: bold, color: muted });
    y -= 16;

    for (const item of quotation.lines) {
      if (y < 100) { page = pdf.addPage([595.28, 841.89]); y = 790; }
      const productName = safeText(item.productName).slice(0, 40);
      page.drawText(productName, { x: columns[0], y, size: 9, font: regular, color: green, maxWidth: 235 });
      page.drawText(safeText(`${item.quantity} ${item.unit}`), { x: columns[1], y, size: 9, font: regular, color: green, maxWidth: 100 });
      page.drawText(inr(Number(item.unitPrice)), { x: columns[2], y, size: 8, font: regular, color: green, maxWidth: 70 });
      page.drawText(inr(Number(item.quantity) * Number(item.unitPrice)), { x: columns[3], y, size: 8, font: regular, color: green, maxWidth: 75 });
      y -= 22;
      page.drawLine({ start: { x: margin, y: y + 7 }, end: { x: margin + width, y: y + 7 }, thickness: 0.5, color: border });
    }

    y -= 8;
    const drawTotal = (label: string, value: number, emphasize = false) => {
      page.drawText(label, { x: margin + 310, y, size: emphasize ? 11 : 9, font: emphasize ? bold : regular, color: green });
      page.drawText(inr(value), { x: margin + 415, y, size: emphasize ? 11 : 9, font: emphasize ? bold : regular, color: green, maxWidth: 90 });
      y -= emphasize ? 24 : 18;
    };
    drawTotal('Transportation', Number(quotation.transport || 0));
    drawTotal('Additional charges', Number(quotation.additionalCharges || 0));
    drawTotal('TOTAL', total, true);
    if (quotation.validUntil) { y -= 4; line(`Valid until: ${new Date(quotation.validUntil).toLocaleDateString('en-IN')}`, 9, regular, muted, 18); }
    if (quotation.notes) { y -= 8; line('NOTES', 9, bold, green, 16); paragraph(quotation.notes); }
    if (quotation.terms) { y -= 8; line('TERMS AND CONDITIONS', 9, bold, green, 16); paragraph(quotation.terms); }
    const bytes = await pdf.save();
    return new Response(bytes as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="quotation-${safeText(enquiry.reference).replace(/[^a-zA-Z0-9-]/g, '-')}.pdf"`, 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to generate the quotation PDF.' }, { status: 503 });
  }
}
