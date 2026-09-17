import { useTranslation } from "react-i18next";
import { Images, MessagesSquare, Sparkles, Users } from "lucide-react";
import { StatTile } from "../account/StatTile";
import { COMMUNITY_STATS } from "../../data/community";
import { formatCount } from "../../lib/format";

/**
 * The community in four figures.
 *
 * The member dashboard's `StatTile`, reused rather than restyled: the community
 * is part of the member area, and the two screens counting things in different
 * shapes would be the first crack in that. They are indicators, not analytics —
 * no trend, no comparison, no chart.
 */
export function CommunityStats() {
  const { t } = useTranslation();

  return (
    <dl aria-label={t("community.statsLabel")} className="m-0 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatTile value={formatCount(COMMUNITY_STATS.artists)} label={t("community.statArtists")} icon={Users} />
      <StatTile
        value={formatCount(COMMUNITY_STATS.discussions)}
        label={t("community.statDiscussions")}
        icon={MessagesSquare}
      />
      <StatTile value={formatCount(COMMUNITY_STATS.creations)} label={t("community.statCreations")} icon={Images} />
      <StatTile
        value={formatCount(COMMUNITY_STATS.activeThisWeek)}
        label={t("community.statActive")}
        icon={Sparkles}
      />
    </dl>
  );
}
