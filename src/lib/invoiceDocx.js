import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, BorderStyle, WidthType, VerticalAlign } from "docx";

const NO_BORDER = {
  top:{style:BorderStyle.NONE,size:0,color:"FFFFFF"}, bottom:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
  left:{style:BorderStyle.NONE,size:0,color:"FFFFFF"}, right:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
};
const CELL_BORDER = {
  top:{style:BorderStyle.SINGLE,size:4,color:"CBD5E1"}, bottom:{style:BorderStyle.SINGLE,size:4,color:"CBD5E1"},
  left:{style:BorderStyle.SINGLE,size:4,color:"CBD5E1"}, right:{style:BorderStyle.SINGLE,size:4,color:"CBD5E1"},
};
const SIG_BORDER = {
  top:{style:BorderStyle.SINGLE,size:6,color:"0F172A"}, bottom:NO_BORDER.bottom, left:NO_BORDER.left, right:NO_BORDER.right,
};

function p(text, opts={}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: opts.spacing || { after: 40 },
    children: [new TextRun({ text: text==null?"":String(text), bold: opts.bold, italics: opts.italics, size: opts.size||18, color: opts.color })],
  });
}

function cell(text, opts={}) {
  return new TableCell({
    borders: opts.borders || CELL_BORDER,
    width: opts.width,
    columnSpan: opts.columnSpan,
    shading: opts.shading,
    verticalAlign: VerticalAlign.CENTER,
    margins: opts.margins || { top:40, bottom:40, left:80, right:80 },
    children: [p(text, { align: opts.align, bold: opts.bold, size: opts.size||18, color: opts.color })],
  });
}

const HEADER_SHADE = { fill: "0F172A" };
const LIGHT_SHADE = { fill: "F8FAFC" };

export async function generateInvoiceDocx(inv, its, t, company) {
  const heading = inv.type==="Invoice" ? "TAX INVOICE" : inv.type==="Quotation" ? "QUOTATION" : inv.type==="Proforma" ? "PROFORMA INVOICE" : (inv.type||"INVOICE").toUpperCase();
  const showPct = its.some(i=>parseFloat(i.pct_of_contract)>0);
  const hasBank = company.company_bank || company.company_iban;

  /* ---- Header: company info | invoice info ---- */
  const companyLines = [p(company.company_name||"Company", {bold:true, size:28})];
  if (company.company_name_ar) companyLines.push(p(company.company_name_ar, {size:20}));
  if (company.company_address) companyLines.push(p(company.company_address, {size:18, color:"475569"}));
  const phoneLine = [company.company_phone, company.company_phone2].filter(Boolean).join(" / ");
  if (phoneLine) companyLines.push(p(`Tel: ${phoneLine}`, {size:18, color:"475569"}));
  const emailLine = [company.company_email, company.company_website].filter(Boolean).join("   |   ");
  if (emailLine) companyLines.push(p(emailLine, {size:18, color:"475569"}));
  if (company.company_vat_no) companyLines.push(p(`VAT Reg No: ${company.company_vat_no}`, {size:18, color:"475569"}));
  if (company.company_cr) companyLines.push(p(`CR No: ${company.company_cr}`, {size:18, color:"475569"}));

  const invoiceInfoLines = [
    p(heading, {bold:true, size:32, color:"6366F1", align: AlignmentType.RIGHT}),
    p(`#${inv.invoice_number||""}`, {bold:true, size:22, align: AlignmentType.RIGHT}),
    p(`Date: ${inv.invoice_date||""}`, {size:18, color:"475569", align: AlignmentType.RIGHT}),
  ];
  if (inv.due_date) invoiceInfoLines.push(p(`Due: ${inv.due_date}`, {size:18, color:"475569", align: AlignmentType.RIGHT}));

  const headerTable = new Table({
    width: {size:100, type: WidthType.PERCENTAGE},
    borders: NO_BORDER,
    rows: [new TableRow({children:[
      new TableCell({borders:NO_BORDER, width:{size:60,type:WidthType.PERCENTAGE}, children: companyLines}),
      new TableCell({borders:NO_BORDER, width:{size:40,type:WidthType.PERCENTAGE}, verticalAlign: VerticalAlign.TOP, children: invoiceInfoLines}),
    ]})],
  });

  /* ---- Bill To / Project ---- */
  const billLines = [inv.client_name||inv.customer||""];
  if (inv.client_business) billLines.push(inv.client_business);
  if (inv.client_address) billLines.push(inv.client_address);
  if (inv.client_phone) billLines.push(`Tel: ${inv.client_phone}`);
  if (inv.client_email) billLines.push(inv.client_email);

  const projLines = [];
  if (inv.project) projLines.push(inv.project);
  if (inv.project_location) projLines.push(inv.project_location);
  if (parseFloat(inv.contract_value)>0) projLines.push(`Contract Value: OMR ${parseFloat(inv.contract_value).toFixed(3)}`);
  if (inv.payment_schedule) projLines.push(inv.payment_schedule);

  const infoBlock = (title, lines) => [
    p(title, {bold:true, size:18, color:"6366F1"}),
    ...lines.map((l,i)=>p(l, {size:18, color: i===0?"0F172A":"475569", bold: i===0})),
  ];

  const billProjectTable = new Table({
    width:{size:100,type:WidthType.PERCENTAGE},
    borders: NO_BORDER,
    rows:[new TableRow({children:[
      new TableCell({borders:NO_BORDER, width:{size:50,type:WidthType.PERCENTAGE}, shading:LIGHT_SHADE, margins:{top:100,bottom:100,left:120,right:120}, children: infoBlock("BILL TO", billLines)}),
      new TableCell({borders:NO_BORDER, width:{size:50,type:WidthType.PERCENTAGE}, shading:LIGHT_SHADE, margins:{top:100,bottom:100,left:120,right:120}, children: infoBlock("PROJECT", projLines)}),
    ]})],
  });

  /* ---- Items table ---- */
  const totalCols = showPct ? 7 : 6;
  const headerCells = [
    cell("#", {align:AlignmentType.CENTER, bold:true, color:"FFFFFF", shading:HEADER_SHADE}),
    cell("Description", {bold:true, color:"FFFFFF", shading:HEADER_SHADE}),
    cell("Qty", {align:AlignmentType.CENTER, bold:true, color:"FFFFFF", shading:HEADER_SHADE}),
    cell("Unit", {align:AlignmentType.CENTER, bold:true, color:"FFFFFF", shading:HEADER_SHADE}),
    cell("Rate (OMR)", {align:AlignmentType.RIGHT, bold:true, color:"FFFFFF", shading:HEADER_SHADE}),
    ...(showPct ? [cell("%", {align:AlignmentType.CENTER, bold:true, color:"FFFFFF", shading:HEADER_SHADE})] : []),
    cell("Amount (OMR)", {align:AlignmentType.RIGHT, bold:true, color:"FFFFFF", shading:HEADER_SHADE}),
  ];

  const itemRows = its.map((it,i)=> new TableRow({children:[
    cell(String(i+1), {align:AlignmentType.CENTER, color:"64748B"}),
    cell(it.description, {bold:true}),
    cell(String(it.quantity), {align:AlignmentType.CENTER}),
    cell(it.unit, {align:AlignmentType.CENTER, color:"64748B"}),
    cell(parseFloat(it.rate).toFixed(3), {align:AlignmentType.RIGHT}),
    ...(showPct ? [cell(parseFloat(it.pct_of_contract)>0?`${parseFloat(it.pct_of_contract)}%`:"—", {align:AlignmentType.CENTER, color:"64748B"})] : []),
    cell(parseFloat(it.amount).toFixed(3), {align:AlignmentType.RIGHT, bold:true}),
  ]}));

  const totalRow = (label, value, opts={}) => new TableRow({children:[
    cell(label, {align:AlignmentType.RIGHT, bold:opts.bold, columnSpan: totalCols-1, color: opts.color}),
    cell(value, {align:AlignmentType.RIGHT, bold:opts.bold, color: opts.color}),
  ]});

  const totalsRows = [];
  totalsRows.push(totalRow("Subtotal", `OMR ${t.subtotal.toFixed(3)}`));
  if (t.disc>0.001) totalsRows.push(totalRow("Discount", `-OMR ${t.disc.toFixed(3)}`));
  if (t.vat>0.001) totalsRows.push(totalRow(`VAT (${inv.vat_pct}%)`, `OMR ${t.vat.toFixed(3)}`));
  if (t.ro) totalsRows.push(totalRow("Roundoff", `OMR ${typeof t.ro==="number"?t.ro.toFixed(3):t.ro}`));
  totalsRows.push(totalRow("Grand Total", `OMR ${t.grand.toFixed(3)}`, {bold:true}));
  if (t.ret>0.001) {
    totalsRows.push(totalRow(`Retainage (${inv.retainage_pct}%)`, `-OMR ${t.ret.toFixed(3)}`, {color:"D97706"}));
    totalsRows.push(totalRow("Current Due", `OMR ${t.currentDue.toFixed(3)}`, {bold:true, color:"6366F1"}));
  }

  const itemsTable = new Table({
    width: {size:100, type:WidthType.PERCENTAGE},
    rows: [new TableRow({children:headerCells}), ...itemRows, ...totalsRows],
  });

  /* ---- Terms / Warranty / Notes ---- */
  const extraSections = [];
  if (inv.terms) { extraSections.push(p("Terms & Conditions", {bold:true, size:18})); extraSections.push(p(inv.terms, {size:18, color:"475569"})); }
  if (inv.warranty) { extraSections.push(p("Warranty", {bold:true, size:18})); extraSections.push(p(inv.warranty, {size:18, color:"475569"})); }
  if (inv.notes) { extraSections.push(p("Notes", {bold:true, size:18, color:"6366F1"})); extraSections.push(p(inv.notes, {size:18, color:"475569"})); }

  /* ---- Bank Details ---- */
  const bankLines = [];
  if (hasBank) {
    bankLines.push(p("BANK DETAILS FOR PAYMENT", {bold:true, size:18, color:"6366F1"}));
    if (company.company_bank) bankLines.push(p(`Bank: ${company.company_bank}`, {size:18}));
    if (company.company_iban) bankLines.push(p(`IBAN: ${company.company_iban}`, {size:18}));
    if (company.company_name) bankLines.push(p(`Account Name: ${company.company_name}`, {size:18}));
  }

  /* ---- Signatures ---- */
  const signatureTable = new Table({
    width:{size:100,type:WidthType.PERCENTAGE},
    borders: NO_BORDER,
    rows:[new TableRow({children:[
      new TableCell({borders:SIG_BORDER, width:{size:50,type:WidthType.PERCENTAGE}, margins:{top:80,left:0,right:0,bottom:0}, children:[p("Customer Signature & Date", {size:18, color:"475569"})]}),
      new TableCell({borders:NO_BORDER, width:{size:4,type:WidthType.PERCENTAGE}, children:[p("")]}),
      new TableCell({borders:SIG_BORDER, width:{size:46,type:WidthType.PERCENTAGE}, margins:{top:80,left:0,right:0,bottom:0}, children:[p(`Authorized Signatory — ${company.company_name||"Company"}`, {size:18, color:"475569"})]}),
    ]})],
  });

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 600, right: 600, bottom: 600, left: 600 } } },
      children: [
        headerTable,
        p(""),
        billProjectTable,
        p(""),
        itemsTable,
        p(""),
        ...extraSections,
        ...bankLines,
        p(""), p(""), p(""), p(""),
        signatureTable,
      ],
    }],
  });

  return await Packer.toBlob(doc);
}
