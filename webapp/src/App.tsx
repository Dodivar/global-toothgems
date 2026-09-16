import { Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
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

export default function App() {
  return (
    <CartProvider>
      <ToastProvider>
        <ScrollToTop />
        <Header />
        <main>
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
