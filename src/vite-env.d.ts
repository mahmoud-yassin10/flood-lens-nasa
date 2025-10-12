/// <reference types="vite/client" />

declare global {
  interface Window {
    __BASE_URL__?: string;
    __MAP__?: import("leaflet").Map;
  }
}

export {};
