import { useMemo, useState } from "react";
import type L from "leaflet";

import type { AssetFeature, FloodEventFeature } from "@/types/geo";
import { countAssetsByType, formatIsoRange, MAX_ASSET_MARKERS } from "@/lib/geo";
import { buildPDF } from "@/lib/pdf";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LocalClock } from "@/components/LocalClock";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface FloodDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flood: FloodEventFeature | null;
  impactedAssets: AssetFeature[];
  map: L.Map | null;
}

const severityLabels: Record<string, string> = {
  low: "Low",
  med: "Medium",
  high: "High",
};

const severityStyles: Record<string, { background: string; color: string }> = {
  low: { background: "var(--good)", color: "var(--accent-ink)" },
  med: { background: "var(--warn)", color: "var(--accent-ink)" },
  high: { background: "var(--bad)", color: "#ffffff" },
};

async function captureMapImage(map: L.Map | null): Promise<string> {
  if (!map) return "";
  try {
    const leafletImageModule = await import("leaflet-image");
    const leafletImage = leafletImageModule.default ?? leafletImageModule;
    return await new Promise<string>((resolve) => {
      leafletImage(map, (err: Error | null, canvas: HTMLCanvasElement) => {
        if (err || !canvas) {
          resolve("");
          return;
        }
        resolve(canvas.toDataURL("image/png"));
      });
    });
  } catch (error) {
    console.error("Failed to capture map screenshot", error);
    return "";
  }
}

export function FloodDetailsDrawer({ open, onOpenChange, flood, impactedAssets, map }: FloodDetailsDrawerProps) {
  const [downloading, setDownloading] = useState(false);

  const summary = useMemo(() => countAssetsByType(impactedAssets), [impactedAssets]);
  const timezone = flood?.properties.timezone ?? "UTC";

  const handleDownload = async () => {
    if (!flood) return;
    setDownloading(true);
    try {
      const mapImage = await captureMapImage(map);
      const pdfDataUrl = await buildPDF(flood, impactedAssets, mapImage);
      const link = document.createElement("a");
      link.href = pdfDataUrl;
      const safeName = flood.properties.name.replace(/[^a-z0-9_-]+/gi, "_");
      link.download = `${safeName}_impact.pdf`;
      link.click();
    } catch (error) {
      console.error("Failed to generate PDF", error);
    } finally {
      setDownloading(false);
    }
  };

  const description = flood
    ? `${flood.properties.admin1 ?? "-"}, ${flood.properties.country} (${flood.properties.iso3}) — ${formatIsoRange(
        flood.properties.start,
        flood.properties.end,
      )}`
    : "Select a flood to see details.";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="border-b pb-4">
          <div className="flex items-start justify-between gap-2 text-left">
            <div className="space-y-1">
              <DrawerTitle>Flood impact details</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="sm" className="text-xs">
                Close
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex flex-col gap-6 px-4 py-4">
          {flood ? (
            <div className="grid gap-4">
              <div className="grid gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{flood.properties.name}</span>
                  {flood.properties.severity ? (
                    <Badge
                      variant="outline"
                      style={severityStyles[flood.properties.severity] ?? {}}
                      className="border-transparent text-xs"
                    >
                      {severityLabels[flood.properties.severity] ?? flood.properties.severity}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground">
                  {flood.properties.admin1 ?? "-"}, {flood.properties.country} ({flood.properties.iso3})
                </p>
                <p className="text-muted-foreground">Period: {formatIsoRange(flood.properties.start, flood.properties.end)}</p>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Local time:</span>
                  <LocalClock timezone={timezone} />
                </div>
                <p className="text-muted-foreground">Impacted assets: {impactedAssets.length}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Summary by asset type</h3>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  {summary.length ? (
                    summary.map((entry) => (
                      <div key={entry.type} className="rounded-md border border-border bg-panel p-3 shadow-sm">
                        <p className="text-xs uppercase text-muted-foreground">{entry.type}</p>
                        <p className="text-lg font-semibold">{entry.count}</p>
                      </div>
                    ))
                  ) : (
                    <p className="col-span-full text-muted-foreground">No impacted assets found for this flood.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a flood from the map to view its details.</p>
          )}

          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Impacted asset list</p>
              <p className="text-xs text-muted-foreground">Showing up to {Math.min(impactedAssets.length, MAX_ASSET_MARKERS).toLocaleString()} assets.</p>
            </div>
            <Button onClick={handleDownload} disabled={!flood || downloading || impactedAssets.length === 0}>
              {downloading ? "Preparing PDF..." : "Download PDF"}
            </Button>
          </div>

          <ScrollArea className="max-h-[240px] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Country</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {impactedAssets.length ? (
                  impactedAssets.slice(0, MAX_ASSET_MARKERS).map((asset) => (
                    <TableRow key={asset.properties.id}>
                      <TableCell className="font-medium">{asset.properties.name}</TableCell>
                      <TableCell className="capitalize">{asset.properties.type}</TableCell>
                      <TableCell>{asset.properties.admin1 ?? "-"}</TableCell>
                      <TableCell>{asset.properties.country}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No impacted assets to show.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        <DrawerFooter />
      </DrawerContent>
    </Drawer>
  );
}

