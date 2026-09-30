"use client";

import dynamic from "next/dynamic";

/* Each zone's React Router app (`src/zones/`), rendered in the browser only:
   these screens read `window`, `document` and `localStorage` from their first
   render. One chunk per zone, so a page downloads only its own zone's code. */
export const AccountZone = dynamic(() => import("../../src/zones/AccountApp"), { ssr: false });
export const AdminZone = dynamic(() => import("../../src/zones/AdminApp"), { ssr: false });
