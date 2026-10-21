"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Eraser, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number };

export function SignaturePad({ name, label, disabled }: { name: string; label: string; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Point[][]>([]);
  const currentStrokeRef = useRef<Point[] | null>(null);
  const [value, setValue] = useState("");

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.strokeStyle = "#163b35";
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      context.beginPath();
      context.moveTo(stroke[0].x * rect.width, stroke[0].y * rect.height);
      for (const point of stroke.slice(1)) context.lineTo(point.x * rect.width, point.y * rect.height);
      context.stroke();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [draw]);

  function normalizedPoint(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke = [normalizedPoint(event)];
    strokesRef.current.push(stroke);
    currentStrokeRef.current = stroke;
    draw();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!currentStrokeRef.current || disabled) return;
    currentStrokeRef.current.push(normalizedPoint(event));
    draw();
  }

  function finishSignature() {
    if (!currentStrokeRef.current) return;
    currentStrokeRef.current = null;
    const canvas = canvasRef.current;
    if (canvas && strokesRef.current.length > 0) setValue(canvas.toDataURL("image/png"));
  }

  function clear() {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    setValue("");
    draw();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium"><PenLine className="h-4 w-4" />{label}</span>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled || !value}>
          <Eraser /> Effacer
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        className={cn("h-36 w-full touch-none rounded-md border bg-white shadow-inner", disabled && "cursor-not-allowed opacity-60")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishSignature}
        onPointerCancel={finishSignature}
        aria-label={`Zone de signature ${label}`}
      />
      <input type="hidden" name={name} value={value} />
      <p className="text-xs text-muted-foreground">Signature manuscrite recue sur place et horodatée avec le bordereau.</p>
    </div>
  );
}
