/**
 * The product list's filters, kept for the administrator's session.
 *
 * They live in the URL, which the edit screen leaves behind: going from one
 * product to the next through the list would otherwise start from scratch each
 * time. sessionStorage ends with the tab, which is what "this session" means
 * here, and it may be blocked or full, so a failure just means no memory.
 */
const KEY = "gt.admin.productFilters";

export function loadProductListFilters(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveProductListFilters(search: string): void {
  try {
    if (search) sessionStorage.setItem(KEY, search);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the filters simply do not outlive the page.
  }
}
