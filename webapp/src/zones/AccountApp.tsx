import { Routes, Route } from "react-router-dom";
import { RequireAccount } from "../lib/auth";
import { MemberShell } from "../components/layout/MemberShell";
import { AccountLayout } from "../screens/account/AccountLayout";
import { Dashboard } from "../screens/account/Dashboard";
import { Certificates } from "../screens/account/Certificates";
import { Orders } from "../screens/account/Orders";
import { Profile } from "../screens/account/Profile";
import { Security } from "../screens/account/Security";
import { Reviews as AccountReviews } from "../screens/account/Reviews";
import { Loyalty as AccountLoyalty } from "../screens/account/Loyalty";
import { CommunityLayout } from "../screens/community/CommunityLayout";
import { CommunityHome } from "../screens/community/CommunityHome";
import { Channel } from "../screens/community/Channel";
import { Discussion } from "../screens/community/Discussion";
import { Members } from "../screens/community/Members";
import { Guidelines } from "../screens/community/Guidelines";
import { Activity } from "../screens/community/Activity";
import { NotFound } from "../screens/NotFound";
import { AppShell } from "../AppShell";
import { BrowserRoot } from "../AppRoot";
import { ZoneExit } from "./ZoneExit";

/**
 * The account zone (`lib/appZones.ts`): the member space and the Artist
 * Community under `/compte`, mounted by `app/compte/[[...slug]]` in the
 * browser only, under a layout that turns signed-out visitors away on the
 * server. Any other address reloads the page into its own zone.
 */
export default function AccountApp() {
  return (
    <BrowserRoot>
      <AppShell zone="account">
        <Routes>
          {/* The member space: the dashboard and the Artist
              Community share one shell — a full-height sidebar
              with the member's sections and the way out to the
              shop, the Academy and the Studio — in place of the
              storefront header. Gating the shell covers every
              child: this is the account itself. */}
          <Route
            element={
              <RequireAccount>
                <MemberShell />
              </RequireAccount>
            }
          >
            <Route path="/compte" element={<AccountLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="attestations" element={<Certificates />} />
              <Route path="commandes" element={<Orders />} />
              <Route path="profil" element={<Profile />} />
              <Route path="securite" element={<Security />} />
              <Route path="fidelite" element={<AccountLoyalty />} />
              <Route path="avis" element={<AccountReviews />} />
              {/* An unknown address in the member space is a 404
                  inside its shell: the storefront header is not
                  there to lead back out. */}
              <Route path="*" element={<NotFound />} />
            </Route>
            {/* The Artist Community. A sibling of `/compte` rather
                than one of its children: it has its own layout and
                its channels. Whether the account may enter it is
                decided inside that layout, from the courses it owns. */}
            <Route path="/compte/communaute" element={<CommunityLayout />}>
              <Route index element={<CommunityHome />} />
              <Route path="canal/:channelId" element={<Channel />} />
              <Route path="discussion/:discussionId" element={<Discussion />} />
              <Route path="activite/:view" element={<Activity />} />
              <Route path="membres" element={<Members />} />
              <Route path="charte" element={<Guidelines />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
          <Route path="*" element={<ZoneExit zone="account" />} />
        </Routes>
      </AppShell>
    </BrowserRoot>
  );
}
