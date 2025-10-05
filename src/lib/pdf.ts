import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AssetFeature, FloodEventFeature } from "@/types/geo";
import { countAssetsByType, formatIsoRange } from "@/lib/geo";

const PDF_PADDING = 32;
const MAX_DETAIL_ROWS = 250;

export async function buildPDF(
  flood: FloodEventFeature,
  impacted: AssetFeature[],
  mapImageDataUrl: string
): Promise<string> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Flood Impact Report", PDF_PADDING, 40);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const { name, country, admin1, iso3, start, end } = flood.properties;
  doc.text(name, PDF_PADDING, 60);
  doc.text(`Location: ${admin1 ?? "-"}, ${country} (${iso3})`, PDF_PADDING, 78);
  doc.text(`Period: ${formatIsoRange(start, end)}`, PDF_PADDING, 96);

  let cursorY = 110;

  if (mapImageDataUrl) {
    const width = 531;
    const height = 300;
    doc.addImage(mapImageDataUrl, "PNG", PDF_PADDING, cursorY, width, height);
    cursorY += height + 20;
  }

  const summaryRows = countAssetsByType(impacted).map((row) => [row.type, String(row.count)]);

  autoTable(doc, {
    startY: cursorY,
    head: [["Asset Type", "Count"]],
    body: summaryRows.length ? summaryRows : [["-", "0"]],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [14, 165, 233], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 180 },
    },
  });

  const detailStartY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 16 : cursorY + 40;

  const detailRows = impacted.slice(0, MAX_DETAIL_ROWS).map((asset) => [
    asset.properties.name,
    asset.properties.type,
    asset.properties.admin1 ?? "-",
    asset.properties.country,
  ]);

  autoTable(doc, {
    startY: detailStartY,
    head: [["Name", "Type", "Region", "Country"]],
    body: detailRows.length ? detailRows : [["No impacted assets", "-", "-", "-"]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [56, 189, 248], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 220 },
      1: { cellWidth: 80 },
      2: { cellWidth: 120 },
      3: { cellWidth: 80 },
    },
    pageBreak: "auto",
  });

  return doc.output("dataurlstring");
}
