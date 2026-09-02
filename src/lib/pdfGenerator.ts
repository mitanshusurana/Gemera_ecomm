// PDF Generator & Direct Print Utility using html2pdf.js
// Handles A4 Statutory Vouchers, Tax Invoices, Stock Registers & Party Ledgers

export const downloadPDF = async (elementId: string, filename: string = 'document.pdf') => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Print container #${elementId} not found`);
    return;
  }

  try {
    // Dynamic import html2pdf to support SSR Next.js
    const html2pdf = (await import('html2pdf.js')).default;
    
    const opt = {
      margin: [10, 10, 10, 10], // top, left, bottom, right in mm
      filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        logging: false,
        backgroundColor: '#FFFFFF'
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    await html2pdf().set(opt).from(element).save();
  } catch (err) {
    console.error('PDF Generation Error:', err);
    // Fallback to window.print if pdf generation fails
    window.print();
  }
};

export const printDocumentPDF = async (elementId: string, filename: string = 'document.pdf') => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Print container #${elementId} not found`);
    window.print();
    return;
  }

  try {
    const html2pdf = (await import('html2pdf.js')).default;

    const opt = {
      margin: [10, 10, 10, 10],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#FFFFFF' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    const worker = html2pdf().set(opt).from(element);
    const pdfBlobUrl = await worker.output('bloburl');
    
    // Open clean PDF preview in new window / iframe for printing
    const printWindow = window.open(pdfBlobUrl, '_blank');
    if (printWindow) {
      printWindow.focus();
    } else {
      // Fallback if popup blocked
      worker.save();
    }
  } catch (err) {
    console.error('Print PDF Error:', err);
    window.print();
  }
};
