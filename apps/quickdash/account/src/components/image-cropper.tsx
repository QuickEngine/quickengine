import { ICE } from "@quickengine/ui";
import { useEffect, useRef, useState } from "react";

/**
 * Crop and resize a picture in the browser, before it is ever uploaded.
 *
 * ── Why it happens here and not on the server ────────────────────────────────
 *
 * 🔑 An avatar is square and a banner is 3:1, and a photograph is neither. Left
 * to the CSS, `object-fit: cover` picks the middle of the image and is wrong
 * almost every time a face is involved. Somebody has to choose the crop, and the
 * only person who can is the one looking at it.
 *
 * ⚠️ Resizing here also means a 6 MB camera original never crosses the network:
 * the upload is the FINAL 512px square or 1500x500 banner, typically under
 * 200 KB. The server needs no image library, no resize queue, and no way to be
 * handed a decompression bomb — it stores what it is given because what it is
 * given is already the right size.
 *
 * ── The one piece of real maths ──────────────────────────────────────────────
 *
 * 🔴 The preview and the canvas MUST agree exactly, or what somebody framed is
 * not what gets saved. Both derive from the same three numbers — a `cover` base
 * scale, a zoom multiplier, and an offset in viewport pixels — and the canvas
 * simply multiplies all of them by `output / viewport`. Nothing is measured
 * twice and nothing is rounded on one side only.
 */

export type CropShape = "circle" | "banner";

const OUTPUT: Record<CropShape, { width: number; height: number }> = {
	// 512 rather than 256: it is what a retina display asks for at the size an
	// avatar is actually rendered, and it stays under 100 KB as a JPEG.
	circle: { width: 512, height: 512 },
	banner: { width: 1500, height: 500 },
};

/** How wide the framing viewport is drawn, in CSS pixels. */
const VIEW_WIDTH = 384;

export function ImageCropper({
	file,
	shape,
	onCancel,
	onCropped,
	busy = false,
}: {
	file: File;
	shape: CropShape;
	onCancel: () => void;
	onCropped: (blob: Blob) => void;
	busy?: boolean;
}) {
	const output = OUTPUT[shape];
	const viewWidth = VIEW_WIDTH;
	const viewHeight = Math.round((viewWidth * output.height) / output.width);

	const [image, setImage] = useState<HTMLImageElement | null>(null);
	const [zoom, setZoom] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const drag = useRef<{ x: number; y: number } | null>(null);

	/**
	 * ⚠️ The object URL is revoked when the file changes or the cropper closes.
	 * Without it every re-crop leaks the decoded bitmap for the life of the tab,
	 * which on a phone is how a page gets killed for memory.
	 */
	useEffect(() => {
		const url = URL.createObjectURL(file);
		const element = new Image();
		element.onload = () => setImage(element);
		element.src = url;
		return () => {
			URL.revokeObjectURL(url);
		};
	}, [file]);

	// A fresh picture starts centred and unzoomed, whatever the last one was left at.
	useEffect(() => {
		setZoom(1);
		setOffset({ x: 0, y: 0 });
	}, []);

	if (!image) {
		return (
			<div
				style={{ width: viewWidth, height: viewHeight }}
				className="animate-pulse rounded-xl bg-white/[0.04]"
			/>
		);
	}

	// `cover`: the smallest scale at which the picture still fills the frame.
	const base = Math.max(
		viewWidth / image.naturalWidth,
		viewHeight / image.naturalHeight,
	);
	const drawWidth = image.naturalWidth * base * zoom;
	const drawHeight = image.naturalHeight * base * zoom;

	/**
	 * 🔴 Clamped so the frame can never show empty space. Without this, dragging
	 * far enough exposes the background and the exported crop has a transparent
	 * band down one side — which only becomes visible once it is already saved.
	 */
	const limitX = Math.max(0, (drawWidth - viewWidth) / 2);
	const limitY = Math.max(0, (drawHeight - viewHeight) / 2);
	const clamp = (value: number, limit: number) =>
		Math.min(limit, Math.max(-limit, value));
	const x = clamp(offset.x, limitX);
	const y = clamp(offset.y, limitY);

	const left = viewWidth / 2 - drawWidth / 2 + x;
	const top = viewHeight / 2 - drawHeight / 2 + y;

	const move = (event: React.PointerEvent) => {
		if (!drag.current) return;
		setOffset({
			x: clamp(x + event.clientX - drag.current.x, limitX),
			y: clamp(y + event.clientY - drag.current.y, limitY),
		});
		drag.current = { x: event.clientX, y: event.clientY };
	};

	const confirm = () => {
		const canvas = document.createElement("canvas");
		canvas.width = output.width;
		canvas.height = output.height;
		const context = canvas.getContext("2d");
		if (!context) return;

		// The single ratio that carries the preview's framing onto the canvas.
		const ratio = output.width / viewWidth;
		context.drawImage(
			image,
			left * ratio,
			top * ratio,
			drawWidth * ratio,
			drawHeight * ratio,
		);

		// JPEG, not PNG: these are photographs, and a 512px PNG of a face is
		// roughly eight times the bytes for no visible difference.
		canvas.toBlob(
			(blob) => {
				if (blob) onCropped(blob);
			},
			"image/jpeg",
			0.9,
		);
	};

	return (
		<div className="flex flex-col items-center gap-4">
			<div
				style={{ width: viewWidth, height: viewHeight }}
				onPointerDown={(event) => {
					drag.current = { x: event.clientX, y: event.clientY };
					event.currentTarget.setPointerCapture(event.pointerId);
				}}
				onPointerMove={move}
				onPointerUp={() => {
					drag.current = null;
				}}
				className={`relative touch-none overflow-hidden bg-black/40 ${
					shape === "circle" ? "rounded-full" : "rounded-xl"
				} cursor-grab active:cursor-grabbing`}
			>
				<img
					alt=""
					src={image.src}
					draggable={false}
					style={{
						position: "absolute",
						left,
						top,
						width: drawWidth,
						height: drawHeight,
						maxWidth: "none",
					}}
				/>
			</div>

			<label className="flex w-full max-w-[24rem] items-center gap-3">
				<span className="font-body font-light text-[0.75rem] text-white/35">
					Zoom
				</span>
				<input
					type="range"
					min={1}
					max={4}
					step={0.01}
					value={zoom}
					onChange={(event) => setZoom(Number(event.target.value))}
					style={{ accentColor: ICE }}
					className="h-1 flex-1 cursor-pointer"
				/>
			</label>

			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onCancel}
					className="inline-flex h-9 items-center rounded-full px-4 font-body font-light text-[0.875rem] text-white/45 transition-colors duration-200 hover:text-white"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={confirm}
					disabled={busy}
					style={{ backgroundColor: ICE, color: "#000000" }}
					className="inline-flex h-9 items-center rounded-full px-4 font-body font-normal text-[0.875rem] transition-opacity duration-300 hover:opacity-85 disabled:opacity-30"
				>
					{busy ? "Saving…" : "Use this"}
				</button>
			</div>
		</div>
	);
}
