import { Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AuthProvider, RequireAccount } from "./lib/auth";
import { CartProvider } from "./lib/cart";
import { OrdersProvider } from "./lib/orders";
import { ProgressProvider } from "./lib/progress";
import { ToastProvider } from "./lib/toast";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { Home } from "./pages/Home";
import { Shop } from "./pages/Shop";
import { Shapes } from "./pages/Shapes";
import { Colors } from "./pages/Colors";
import { ProductDetail } from "./pages/ProductDetail";
import { Cart } from "./pages/Cart";
import { Academy } from "./pages/Academy";
import { Lesson } from "./pages/Lesson";
import { Login } from "./pages/Login";
import { AccountLayout } from "./pages/account/AccountLayout";
import { Dashboard } from "./pages/account/Dashboard";
import { Certificates } from "./pages/account/Certificates";
import { Orders } from "./pages/account/Orders";
import { Profile } from "./pages/account/Profile";

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
    <AuthProvider>
      {/* Learning progress and orders sit above the cart: paying turns the cart
          into an order, and both histories feed the member dashboard. */}
      <ProgressProvider>
        <OrdersProvider>
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
                  {/* Top level, not /boutique/formes: a static child of /boutique
                      would permanently shadow a product with that id. */}
                  <Route path="/formes" element={<Shapes />} />
                  <Route path="/couleurs" element={<Colors />} />
                  <Route path="/panier" element={<Cart />} />
                  <Route path="/connexion" element={<Login />} />
                  {/* The Academy landing page stays open — it is the sales page.
                      Only the course content itself requires an account, and gating
                      the route covers the menu links and direct URLs at once. */}
                  <Route path="/academy" element={<Academy />} />
                  <Route
                    path="/academy/lecon"
                    element={
                      <RequireAccount>
                        <Lesson />
                      </RequireAccount>
                    }
                  />
                  {/* The member dashboard: a sidebar layout with one route per
                      section. Gating the layout covers every child, for the same
                      reason the lesson is gated — this is the account itself. */}
                  <Route
                    path="/compte"
                    element={
                      <RequireAccount>
                        <AccountLayout />
                      </RequireAccount>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="attestations" element={<Certificates />} />
                    <Route path="commandes" element={<Orders />} />
                    <Route path="profil" element={<Profile />} />
                  </Route>
                </Routes>
              </main>
              <Footer />
            </ToastProvider>
          </CartProvider>
        </OrdersProvider>
      </ProgressProvider>
    </AuthProvider>
  );
}
