export function exportCsv(filename: string, headers: string[], rows: Array<Array<string|number|null|undefined>>) {
  const csv = [headers,...rows].map(row=>row.map(value=>`"${String(value??'').replace(/^[=+@\-\t\r]/,"'\\$&").replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob=new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url);
}
export async function exportPdf(title:string, headers:string[], rows:Array<Array<string|number|null|undefined>>) {
  const {default:jsPDF}=await import('jspdf');
  const pdf=new jsPDF();pdf.setFontSize(17);pdf.text(title,14,18);
  const autoTable=(await import('jspdf-autotable')).default;
  autoTable(pdf,{head:[headers],body:rows.map(r=>r.map(x=>String(x??''))),startY:25,styles:{fontSize:8}});
  pdf.save(`${title.replace(/[^a-z0-9_-]/gi,'_')}.pdf`);
}
export async function exportXlsx(filename: string, headers: string[], rows: Array<Array<string|number|null|undefined>>) {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet([headers,...rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,sheet,'Report');
  XLSX.writeFile(book, filename.endsWith('.xlsx')?filename:`${filename}.xlsx`);
}
