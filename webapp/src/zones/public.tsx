"use client";

import type { ReactNode } from "react";
import { AppShell } from "../AppShell";
import { useHydrated } from "../lib/useHydrated";
import { HomeAlt } from "../screens/HomeAlt";
import { ShopAlt } from "../screens/ShopAlt";
import { Shapes } from "../screens/Shapes";
import { Colors } from "../screens/Colors";
import { ProductDetail } from "../screens/ProductDetail";
import { Cart } from "../screens/Cart";
import { CheckoutReturn } from "../screens/CheckoutReturn";
import { Academy } from "../screens/Academy";
import { CourseDetail } from "../screens/CourseDetail";
import { Login } from "../screens/Login";
import { ConfirmAccount } from "../screens/ConfirmAccount";
import { Register } from "../screens/Register";
import { ForgotPassword } from "../screens/ForgotPassword";
import { ResetPassword } from "../screens/ResetPassword";
import { VerifyEmailLanding } from "../screens/VerifyEmailLanding";
import { Loyalty } from "../screens/Loyalty";
import { GiftCard } from "../screens/GiftCard";
import { Studio } from "../screens/Studio";
import { StudioSubscribe } from "../screens/StudioSubscribe";
import { ServerError } from "../screens/ServerError";
import { Maintenance } from "../screens/Maintenance";
import { NotFound } from "../screens/NotFound";
import { HelpCentre } from "../screens/legal/HelpCentre";
import { Faq } from "../screens/legal/Faq";
import { Contact } from "../screens/legal/Contact";
import { About } from "../screens/legal/About";
import { LegalDocumentPage } from "../components/legal/LegalDocumentPage";
import { LEGAL_NOTICE } from "../data/legal/legalNotice";
import { TERMS } from "../data/legal/terms";
import { PRIVACY } from "../data/legal/privacy";
import { COOKIE_POLICY } from "../data/legal/cookies";
import { SHIPPING } from "../data/legal/shipping";
import { RETURNS } from "../data/legal/returns";

/*
 * The public zone's screens (`app/(public)`, docs/migration-nextjs.md phase
 * 5): storefront, public pages, sign-in, registration and recovery, system
 * pages, behind the client boundary their segments render.
 */

/** The storefront's chrome — header, footer, cookie banner — rendered on the server with the page. */
export function PublicChrome({ children }: { children: ReactNode }) {
  return <AppShell zone="public">{children}</AppShell>;
}

/**
 * A screen rendered in the browser only, as it always was: it reads
 * `window`, `document` or `localStorage` from its first render (sign-in,
 * registration, recovery, system pages). The page's chrome is on the server.
 */
function BrowserOnly({ children }: { children: ReactNode }) {
  return useHydrated() ? children : null;
}

/* The screen of each public page (`lib/localeRoutes.ts`), rendered on the server and hydrated. */
export const HomeScreen = () => <HomeAlt />;
export const ShopScreen = () => <ShopAlt />;
export const ProductScreen = () => <ProductDetail />;
export const ShapesScreen = () => <Shapes />;
export const ColoursScreen = () => <Colors />;
export const CartScreen = () => <Cart />;
export const CheckoutReturnScreen = () => <CheckoutReturn />;
export const LoyaltyScreen = () => <Loyalty />;
export const GiftCardScreen = () => <GiftCard />;
export const StudioScreen = () => <Studio />;
export const StudioSubscribeScreen = () => <StudioSubscribe />;
export const AcademyScreen = () => <Academy />;
export const CourseScreen = () => <CourseDetail />;
export const HelpScreen = () => <HelpCentre />;
export const FaqScreen = () => <Faq />;
export const ContactScreen = () => <Contact />;
export const AboutScreen = () => <About />;
export const LegalNoticeScreen = () => <LegalDocumentPage doc={LEGAL_NOTICE} />;
export const TermsScreen = () => <LegalDocumentPage doc={TERMS} />;
export const PrivacyScreen = () => <LegalDocumentPage doc={PRIVACY} />;
export const CookiesScreen = () => <LegalDocumentPage doc={COOKIE_POLICY} />;
export const ShippingScreen = () => <LegalDocumentPage doc={SHIPPING} />;
export const ReturnsScreen = () => <LegalDocumentPage doc={RETURNS} />;

export function LoginScreen() {
  return (
    <BrowserOnly>
      <Login />
    </BrowserOnly>
  );
}
/* Account creation, as its own multi-step journey: the reason the visitor
   came (a purchase, a training) travels in the query string or in the state
   handed to the page, so the flow can keep it in view and finish on it. */
export function RegisterScreen() {
  return (
    <BrowserOnly>
      <Register />
    </BrowserOnly>
  );
}
/* Account recovery and e-mail verification: reached from an e-mail, often
   signed out. The English addresses show the same screens. */
export function ForgotPasswordScreen() {
  return (
    <BrowserOnly>
      <ForgotPassword />
    </BrowserOnly>
  );
}
export function ResetPasswordScreen() {
  return (
    <BrowserOnly>
      <ResetPassword />
    </BrowserOnly>
  );
}
export function VerifyEmailScreen() {
  return (
    <BrowserOnly>
      <VerifyEmailLanding />
    </BrowserOnly>
  );
}
/* Where the account-confirmation e-mail lands (through `/auth/confirm`). */
export function ConfirmAccountScreen() {
  return (
    <BrowserOnly>
      <ConfirmAccount />
    </BrowserOnly>
  );
}
/* System pages: their own addresses so they can be reviewed; `error.tsx`
   shows the server-error screen in place of a page that failed. */
export function ServerErrorScreen() {
  return (
    <BrowserOnly>
      <ServerError />
    </BrowserOnly>
  );
}
export function MaintenanceScreen() {
  return (
    <BrowserOnly>
      <Maintenance />
    </BrowserOnly>
  );
}
export function NotFoundScreen() {
  return (
    <BrowserOnly>
      <NotFound />
    </BrowserOnly>
  );
}
