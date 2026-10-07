/**
 * Carriers the team ships with, and the public tracking page of a parcel.
 *
 * The shipping e-mail links to `shipments.tracking_url`; a guest's parcel
 * without one is not announced (there is no account page to link to), so the
 * parcel form proposes the carrier's page from the tracking number. It is only
 * a suggestion: the team can edit it, and any carrier can be typed by hand.
 * The database accepts https addresses only.
 */

export interface Carrier {
  /** Stored as `shipments.carrier`. */
  name: string;
  /** Public tracking page, `{number}` replaced by the URL-encoded tracking number. */
  trackingUrl: string;
}

export const CARRIERS: readonly Carrier[] = [
  { name: "Colissimo", trackingUrl: "https://www.laposte.fr/outils/suivre-vos-envois?code={number}" },
  { name: "Chronopost", trackingUrl: "https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT={number}" },
  { name: "Mondial Relay", trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition={number}" },
  { name: "DHL", trackingUrl: "https://www.dhl.com/fr-fr/home/tracking.html?tracking-id={number}" },
  { name: "UPS", trackingUrl: "https://www.ups.com/track?tracknum={number}" },
  { name: "FedEx", trackingUrl: "https://www.fedex.com/fedextrack/?trknbr={number}" },
  { name: "GLS", trackingUrl: "https://gls-group.com/FR/fr/suivi-colis?match={number}" },
];

/** The suggested tracking page for a known carrier and a tracking number; "" otherwise. */
export function suggestedTrackingUrl(carrier: string, trackingNumber: string): string {
  const number = trackingNumber.trim();
  const known = CARRIERS.find((c) => c.name.toLowerCase() === carrier.trim().toLowerCase());
  if (!known || number.length < 3) return "";
  return known.trackingUrl.replace("{number}", encodeURIComponent(number));
}

/** What the database accepts for `tracking_url`: an https address, or nothing. */
export function isTrackingUrl(value: string): boolean {
  const url = value.trim();
  if (url === "") return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
