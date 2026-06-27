export default function GoogleMapView({
  center = [22.4, 72.5],
  zoom = 8,
  height,
  markers = [],
}) {
  const indiaEmbed =
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d30773484.55170563!2d61.0245165611659!3d19.69009515037612!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x30635ff06b92b791%3A0xd78c4fa1854213a6!2sIndia!5e0!3m2!1sen!2sin!4v1781959490463!5m2!1sen!2sin";

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl"
      style={{ aspectRatio: "16 / 9", maxHeight: height || 480 }}
    >
      <iframe
        title="Google Maps — India"
        src={indiaEmbed}
        className="absolute inset-0 h-full w-full"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      {markers.length > 0 && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-soft backdrop-blur md:right-3 md:top-3">
          {markers.length} user{markers.length !== 1 ? "s" : ""} on map
        </div>
      )}
    </div>
  );
}
