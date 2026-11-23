import { Move, Users } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

export interface CoverFraming {
  x: number;
  y: number;
  zoom: number;
}

export const DEFAULT_FRAMING: CoverFraming = { x: 50, y: 50, zoom: 1 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Image cropped with object-cover; position and zoom keep the same focal point at any width. */
function FramedImage({ src, framing, className }: { src: string; framing: CoverFraming; className?: string }) {
  const origin = `${framing.x}% ${framing.y}%`;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={cn("h-full w-full object-cover select-none", className)}
      style={{ objectPosition: origin, transform: `scale(${framing.zoom})`, transformOrigin: origin }}
    />
  );
}

export function CommunityCover({
  path,
  framing,
  className,
}: {
  path: string | null;
  framing?: CoverFraming;
  className?: string;
}) {
  const url = useMediaUrl(path);
  return (
    <div className={cn("h-full w-full overflow-hidden", className)}>
      {url ? (
        <FramedImage src={url} framing={framing ?? DEFAULT_FRAMING} />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-secondary via-accent to-muted" />
      )}
    </div>
  );
}

export function CommunityAvatar({ path, name, className }: { path: string | null; name: string; className?: string }) {
  const url = useMediaUrl(path);
  return (
    <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-secondary text-primary shadow-soft", className)}>
      {url ? <img src={url} alt={`Foto de ${name}`} className="h-full w-full object-cover" /> : <Users className="h-1/2 w-1/2" />}
    </div>
  );
}

/** Drag to reposition, slider to zoom; previews the page banner and the list card. */
export function CoverFramer({
  file,
  path,
  value,
  onChange,
}: {
  file: File | null;
  path: string | null;
  value: CoverFraming;
  onChange: (v: CoverFraming) => void;
}) {
  const stored = useMediaUrl(file ? null : path);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setObjectUrl(null);
    const u = URL.createObjectURL(file);
    setObjectUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const src = objectUrl ?? stored;
  const drag = useRef<{ x: number; y: number; start: CoverFraming } | null>(null);

  if (!src) return null;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: value };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - d.x) / rect.width) * 100;
    const dy = ((e.clientY - d.y) / rect.height) * 100;
    // Dragging the picture right reveals more of its left side, so the focal point moves left.
    onChange({ ...d.start, x: clamp(d.start.x - dx / d.start.zoom, 0, 100), y: clamp(d.start.y - dy / (d.start.zoom * 2), 0, 100) });
  };
  const stop = () => {
    drag.current = null;
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background/60 p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Move className="h-3.5 w-3.5" /> Arraste a imagem para posicionar e use o zoom para enquadrar.
      </p>
      <div
        role="img"
        aria-label="Pré-visualização da capa — arraste para reposicionar"
        className="aspect-[4/1] w-full cursor-grab touch-none overflow-hidden rounded-lg border border-border active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <FramedImage src={src} framing={value} />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Zoom</span>
        <Slider
          aria-label="Zoom da capa"
          min={1}
          max={3}
          step={0.05}
          value={[value.zoom]}
          onValueChange={([z]) => onChange({ ...value, zoom: clamp(z ?? 1, 1, 3) })}
          className="flex-1"
        />
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(DEFAULT_FRAMING)}>
          Centralizar
        </Button>
      </div>
      <div className="flex items-end gap-3">
        <div className="w-40 shrink-0 overflow-hidden rounded-lg border border-border">
          <div className="aspect-[3/1]">
            <FramedImage src={src} framing={value} />
          </div>
        </div>
        <span className="text-xs text-muted-foreground">Como aparece no card</span>
      </div>
    </div>
  );
}
