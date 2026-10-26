"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

function detectorClass(): DetectorConstructor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector ?? null;
}

/**
 * Lecture des QR codes des cartons avec l'appareil photo du téléphone
 * (Chrome Android). Sans prise en charge, le bouton n'apparaît pas : la
 * douchette ou la saisie restent possibles.
 */
export function QrCameraScanner({ onCode }: { onCode: (text: string) => void }) {
  const [supported] = useState(() => detectorClass() !== null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  useEffect(() => { onCodeRef.current = onCode; }, [onCode]);

  useEffect(() => {
    if (!open) return;
    const Detector = detectorClass();
    if (!Detector) return;
    const detector = new Detector({ formats: ["qr_code"] });
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let last = "";
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((media) => {
      if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
      stream = media;
      if (video.current) {
        video.current.srcObject = media;
        void video.current.play();
      }
      timer = window.setInterval(async () => {
        if (!video.current || video.current.readyState < 2) return;
        try {
          const [code] = await detector.detect(video.current);
          if (code?.rawValue && code.rawValue !== last) {
            last = code.rawValue;
            onCodeRef.current(code.rawValue);
            window.setTimeout(() => { last = ""; }, 3000);
          }
        } catch {
          // Image illisible : on réessaie au tour suivant.
        }
      }, 350);
    }).catch(() => setError("Autorisez l'appareil photo pour scanner les cartons."));
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open]);

  if (!supported) return null;
  return (
    <div className="space-y-2">
      <Button type="button" variant={open ? "outline" : "default"} className="min-h-11" onClick={() => { setError(null); setOpen((value) => !value); }}>
        {open ? <><X /> Fermer l&apos;appareil photo</> : <><Camera /> Scanner avec l&apos;appareil photo</>}
      </Button>
      {open ? <video ref={video} playsInline muted className="aspect-video w-full rounded-md border bg-black object-cover" /> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
