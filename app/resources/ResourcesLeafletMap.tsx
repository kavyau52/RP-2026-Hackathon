"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";

interface NearbyPlace {
  name: string;
  address?: string;
  distanceKm: number;
  lat: number;
  lon: number;
}

interface MapPoint {
  lat: number;
  lon: number;
}

interface ResourcesLeafletMapProps {
  activeIcon: string;
  center: MapPoint;
  initialZoom: number;
  loading: boolean;
  places: NearbyPlace[];
  selectedPlace: NearbyPlace | null;
  userLocation: MapPoint | null;
  onSelectPlace: (place: NearbyPlace) => void;
}

function formatDistance(distanceKm: number) {
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)} m away`
    : `${distanceKm.toFixed(1)} km away`;
}

function placeKey(place: NearbyPlace) {
  return `${place.name}-${place.lat}-${place.lon}`;
}

function popupHtml(place: NearbyPlace) {
  const address = place.address ? `<span>${place.address}</span>` : "";
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`;

  return `
    <div class="resource-map-popup">
      <strong>${place.name}</strong>
      ${address}
      <span>${formatDistance(place.distanceKm)}</span>
      <a href="${directionsUrl}" rel="noopener noreferrer" target="_blank">Directions</a>
    </div>
  `;
}

function createPlaceIcon(L: typeof Leaflet, index: number, selected: boolean) {
  return L.divIcon({
    className: selected ? "resource-map-pin is-selected" : "resource-map-pin",
    html: `<span><b>${index + 1}</b></span>`,
    iconAnchor: [16, 34],
    iconSize: [32, 36],
    popupAnchor: [0, -34],
  });
}

function createUserIcon(L: typeof Leaflet) {
  return L.divIcon({
    className: "resource-map-user-pin",
    html: "<span></span>",
    iconAnchor: [11, 11],
    iconSize: [22, 22],
  });
}

export default function ResourcesLeafletMap({
  activeIcon,
  center,
  initialZoom,
  loading,
  places,
  selectedPlace,
  userLocation,
  onSelectPlace,
}: ResourcesLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markersRef = useRef<Leaflet.LayerGroup | null>(null);
  const onSelectPlaceRef = useRef(onSelectPlace);
  const [mapReady, setMapReady] = useState(false);

  onSelectPlaceRef.current = onSelectPlace;

  useEffect(() => {
    let disposed = false;

    async function loadMap() {
      const leafletModule = await import("leaflet");
      const L = (leafletModule.default ?? leafletModule) as typeof Leaflet;

      if (disposed || !containerRef.current || mapRef.current) return;

      leafletRef.current = L;
      const map = L.map(containerRef.current, {
        scrollWheelZoom: true,
      }).setView([center.lat, center.lon], initialZoom);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      markersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
      window.setTimeout(() => map.invalidateSize(), 0);
    }

    loadMap();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!L || !map || !markers) return;

    markers.clearLayers();

    if (userLocation) {
      L.marker([userLocation.lat, userLocation.lon], {
        icon: createUserIcon(L),
        title: "Your location",
      }).addTo(markers);
    }

    const selectedKey = selectedPlace ? placeKey(selectedPlace) : null;
    places.forEach((place, index) => {
      const marker = L.marker([place.lat, place.lon], {
        icon: createPlaceIcon(L, index, placeKey(place) === selectedKey),
        title: place.name,
      })
        .bindPopup(popupHtml(place))
        .on("click", () => onSelectPlaceRef.current(place));

      marker.addTo(markers);
    });

    const points: Leaflet.LatLngExpression[] = [
      ...(userLocation ? ([[userLocation.lat, userLocation.lon]] as Leaflet.LatLngExpression[]) : []),
      ...places.map((place) => [place.lat, place.lon] as Leaflet.LatLngExpression),
    ];

    if (selectedPlace) {
      map.flyTo([selectedPlace.lat, selectedPlace.lon], Math.max(map.getZoom(), 15), {
        duration: 0.45,
      });
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { maxZoom: 15, padding: [42, 42] });
    } else {
      map.setView([center.lat, center.lon], initialZoom);
    }
  }, [center, initialZoom, places, selectedPlace, userLocation, mapReady]);

  return (
    <div className="resource-map">
      <div ref={containerRef} className="resource-map__leaflet" />
      {!mapReady && (
        <div className="resource-map__loading">
          <span className="spinner" /> Loading map...
        </div>
      )}
      {loading && mapReady && (
        <div className="resource-map__loading">
          <span className="spinner" /> Updating map...
        </div>
      )}
      {places.length === 0 && !loading && mapReady && (
        <div className="resource-map__empty" aria-hidden="true">
          <span>{activeIcon}</span>
        </div>
      )}
    </div>
  );
}
