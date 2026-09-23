// html2pdf.js ships no type declarations. Declared here so the build can run
// with typescript.ignoreBuildErrors disabled.
declare module 'html2pdf.js' {
  const html2pdf: any;
  export default html2pdf;
}
