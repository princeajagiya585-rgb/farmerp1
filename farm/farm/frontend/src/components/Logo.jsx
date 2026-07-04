// Brand logo for FarmERP Pro — uses the new logo image.
// eslint-disable-next-line no-unused-vars
import logoUrl from "/logo.png";

export function LogoMark({ size = 40, light = false }) {
  // Use a larger source image so it stays sharp on high-DPI screens
  const src = "/icons/icon-128.png";
  return (
    <img
      src={src}
      alt="FarmERP Pro"
      width={size}
      height={size}
      className={`inline-block ${light ? "opacity-95 brightness-110 drop-shadow-sm" : ""}`}
    />
  );
}

export default function Logo({ size = 36, light = false, tagline = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} light={light} />
      <div className="leading-tight">
        <div className="flex items-center gap-1">
          <span className={`text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-gray-800"}`}>
            FarmERP
          </span>
          <span className="rounded-md bg-brand-500/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Pro
          </span>
        </div>
        {tagline && (
          <span className={`text-[11px] ${light ? "text-brand-100/80" : "text-gray-400"}`}>
            Smart Farm Management
          </span>
        )}
      </div>
    </div>
  );
}
