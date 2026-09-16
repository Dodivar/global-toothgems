import { Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CartProvider } from "./lib/cart";
import { ToastProvider } from "./lib/toast";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { Home } from "./pages/Home";
import { Shop } from "./pages/Shop";
import { ProductDetail } from "./pages/ProductDetail";
import { Cart } from "./pages/Cart";
import { Academy } from "./pages/Academy";
import { Lesson } from "./pages/Lesson";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Keeps <html lang> in step with the UI language for screen readers and search engines. */
function DocumentLanguage() {
  const { i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18n.language.slice(0, 2);
  }, [i18n.language]);
  return null;
}

export default function App() {
  const { t } = useTranslation();

  return (
    <CartProvider>
      <ToastProvider>
        <ScrollToTop />
        <DocumentLanguage />
        <a href="#main" className="gt-skip-link">
          {t("common.skipToContent")}
        </a>
        <Header />
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/boutique" element={<Shop />} />
            <Route path="/boutique/:id" element={<ProductDetail />} />
            <Route path="/panier" element={<Cart />} />
            <Route path="/academy" element={<Academy />} />
            <Route path="/academy/lecon" element={<Lesson />} />
          </Routes>
        </main>
        <Footer />
      </ToastProvider>
    </CartProvider>
  );
}
