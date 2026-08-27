import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";

interface Coordinates {
  latitude: number;
  longitude: number;
}

function MapInteraction({ coordinates, onPick }: { coordinates: Coordinates | null; onPick: (coordinates: Coordinates) => void }) {
  const map = useMap();
  useMapEvents({
    click(event) {
      onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });

  useEffect(() => {
    if (coordinates) map.flyTo([coordinates.latitude, coordinates.longitude], Math.max(map.getZoom(), 15), { duration: 0.45 });
  }, [coordinates, map]);

  return coordinates ? (
    <CircleMarker center={[coordinates.latitude, coordinates.longitude]} radius={10} pathOptions={{ color: "#111111", weight: 4, fillColor: "#d9ff00", fillOpacity: 1 }} />
  ) : null;
}

export function EventLocationMap({ coordinates, onPick }: { coordinates: Coordinates | null; onPick: (coordinates: Coordinates) => void }) {
  const center: [number, number] = coordinates
    ? [coordinates.latitude, coordinates.longitude]
    : [11.5564, 104.9282];

  return (
    <MapContainer center={center} zoom={coordinates ? 15 : 12} scrollWheelZoom className="h-full w-full" zoomControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapInteraction coordinates={coordinates} onPick={onPick} />
    </MapContainer>
  );
}
