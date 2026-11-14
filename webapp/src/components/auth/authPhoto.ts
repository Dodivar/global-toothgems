import { preload } from "react-dom";
import { photo } from "../../lib/images";

/** The photograph of the authentication pages' editorial column. */
export const AUTH_PHOTO = "mouth-02.webp";

/**
 * Asks the browser for the photograph with the page's HTML. The sign-in and
 * registration screens render in the browser only, so without this the image
 * request waited for the JavaScript. Called from the route's server page.
 */
export function preloadAuthPhoto() {
  preload(photo(AUTH_PHOTO), { as: "image", fetchPriority: "high" });
}
