import { Mail } from "lucide-react";
import type { ShareNetwork } from "../../lib/certificate/share";

/**
 * Simplified marks of the networks a certificate can be posted to, drawn in
 * the current colour so they sit with the line icons around them (the icon set
 * carries no brand marks). Decorative: every button also names the network.
 */
export function NetworkIcon({ network, size = 18 }: { network: ShareNetwork; size?: number }) {
  if (network === "email") return <Mail size={size} aria-hidden="true" />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {network === "linkedin" && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="3.5" />
          <path d="M8 10.5V16.5M8 7.6V7.7M11.5 16.5V10.5M11.5 13.2C11.5 11.6 12.6 10.4 14 10.4S16.4 11.4 16.4 13V16.5" />
        </>
      )}
      {network === "instagram" && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <path d="M17.2 6.8V6.9" />
        </>
      )}
      {network === "facebook" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M13.2 21V12.4C13.2 10.4 13.9 9.4 15.8 9.4H16.4M10.4 13.4H15.6" />
        </>
      )}
      {network === "x" && <path d="M4.5 4.5L19.5 19.5M19.5 4.5L4.5 19.5" />}
    </svg>
  );
}
