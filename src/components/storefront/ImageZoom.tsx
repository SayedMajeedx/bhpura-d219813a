import React, { useState, useRef } from "react";
import { ResponsiveImage } from "@/components/responsive-media";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ZoomIn, X } from "lucide-react";

interface ImageZoomProps {
  src: string;
  alt: string;
  className?: string;
  aspectRatio?: string;
  style?: React.CSSProperties;
}

export function ImageZoom({
  src,
  alt,
  className = "",
  aspectRatio = "aspect-[3/4]",
  style,
}: ImageZoomProps) {
  const [isZooming, setIsZooming] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setZoomPos({ x, y });
  };

  const handleMouseEnter = () => {
    setIsZooming(true);
  };

  const handleMouseLeave = () => {
    setIsZooming(false);
  };

  return (
    <>
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => setLightboxOpen(true)}
        className={`relative overflow-hidden cursor-zoom-in rounded-xl bg-muted group ${aspectRatio} ${className}`}
      >
        {/* Base Image */}
        <ResponsiveImage
          src={src}
          preset="hero"
          sizes="(min-width: 1024px) 50vw, 100vw"
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-200 ${
            isZooming ? "opacity-0" : "opacity-100"
          }`}
          loading="eager"
          decoding="async"
          style={style}
        />

        {/* 2x Desktop Zoom Canvas on Hover */}
        {isZooming && (
          <div
            className="hidden lg:block absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url(${src})`,
              backgroundPosition: `${zoomPos.x}% ${zoomPos.y}%`,
              backgroundSize: "220%",
              backgroundRepeat: "no-repeat",
            }}
          />
        )}

        {/* Tap/Click Zoom Hint Badge */}
        <div className="absolute end-3 bottom-3 z-10 p-2 rounded-full bg-background/80 backdrop-blur-xs border border-border text-foreground shadow-xs opacity-70 group-hover:opacity-100 transition-opacity">
          <ZoomIn className="h-4 w-4" />
        </div>
      </div>

      {/* Fullscreen Mobile Lightbox Dialog */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl max-h-[95vh] p-1 bg-black/95 border-none flex items-center justify-center overflow-hidden">
          <div className="relative w-full h-full max-h-[90vh] flex items-center justify-center p-2">
            <img
              src={src}
              alt={alt}
              className="max-h-[85vh] max-w-full object-contain rounded-lg"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
