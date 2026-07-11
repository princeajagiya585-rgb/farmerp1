import { useEffect, useRef, useState } from "react";
import { Camera, X, RefreshCw, Check, SwitchCamera } from "lucide-react";
import { Button } from "./ui";

/**
 * Reusable camera capture modal.
 *
 * Works on BOTH a laptop/desktop webcam and a phone camera via
 * navigator.mediaDevices.getUserMedia — this is the only way to reach the
 * laptop camera (the HTML `capture` attribute is ignored on desktop).
 *
 * Requires a secure context (HTTPS or localhost); the live site is served
 * over HTTPS on Vercel, so the browser will prompt for camera permission.
 *
 * Props:
 *   open       — whether the modal is shown
 *   onClose    — called when the user closes/cancels
 *   onCapture  — called with a File (image/jpeg) when the user accepts a photo
 *   title      — optional heading text
 */
export default function CameraCapture({ open, onClose, onCapture, title = "Take Photo" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [facing, setFacing] = useState("environment"); // rear camera by default
  const [snapshot, setSnapshot] = useState(null); // { url, blob }

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Start (or restart when the camera is flipped) the live preview.
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setError("");
    setSnapshot(null);

    (async () => {
      setStarting(true);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error("unsupported"), { name: "NotSupportedError" });
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        if (!active) return;
        const name = err?.name;
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera permission was blocked. Please allow camera access for this site in your browser settings, then try again."
            : name === "NotFoundError" || name === "DevicesNotFoundError"
              ? "No camera was found on this device. You can still choose a file instead."
              : name === "NotSupportedError"
                ? "This browser can't open the camera here. Please use HTTPS or choose a file instead."
                : "Unable to open the camera. Please try again or choose a file instead.",
        );
      } finally {
        if (active) setStarting(false);
      }
    })();

    return () => {
      active = false;
      stopStream();
    };
  }, [open, facing]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setSnapshot({ url: URL.createObjectURL(blob), blob });
      },
      "image/jpeg",
      0.9,
    );
  };

  const handleRetake = () => {
    if (snapshot) URL.revokeObjectURL(snapshot.url);
    setSnapshot(null);
  };

  const handleUse = () => {
    if (!snapshot) return;
    const file = new File([snapshot.blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    URL.revokeObjectURL(snapshot.url);
    stopStream();
    onCapture(file);
    onClose();
  };

  const handleClose = () => {
    if (snapshot) URL.revokeObjectURL(snapshot.url);
    stopStream();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="flex items-center gap-2 font-semibold text-gray-800">
            <Camera size={18} /> {title}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-[240px] items-center justify-center bg-black">
          {error ? (
            <p className="p-6 text-center text-sm text-red-100">{error}</p>
          ) : snapshot ? (
            <img src={snapshot.url} alt="Captured" className="max-h-[60vh] w-full object-contain" />
          ) : (
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className="max-h-[60vh] w-full object-contain"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4">
          {snapshot ? (
            <>
              <Button type="button" variant="secondary" onClick={handleRetake} className="flex items-center gap-1.5">
                <RefreshCw size={16} /> Retake
              </Button>
              <Button type="button" onClick={handleUse} className="flex items-center gap-1.5">
                <Check size={16} /> Use Photo
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                disabled={!!error}
                className="flex items-center gap-1.5"
                title="Switch front/back camera"
              >
                <SwitchCamera size={16} /> Flip
              </Button>
              <Button
                type="button"
                onClick={handleCapture}
                disabled={!!error || starting}
                className="flex items-center gap-1.5"
              >
                <Camera size={16} /> {starting ? "Starting…" : "Capture"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
