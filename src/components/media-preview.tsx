import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ExternalLink, ImageIcon } from "lucide-react";

const IMG_RE = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?.*)?$/i;

export function isImageUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url, window.location.origin);
    return IMG_RE.test(u.pathname);
  } catch {
    return IMG_RE.test(url);
  }
}

export function MediaPreview({
  url,
  alt = "",
  thumbClassName = "h-32 w-auto max-w-[200px]",
  fallbackLabel = "เปิด",
}: {
  url: string;
  alt?: string;
  thumbClassName?: string;
  fallbackLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const isImg = isImageUrl(url);

  if (!isImg) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-primary inline-flex items-center gap-1 text-sm shrink-0"
      >
        <ExternalLink className="size-4" />
        {fallbackLabel}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative overflow-hidden rounded-lg border bg-muted/40 shrink-0 hover-scale focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label={alt || "ดูรูป"}
      >
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className={`${thumbClassName} object-cover block`}
        />
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <ImageIcon className="size-5 text-white drop-shadow" />
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl p-2 bg-background">
          <img src={url} alt={alt} className="w-full h-auto max-h-[85vh] object-contain rounded" />
        </DialogContent>
      </Dialog>
    </>
  );
}
