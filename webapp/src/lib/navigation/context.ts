import { createContext, useContext } from "react";
import { nextBackend } from "./nextBackend";
import type { NavigationBackend } from "./types";

/*
 * Which implementation of the navigation API a place in the tree uses
 * (`index.ts`): the Next.js router by default, React Router under a zone app
 * (`AppRoot`). A given place always gets the same one, so the hooks it calls
 * keep a stable order.
 */
export const BackendContext = createContext<NavigationBackend>(nextBackend);

export const useBackend = () => useContext(BackendContext);
