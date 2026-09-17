import type { Localized } from "./types";

/**
 * Mock content for the Artist Community.
 *
 * Same contract as every other file in `data/`: bilingual, static, and read
 * only. Nothing here is user data — the members, discussions and replies are
 * written fixtures, so the forum can be reviewed as a finished product before a
 * single row exists in a database.
 *
 * Two deliberate shapes:
 *
 *  - Ages are stored as `minutesAgo`, not as dates. A prototype that is opened
 *    again in three months must still read "2 h ago" rather than "3 months ago":
 *    a community whose latest post is a season old looks dead, which is exactly
 *    the opposite of what these screens are for.
 *  - A showcase post is a discussion like any other, with an image and a short
 *    body. The gallery is a presentation of the same object, so a creation can
 *    be opened, replied to and reacted to through the same code path as a
 *    question about adhesive.
 */

const img = (name: string) => new URL(`../assets/photos/${name}`, import.meta.url).href;

/* ------------------------------------------------------------------ badges */

/**
 * Community badges. Recognition, not a scoreboard: they say what someone brings
 * to the room, and none of them is ranked above another in the interface.
 */
export type BadgeId = "new" | "certified" | "top" | "gemLover" | "helper" | "team";

export const BADGE_ORDER: BadgeId[] = ["team", "certified", "top", "helper", "gemLover", "new"];

/* --------------------------------------------------------------- reactions */

export const REACTIONS = ["love", "sparkle", "gem"] as const;
export type ReactionId = (typeof REACTIONS)[number];
export type ReactionCounts = Partial<Record<ReactionId, number>>;

/** The glyph carried by each reaction. The label lives in the translations. */
export const REACTION_GLYPH: Record<ReactionId, string> = {
  love: "❤️",
  sparkle: "✨",
  gem: "💎",
};

/* ----------------------------------------------------------------- members */

/** Avatar tint. Deterministic per member, so a face is recognisable by colour. */
export type AvatarTone = "blue" | "fuchsia" | "emerald" | "ink";

export interface Member {
  id: string;
  name: string;
  /** City and country, shown as written. Optional: not everyone shares it. */
  location?: string;
  /** What the member does, in their own words. */
  role: Localized;
  /** Discussions and replies written, all channels combined. */
  contributions: number;
  badges: BadgeId[];
  /** ISO date the member joined the community. */
  joined: string;
  tone: AvatarTone;
  bio: Localized;
  /** Drives the "active this week" figure and the presence dot. */
  activeThisWeek?: boolean;
}

export const MEMBERS: Member[] = [
  {
    id: "lena",
    name: "Léna Marchand",
    location: "Lyon, FR",
    role: { fr: "Artiste tooth gem · Studio Lumen", en: "Tooth gem artist · Studio Lumen" },
    contributions: 214,
    badges: ["certified", "top"],
    joined: "2025-02-11",
    tone: "blue",
    bio: {
      fr: "Quatre ans de pose, une obsession pour les compositions asymétriques et beaucoup trop de pinces de précision.",
      en: "Four years of application, an obsession with asymmetric compositions and far too many precision tweezers.",
    },
    activeThisWeek: true,
  },
  {
    id: "ines",
    name: "Inès Bakker",
    location: "Amsterdam, NL",
    role: { fr: "Artiste certifiée · Formatrice indépendante", en: "Certified artist · Independent trainer" },
    contributions: 168,
    badges: ["certified", "helper"],
    joined: "2025-03-04",
    tone: "emerald",
    bio: {
      fr: "Je réponds surtout aux questions de préparation d’émail. Poser, c’est 20 % du travail.",
      en: "I mostly answer enamel-prep questions. Application is 20 % of the job.",
    },
    activeThisWeek: true,
  },
  {
    id: "noor",
    name: "Noor El Amrani",
    location: "Bruxelles, BE",
    role: { fr: "Artiste tooth gem · Salon mobile", en: "Tooth gem artist · Mobile studio" },
    contributions: 187,
    badges: ["certified", "top"],
    joined: "2025-01-22",
    tone: "fuchsia",
    bio: {
      fr: "Je travaille en salon mobile entre Bruxelles et Anvers. Spécialité : les sets complets sur mesure.",
      en: "I work out of a mobile studio between Brussels and Antwerp. My thing: full custom sets.",
    },
    activeThisWeek: true,
  },
  {
    id: "juno",
    name: "Juno Weber",
    location: "Berlin, DE",
    role: { fr: "Artiste certifiée", en: "Certified artist" },
    contributions: 143,
    badges: ["certified", "helper"],
    joined: "2025-04-18",
    tone: "ink",
    bio: {
      fr: "Ancienne prothésiste dentaire. Je parle beaucoup de colle, de mordançage et de retrait propre.",
      en: "Former dental technician. I talk a lot about adhesive, etching and clean removal.",
    },
    activeThisWeek: true,
  },
  {
    id: "elif",
    name: "Elif Yilmaz",
    location: "Vienne, AT",
    role: { fr: "Artiste tooth gem · Nail & gems", en: "Tooth gem artist · Nails & gems" },
    contributions: 121,
    badges: ["helper"],
    joined: "2025-05-30",
    tone: "blue",
    bio: {
      fr: "Je fais des ongles depuis dix ans, des gems depuis deux. Les deux métiers s’apprennent avec les mains.",
      en: "Ten years doing nails, two doing gems. Both crafts are learned with your hands.",
    },
    activeThisWeek: true,
  },
  {
    id: "yuki",
    name: "Yuki Tanaka",
    location: "Paris, FR",
    role: { fr: "Artiste certifiée · Studio Marais", en: "Certified artist · Studio Marais" },
    contributions: 89,
    badges: ["certified", "gemLover"],
    joined: "2025-06-09",
    tone: "fuchsia",
    bio: {
      fr: "Palettes froides, chrome et opale. Je photographie chaque pose, c’est devenu un carnet de bord.",
      en: "Cool palettes, chrome and opal. I photograph every set — it has become a logbook.",
    },
    activeThisWeek: true,
  },
  {
    id: "cleo",
    name: "Cléo Rinaldi",
    location: "Marseille, FR",
    role: { fr: "Artiste tooth gem", en: "Tooth gem artist" },
    contributions: 78,
    badges: ["gemLover"],
    joined: "2025-07-15",
    tone: "emerald",
    bio: {
      fr: "Je collectionne les pierres plus vite que je ne les pose. On m’a prévenue, je n’ai pas écouté.",
      en: "I collect stones faster than I set them. I was warned; I did not listen.",
    },
    activeThisWeek: true,
  },
  {
    id: "fatou",
    name: "Fatou Ndiaye",
    location: "Lille, FR",
    role: { fr: "Artiste tooth gem · Beauty bar", en: "Tooth gem artist · Beauty bar" },
    contributions: 64,
    badges: ["helper"],
    joined: "2025-09-02",
    tone: "ink",
    bio: {
      fr: "Je pose en institut, entre deux prestations ongles. Tout est une question de rythme de rendez-vous.",
      en: "I work inside a salon, between nail appointments. It is all a question of booking rhythm.",
    },
  },
  {
    id: "sacha",
    name: "Sacha Dubois",
    location: "Nantes, FR",
    role: { fr: "Artiste certifié", en: "Certified artist" },
    contributions: 54,
    badges: ["certified"],
    joined: "2025-11-19",
    tone: "blue",
    bio: {
      fr: "Certifié depuis le printemps. Je documente mes ratés autant que mes réussites.",
      en: "Certified since the spring. I document my misses as much as my hits.",
    },
    activeThisWeek: true,
  },
  {
    id: "thea",
    name: "Théa Lindqvist",
    location: "Malmö, SE",
    role: { fr: "Artiste tooth gem", en: "Tooth gem artist" },
    contributions: 96,
    badges: ["gemLover"],
    joined: "2025-08-21",
    tone: "fuchsia",
    bio: {
      fr: "Minimalisme scandinave : une pierre, bien placée, et on s’arrête là.",
      en: "Scandinavian minimalism: one stone, well placed, and you stop there.",
    },
  },
  {
    id: "ravi",
    name: "Ravi Kapoor",
    location: "Dublin, IE",
    role: { fr: "Artiste tooth gem en formation", en: "Tooth gem artist in training" },
    contributions: 11,
    badges: ["new"],
    joined: "2026-08-30",
    tone: "emerald",
    bio: {
      fr: "Leçon 6 de la Fondation. Je pose sur modèle depuis trois semaines et je pose beaucoup de questions.",
      en: "Lesson 6 of the Foundation. Three weeks of practice on a model, and a lot of questions.",
    },
    activeThisWeek: true,
  },
  {
    id: "mila",
    name: "Mila Ferreira",
    location: "Porto, PT",
    role: { fr: "Artiste tooth gem en formation", en: "Tooth gem artist in training" },
    contributions: 6,
    badges: ["new"],
    joined: "2026-09-08",
    tone: "blue",
    bio: {
      fr: "J’ouvre mon studio en novembre. D’ici là, j’apprends et je lis tout ce qui passe ici.",
      en: "My studio opens in November. Until then I learn, and I read everything posted here.",
    },
    activeThisWeek: true,
  },
  {
    id: "ana",
    name: "Ana Ruiz",
    location: "Valence, ES",
    role: { fr: "Artiste tooth gem en formation", en: "Tooth gem artist in training" },
    contributions: 3,
    badges: ["new"],
    joined: "2026-09-14",
    tone: "fuchsia",
    bio: {
      fr: "Tout juste arrivée. Je viens du maquillage permanent.",
      en: "Just arrived. I come from permanent makeup.",
    },
    activeThisWeek: true,
  },
  {
    id: "maud",
    name: "Maud Lefèvre",
    location: "Angers, FR",
    role: { fr: "Formatrice · Équipe Global Toothgems", en: "Trainer · Global Toothgems team" },
    contributions: 231,
    badges: ["team", "certified"],
    joined: "2024-11-05",
    tone: "ink",
    bio: {
      fr: "J’écris les formations et je passe ici tous les jours. Si une leçon n’est pas claire, dites-le-moi.",
      en: "I write the courses and I stop by every day. If a lesson is unclear, tell me.",
    },
    activeThisWeek: true,
  },
];

const MEMBER_BY_ID = new Map(MEMBERS.map((m) => [m.id, m]));

export function getMember(id: string): Member | undefined {
  return MEMBER_BY_ID.get(id);
}

/* ---------------------------------------------------------------- channels */

/** Presentation of a channel's index: a reading list, or a wall of creations. */
export type ChannelLayout = "list" | "gallery";

export interface Channel {
  id: string;
  name: Localized;
  /** One line, shown under the channel name in the navigation and the header. */
  tagline: Localized;
  /** The longer welcome, shown on the channel page itself. */
  intro: Localized;
  layout: ChannelLayout;
  tone: AvatarTone;
  /** Mock figure for the channel header. */
  members: number;
}

export const CHANNELS: Channel[] = [
  {
    id: "general",
    name: { fr: "Discussion générale", en: "General chat" },
    tagline: { fr: "Tout le reste, entre artistes", en: "Everything else, between artists" },
    intro: {
      fr: "Le salon principal : les questions du quotidien, les bonnes nouvelles, les journées difficiles et les conversations qui ne rentrent nulle part ailleurs.",
      en: "The main room: everyday questions, good news, hard days, and the conversations that fit nowhere else.",
    },
    layout: "list",
    tone: "blue",
    members: 1248,
  },
  {
    id: "showcase",
    name: { fr: "Vos créations", en: "Show your work" },
    tagline: { fr: "Le mur des poses de la communauté", en: "The community's wall of sets" },
    intro: {
      fr: "Montrez ce que vous avez posé cette semaine. Une photo, une phrase sur votre intention, et la communauté répond.",
      en: "Show what you set this week. One photo, one line about your intention, and the community answers.",
    },
    layout: "gallery",
    tone: "fuchsia",
    members: 1104,
  },
  {
    id: "techniques",
    name: { fr: "Techniques & astuces", en: "Techniques & tips" },
    tagline: { fr: "Préparation, pose, finition, retrait", en: "Prep, application, finish, removal" },
    intro: {
      fr: "Les discussions de métier : mordançage, colles, polymérisation, gestion de la salive, retraits propres et cas particuliers.",
      en: "Craft talk: etching, adhesives, curing, saliva control, clean removals and edge cases.",
    },
    layout: "list",
    tone: "emerald",
    members: 967,
  },
  {
    id: "training",
    name: { fr: "Aide formations", en: "Training help" },
    tagline: { fr: "Vos questions sur les cours", en: "Your questions about the courses" },
    intro: {
      fr: "Une question sur une leçon, un quiz ou une attestation ? Posez-la ici : la communauté répond, et l’équipe Global Toothgems passe tous les jours.",
      en: "A question about a lesson, a quiz or a certificate? Ask here: the community answers, and the Global Toothgems team stops by every day.",
    },
    layout: "list",
    tone: "blue",
    members: 892,
  },
  {
    id: "inspiration",
    name: { fr: "Inspiration", en: "Inspiration" },
    tagline: { fr: "Références, palettes, formes", en: "References, palettes, shapes" },
    intro: {
      fr: "Les images, les palettes et les idées qu’on garde sous le coude. Ce qui vous a donné envie de poser autrement.",
      en: "The images, palettes and ideas worth keeping. Whatever made you want to set differently.",
    },
    layout: "list",
    tone: "fuchsia",
    members: 1013,
  },
  {
    id: "materials",
    name: { fr: "Outils & matériel", en: "Tools & materials" },
    tagline: { fr: "Ce qui marche vraiment", en: "What actually works" },
    intro: {
      fr: "Pinces, lampes, colles, écarteurs, fournisseurs. Les retours d’usage honnêtes, y compris les déceptions.",
      en: "Tweezers, lamps, adhesives, retractors, suppliers. Honest field reports, disappointments included.",
    },
    layout: "list",
    tone: "ink",
    members: 878,
  },
  {
    id: "business",
    name: { fr: "Business & développement", en: "Business & growth" },
    tagline: { fr: "Tarifs, image, clientèle", en: "Pricing, brand, clients" },
    intro: {
      fr: "Tarification, prise de rendez-vous, photos, réseaux, fidélisation : le métier au-delà de la pose.",
      en: "Pricing, bookings, photography, socials, retention: the business beyond the set.",
    },
    layout: "list",
    tone: "emerald",
    members: 741,
  },
  {
    id: "intros",
    name: { fr: "Présentations", en: "Introduce yourself" },
    tagline: { fr: "Dites-nous qui vous êtes", en: "Tell us who you are" },
    intro: {
      fr: "Nouvelle arrivée ? C’est ici que ça commence. Votre ville, votre parcours, ce que vous venez chercher.",
      en: "Just arrived? It starts here. Your city, your background, what you came looking for.",
    },
    layout: "list",
    tone: "blue",
    members: 1186,
  },
];

const CHANNEL_BY_ID = new Map(CHANNELS.map((c) => [c.id, c]));

export function getChannel(id: string): Channel | undefined {
  return CHANNEL_BY_ID.get(id);
}

/* ------------------------------------------------------------- discussions */

export interface Reply {
  id: string;
  authorId: string;
  minutesAgo: number;
  body: Localized;
  reactions: ReactionCounts;
  /** Marked helpful by the person who opened the discussion. */
  helpful?: boolean;
}

export interface Discussion {
  id: string;
  channelId: string;
  authorId: string;
  title: Localized;
  /** One entry per paragraph. */
  body: Localized[];
  minutesAgo: number;
  image?: string;
  imageAlt?: Localized;
  reactions: ReactionCounts;
  replies: Reply[];
  /** Kept at the top of its channel. */
  pinned?: boolean;
  /** Offered on the community home page. */
  featured?: boolean;
}

export const DISCUSSIONS: Discussion[] = [
  /* --- techniques ---------------------------------------------------- */
  {
    id: "adhesif-du-moment",
    channelId: "techniques",
    authorId: "juno",
    title: { fr: "Quelle colle vous convainc en ce moment ?", en: "What adhesive are you currently loving?" },
    body: [
      {
        fr: "Je suis passée à une colle flow un peu plus épaisse cet été et la différence sur les molaires est nette : la pierre ne glisse plus pendant que je positionne.",
        en: "I moved to a slightly thicker flow adhesive this summer and the difference on molars is obvious: the stone stops drifting while I position it.",
      },
      {
        fr: "En revanche je trouve le rendu légèrement moins invisible sur les incisives très claires. Vous avez trouvé un compromis, ou vous gardez deux produits selon la dent ?",
        en: "On very light incisors though, I find the result slightly less invisible. Have you found one product that does both, or do you keep two depending on the tooth?",
      },
    ],
    minutesAgo: 124,
    reactions: { love: 12, sparkle: 5, gem: 7 },
    featured: true,
    replies: [
      {
        id: "r-adh-1",
        authorId: "ines",
        minutesAgo: 108,
        body: {
          fr: "Deux produits, sans hésiter. Une flow épaisse pour les postérieures, une plus fluide pour les incisives. Le temps perdu à changer de seringue est rattrapé sur le polissage.",
          en: "Two products, no hesitation. A thick flow for posteriors, a runnier one for incisors. The time lost swapping syringes comes back on polishing.",
        },
        reactions: { gem: 9, sparkle: 2 },
        helpful: true,
      },
      {
        id: "r-adh-2",
        authorId: "lena",
        minutesAgo: 96,
        body: {
          fr: "Même constat. Et je chauffe la seringue dans la main deux minutes avant : ça change la viscosité plus que le produit lui-même.",
          en: "Same here. And I warm the syringe in my hand for two minutes first: that changes viscosity more than the product itself does.",
        },
        reactions: { love: 6, gem: 4 },
      },
      {
        id: "r-adh-3",
        authorId: "ravi",
        minutesAgo: 71,
        body: {
          fr: "Je note tout ça, merci. Je suis encore sur une seule colle et je comprends mieux pourquoi mes molaires me demandent trois essais.",
          en: "Writing all of this down, thank you. I am still on a single adhesive and I now see why my molars take three attempts.",
        },
        reactions: { sparkle: 3 },
      },
      {
        id: "r-adh-4",
        authorId: "juno",
        minutesAgo: 44,
        body: {
          fr: "Parfait, je tente la fluide sur les incisives dès demain et je reviens vous dire.",
          en: "Perfect — trying the runny one on incisors tomorrow and I will report back.",
        },
        reactions: { love: 4 },
      },
    ],
  },
  {
    id: "salive-incisives",
    channelId: "techniques",
    authorId: "elif",
    title: { fr: "Gestion de la salive sur les incisives inférieures", en: "Saliva control on lower incisors" },
    body: [
      {
        fr: "Les inférieures restent mon point faible : entre la langue et la glande, j’ai dix secondes de champ sec et pas une de plus.",
        en: "Lower teeth are still my weak spot: between the tongue and the gland I get ten dry seconds, not one more.",
      },
      {
        fr: "J’utilise un écarteur souple plus deux rouleaux. Est-ce que quelqu’un travaille en position semi-assise plutôt qu’allongée ?",
        en: "I use a soft retractor plus two rolls. Does anyone work semi-seated rather than reclined?",
      },
    ],
    minutesAgo: 310,
    reactions: { gem: 8, love: 3 },
    replies: [
      {
        id: "r-sal-1",
        authorId: "juno",
        minutesAgo: 280,
        body: {
          fr: "Semi-assise, toujours, pour les inférieures. La gravité travaille pour vous au lieu de travailler contre. C’est le seul changement qui m’a vraiment fait gagner du temps.",
          en: "Semi-seated, always, for lowers. Gravity works for you instead of against you. It is the single change that actually saved me time.",
        },
        reactions: { gem: 11, sparkle: 4 },
        helpful: true,
      },
      {
        id: "r-sal-2",
        authorId: "fatou",
        minutesAgo: 214,
        body: {
          fr: "Et je préviens la cliente avant : « on va faire une pause toutes les deux minutes ». Elle se détend, elle déglutit moins, tout devient plus simple.",
          en: "And I warn the client up front: \"we will pause every two minutes\". They relax, swallow less, and everything gets easier.",
        },
        reactions: { love: 7 },
      },
    ],
  },
  {
    id: "retrait-sans-trace",
    channelId: "techniques",
    authorId: "ines",
    title: { fr: "Retrait sans trace : ma routine en cinq étapes", en: "Damage-free removal: my five-step routine" },
    body: [
      {
        fr: "On me pose souvent la question en message privé, alors autant l’écrire ici une bonne fois.",
        en: "I get asked this in DMs constantly, so here it is once and for all.",
      },
      {
        fr: "1. Photo avant. 2. Fracture de la colle à la pince, jamais de levier sur l’émail. 3. Résidus à la fraise silicone, à basse vitesse. 4. Pâte de polissage. 5. Photo après, montrée à la cliente. La dernière étape n’est pas cosmétique : c’est elle qui installe la confiance.",
        en: "1. Photo before. 2. Crack the adhesive with tweezers, never lever against the enamel. 3. Residue with a silicone bur, low speed. 4. Polishing paste. 5. Photo after, shown to the client. That last step is not cosmetic: it is what builds the trust.",
      },
    ],
    minutesAgo: 1580,
    reactions: { gem: 24, love: 16, sparkle: 9 },
    pinned: true,
    replies: [
      {
        id: "r-ret-1",
        authorId: "sacha",
        minutesAgo: 1410,
        body: {
          fr: "La photo après, je ne la faisais pas. Première cliente hier à qui je l’ai montrée : elle a repris rendez-vous dans la foulée.",
          en: "I was not doing the photo after. First client I showed it to, yesterday: she rebooked on the spot.",
        },
        reactions: { love: 12, gem: 3 },
      },
      {
        id: "r-ret-2",
        authorId: "maud",
        minutesAgo: 1290,
        body: {
          fr: "C’est exactement la séquence de la leçon 8 de la Fondation, en plus court. Je vais citer ce message en ressource complémentaire.",
          en: "This is exactly the sequence from Foundation lesson 8, only shorter. I am going to link this post as extra reading.",
        },
        reactions: { sparkle: 14, gem: 6 },
        helpful: true,
      },
      {
        id: "r-ret-3",
        authorId: "thea",
        minutesAgo: 980,
        body: {
          fr: "Basse vitesse, vraiment basse. J’ai appris ça à mes dépens sur ma propre dent.",
          en: "Low speed, really low. I learned that the hard way on my own tooth.",
        },
        reactions: { love: 5 },
      },
    ],
  },

  /* --- showcase ------------------------------------------------------ */
  {
    id: "premier-set-complet",
    channelId: "showcase",
    authorId: "noor",
    title: { fr: "Premier set complet sur mesure ✨", en: "First full set of custom tooth gems ✨" },
    body: [
      {
        fr: "Trois heures, douze pierres, une cliente qui n’a pas bougé d’un millimètre. On a construit la composition autour de sa canine, pas autour de la symétrie.",
        en: "Three hours, twelve stones, a client who did not move a millimetre. We built the composition around her canine rather than around symmetry.",
      },
      {
        fr: "Ce que je referais : commencer par la pierre centrale plutôt que par les latérales.",
        en: "What I would do again: start from the centre stone rather than from the laterals.",
      },
    ],
    minutesAgo: 302,
    image: img("mouth-01.jpg"),
    imageAlt: {
      fr: "Sourire avec un set complet de gems multicolores sur les incisives et les canines.",
      en: "Smile with a full set of multicoloured gems across the incisors and canines.",
    },
    reactions: { love: 41, sparkle: 27, gem: 18 },
    featured: true,
    replies: [
      {
        id: "r-set-1",
        authorId: "yuki",
        minutesAgo: 268,
        body: {
          fr: "La descente de tailles sur la latérale gauche est superbe. C’est ce qui fait que ça ne ressemble pas à un collage.",
          en: "The size gradient on the left lateral is superb. That is what keeps it from reading as a sticker collage.",
        },
        reactions: { sparkle: 8 },
      },
      {
        id: "r-set-2",
        authorId: "cleo",
        minutesAgo: 240,
        body: {
          fr: "Trois heures et zéro reprise, chapeau. Tu as fait des pauses ou tu as tenu d’une traite ?",
          en: "Three hours and no rework — hats off. Did you take breaks or go straight through?",
        },
        reactions: { love: 3 },
      },
      {
        id: "r-set-3",
        authorId: "noor",
        minutesAgo: 205,
        body: {
          fr: "Deux pauses de cinq minutes. Pour elle autant que pour moi : au bout d’une heure trente, mes mains ne valent plus rien.",
          en: "Two five-minute breaks. For her as much as for me: past ninety minutes my hands are worth nothing.",
        },
        reactions: { love: 9, gem: 2 },
      },
    ],
  },
  {
    id: "chrome-cristal",
    channelId: "showcase",
    authorId: "yuki",
    title: { fr: "Mes combinaisons chrome + cristal préférées", en: "My favourite chrome + crystal combinations" },
    body: [
      {
        fr: "Chrome sur les latérales, cristal clair au centre. Le contraste tient même en lumière d’intérieur, ce qui n’est pas le cas de toutes mes palettes.",
        en: "Chrome on the laterals, clear crystal in the centre. The contrast survives indoor light, which is not true of all my palettes.",
      },
    ],
    minutesAgo: 1340,
    image: img("mouth-03.jpg"),
    imageAlt: {
      fr: "Gros plan sur des dents ornées de gems chrome et cristal, mains aux ongles roses en premier plan.",
      en: "Close-up of teeth set with chrome and crystal gems, pink-nailed hands in the foreground.",
    },
    reactions: { sparkle: 33, love: 21, gem: 12 },
    featured: true,
    replies: [
      {
        id: "r-chr-1",
        authorId: "thea",
        minutesAgo: 1180,
        body: {
          fr: "Le chrome, je n’osais pas. Là, ça me donne envie d’essayer sur une seule dent pour commencer.",
          en: "I never dared with chrome. This makes me want to try it on a single tooth to start.",
        },
        reactions: { sparkle: 6 },
      },
      {
        id: "r-chr-2",
        authorId: "lena",
        minutesAgo: 1090,
        body: {
          fr: "Une seule dent, c’est exactement comme ça qu’il faut commencer. Et prends la photo au flash, le chrome ment à la lumière du jour.",
          en: "A single tooth is exactly how to start. And shoot it with flash — chrome lies in daylight.",
        },
        reactions: { gem: 7, love: 4 },
        helpful: true,
      },
    ],
  },
  {
    id: "rouge-ambre",
    channelId: "showcase",
    authorId: "lena",
    title: { fr: "Dégradé ambre sur l’arcade basse", en: "Amber gradient on the lower arch" },
    body: [
      {
        fr: "La cliente voulait « du feu sans que ça crie ». On est partis sur un dégradé ambre-rouge en descendant vers les prémolaires.",
        en: "The client wanted \"fire, but quiet\". We went with an amber-to-red gradient running back toward the premolars.",
      },
    ],
    minutesAgo: 2650,
    image: img("img-12.jpg"),
    imageAlt: {
      fr: "Dents ornées de petites gems ambre et cristal, coton-tige de polissage à droite.",
      en: "Teeth set with small amber and crystal gems, a polishing swab at the right.",
    },
    reactions: { love: 29, sparkle: 14, gem: 11 },
    replies: [
      {
        id: "r-amb-1",
        authorId: "elif",
        minutesAgo: 2410,
        body: {
          fr: "« Du feu sans que ça crie », je vais voler la formule pour mes consultations.",
          en: "\"Fire, but quiet\" — stealing that line for my consultations.",
        },
        reactions: { love: 11 },
      },
    ],
  },
  {
    id: "retour-modele",
    channelId: "showcase",
    authorId: "sacha",
    title: { fr: "Deuxième pose sur modèle, et je vois la différence", en: "Second set on a model, and I can see the difference" },
    body: [
      {
        fr: "Trois semaines entre les deux. Même palette, même dent, mais un placement enfin parallèle au bord libre.",
        en: "Three weeks between the two. Same palette, same tooth, but a placement finally parallel to the incisal edge.",
      },
    ],
    minutesAgo: 620,
    image: img("mouth-04.jpg"),
    imageAlt: {
      fr: "Pose de tooth gems en cours sur un modèle, dents écartées par un écarteur.",
      en: "A tooth gem set in progress on a model, lips held by a retractor.",
    },
    reactions: { love: 18, sparkle: 12 },
    replies: [
      {
        id: "r-mod-1",
        authorId: "ines",
        minutesAgo: 540,
        body: {
          fr: "La progression est visible, et c’est précisément le genre de post qui aide les nouvelles. Continue de documenter.",
          en: "The progress is visible, and this is precisely the kind of post that helps newcomers. Keep documenting.",
        },
        reactions: { love: 9, gem: 3 },
        helpful: true,
      },
    ],
  },
  {
    id: "opale-unique",
    channelId: "showcase",
    authorId: "thea",
    title: { fr: "Une seule opale, et on s’arrête là", en: "One opal, and that is where we stop" },
    body: [
      {
        fr: "Ma cliente arrivait avec une référence à onze pierres. On a essayé, on a retiré, on a regardé. Elle est repartie avec une seule.",
        en: "My client arrived with an eleven-stone reference. We tried it, removed them, looked again. She left with one.",
      },
    ],
    minutesAgo: 4100,
    image: img("mouth-05.jpg"),
    imageAlt: {
      fr: "Sourire avec une seule gem posée sur l’incisive.",
      en: "Smile with a single gem set on the incisor.",
    },
    reactions: { love: 34, gem: 15, sparkle: 8 },
    replies: [
      {
        id: "r-opa-1",
        authorId: "yuki",
        minutesAgo: 3900,
        body: {
          fr: "Savoir enlever, c’est la moitié du métier.",
          en: "Knowing what to remove is half the craft.",
        },
        reactions: { gem: 13, love: 5 },
      },
    ],
  },
  {
    id: "duo-canines",
    channelId: "showcase",
    authorId: "cleo",
    title: { fr: "Duo sur les canines, deux tailles seulement", en: "Canine duo, two sizes only" },
    body: [
      {
        fr: "Une 1,8 mm et une 2,2 mm, rien d’autre. Preuve qu’on n’a pas besoin d’un tiroir entier pour faire une belle pose.",
        en: "One 1.8 mm and one 2.2 mm, nothing else. Proof you do not need a whole drawer to make a good set.",
      },
    ],
    minutesAgo: 5300,
    image: img("mouth-02.jpg"),
    imageAlt: {
      fr: "Deux gems posées sur les canines, sourire de face.",
      en: "Two gems set on the canines, front-facing smile.",
    },
    reactions: { sparkle: 19, love: 13, gem: 6 },
    replies: [],
  },

  /* --- general ------------------------------------------------------- */
  {
    id: "premiere-cliente-stress",
    channelId: "general",
    authorId: "mila",
    title: { fr: "Première vraie cliente vendredi. Des conseils ?", en: "First real client on Friday. Any advice?" },
    body: [
      {
        fr: "J’ai terminé la Fondation la semaine dernière et une amie d’amie a pris rendez-vous. Je suis compétente sur modèle et paniquée à l’idée d’une vraie bouche.",
        en: "I finished the Foundation last week and a friend of a friend booked. I am competent on a model and terrified of a real mouth.",
      },
      {
        fr: "Ce que je crains surtout : le silence. Je ne sais pas de quoi parler pendant que je travaille.",
        en: "What worries me most is the silence. I have no idea what to talk about while I work.",
      },
    ],
    minutesAgo: 47,
    reactions: { love: 22, sparkle: 6 },
    featured: true,
    replies: [
      {
        id: "r-pre-1",
        authorId: "fatou",
        minutesAgo: 39,
        body: {
          fr: "Annonce chaque étape à voix haute. « Je sèche, je pose le gel, vingt secondes de lampe. » Ça remplit le silence, ça rassure, et ça te force à ne rien sauter.",
          en: "Narrate every step out loud. \"Drying now, gel going on, twenty seconds of lamp.\" It fills the silence, reassures them, and stops you skipping anything.",
        },
        reactions: { gem: 16, love: 8 },
        helpful: true,
      },
      {
        id: "r-pre-2",
        authorId: "noor",
        minutesAgo: 31,
        body: {
          fr: "Et prévois le double de temps. Une heure annoncée pour une pose de vingt minutes, c’est le meilleur cadeau que tu puisses te faire vendredi.",
          en: "And block twice the time. An hour announced for a twenty-minute set is the best gift you can give yourself on Friday.",
        },
        reactions: { love: 12, gem: 5 },
      },
      {
        id: "r-pre-3",
        authorId: "ravi",
        minutesAgo: 18,
        body: {
          fr: "Je passe la mienne samedi, on se raconte ça lundi ?",
          en: "Mine is on Saturday — shall we compare notes on Monday?",
        },
        reactions: { love: 7, sparkle: 3 },
      },
    ],
  },
  {
    id: "studio-partage",
    channelId: "general",
    authorId: "fatou",
    title: { fr: "Travailler en institut : ce que personne ne dit", en: "Working inside a salon: what nobody tells you" },
    body: [
      {
        fr: "Six mois que je pose entre deux prestations ongles. Le vrai sujet n’est pas technique, il est logistique : la lumière est mauvaise et le fauteuil n’est pas fait pour ça.",
        en: "Six months of setting gems between nail appointments. The real issue is not technical, it is logistical: the light is wrong and the chair is not built for it.",
      },
      {
        fr: "J’ai fini par acheter ma propre lampe sur pied. Meilleur investissement de l’année.",
        en: "I ended up buying my own floor lamp. Best purchase of the year.",
      },
    ],
    minutesAgo: 1460,
    reactions: { love: 15, gem: 9 },
    replies: [
      {
        id: "r-stu-1",
        authorId: "elif",
        minutesAgo: 1300,
        body: {
          fr: "La lumière, mille fois. J’ai perdu six mois à croire que mes poses étaient ratées alors que je ne les voyais simplement pas.",
          en: "The light, a thousand times. I lost six months believing my sets were bad when I simply could not see them.",
        },
        reactions: { gem: 8 },
      },
    ],
  },

  /* --- training ------------------------------------------------------ */
  {
    id: "quiz-lecon-4",
    channelId: "training",
    authorId: "ravi",
    title: { fr: "Leçon 4 : je bloque sur la question du temps de mordançage", en: "Lesson 4: stuck on the etching-time question" },
    body: [
      {
        fr: "La leçon donne une fourchette, le quiz attend une valeur. Est-ce que je rate quelque chose d’évident ?",
        en: "The lesson gives a range, the quiz expects one value. Am I missing something obvious?",
      },
    ],
    minutesAgo: 190,
    reactions: { sparkle: 4 },
    replies: [
      {
        id: "r-quiz-1",
        authorId: "maud",
        minutesAgo: 150,
        body: {
          fr: "Non, vous ne ratez rien : le quiz attend la valeur haute de la fourchette, et la question mériterait d’être reformulée. C’est noté pour la prochaine mise à jour, merci de l’avoir signalé.",
          en: "No, you are not missing anything: the quiz expects the top of the range, and the question deserves a rewrite. Noted for the next update — thank you for flagging it.",
        },
        reactions: { gem: 11, love: 6 },
        helpful: true,
      },
      {
        id: "r-quiz-2",
        authorId: "ines",
        minutesAgo: 120,
        body: {
          fr: "Et dans la vraie vie, la fourchette compte plus que la valeur : l’émail d’une ado et celui d’un fumeur de cinquante ans ne se comportent pas pareil.",
          en: "And in real life the range matters more than the number: a teenager's enamel and a fifty-year-old smoker's do not behave the same.",
        },
        reactions: { gem: 9, sparkle: 2 },
      },
    ],
  },
  {
    id: "attestation-delai",
    channelId: "training",
    authorId: "sacha",
    title: { fr: "L’attestation s’affiche-t-elle tout de suite ?", en: "Does the certificate appear straight away?" },
    body: [
      {
        fr: "J’ai validé la dernière leçon du Kit Business hier soir et l’attestation était dans mon compte dans la seconde. Je le note ici parce que la question revient souvent.",
        en: "I validated the last Business Kit lesson yesterday evening and the certificate was in my account within the second. Noting it here because the question comes up a lot.",
      },
    ],
    minutesAgo: 3400,
    reactions: { sparkle: 7, love: 4 },
    replies: [
      {
        id: "r-att-1",
        authorId: "maud",
        minutesAgo: 3300,
        body: {
          fr: "Exact : dès la dernière leçon validée, l’attestation est disponible dans « Mes attestations », téléchargeable autant de fois que nécessaire.",
          en: "Correct: as soon as the final lesson is validated the certificate is available under \"My certificates\", downloadable as many times as needed.",
        },
        reactions: { gem: 5 },
        helpful: true,
      },
    ],
  },

  /* --- inspiration --------------------------------------------------- */
  {
    id: "palette-vert-eau",
    channelId: "inspiration",
    authorId: "cleo",
    title: { fr: "La palette vert d’eau que je n’arrive pas à lâcher", en: "The sea-green palette I cannot put down" },
    body: [
      {
        fr: "Péridot clair, un cristal AB, et rien d’autre. Sur un émail légèrement ivoire, le vert réchauffe au lieu de refroidir — je m’attendais à l’inverse.",
        en: "Light peridot, one AB crystal, nothing else. On slightly ivory enamel the green warms things up instead of cooling them down — I expected the opposite.",
      },
    ],
    minutesAgo: 880,
    image: img("img-19.jpg"),
    imageAlt: {
      fr: "Cristal rond vert clair photographié sur fond blanc.",
      en: "Round light-green crystal photographed on a white background.",
    },
    reactions: { sparkle: 17, gem: 9, love: 6 },
    replies: [
      {
        id: "r-pal-1",
        authorId: "thea",
        minutesAgo: 790,
        body: {
          fr: "Le vert sur ivoire, c’est mon combo de l’automne. Essaie avec une seule pierre sur la latérale, c’est encore plus net.",
          en: "Green on ivory is my autumn combo. Try it with a single stone on the lateral — it reads even cleaner.",
        },
        reactions: { sparkle: 5 },
      },
    ],
  },
  {
    id: "formes-carnet",
    channelId: "inspiration",
    authorId: "yuki",
    title: { fr: "Je tiens un carnet de formes depuis un an", en: "I have kept a shapes notebook for a year" },
    body: [
      {
        fr: "Un croquis par pose, avec la forme du bord libre de la dent. Au bout d’un an, je vois des familles de visages et de sourires apparaître, et je propose plus vite.",
        en: "One sketch per set, with the shape of the tooth's incisal edge. After a year I see families of faces and smiles emerging, and I propose faster.",
      },
      {
        fr: "Ce n’est pas de l’art, c’est de la mémoire.",
        en: "It is not art, it is memory.",
      },
    ],
    minutesAgo: 2100,
    reactions: { love: 26, gem: 14, sparkle: 11 },
    featured: true,
    replies: [
      {
        id: "r-for-1",
        authorId: "lena",
        minutesAgo: 1950,
        body: {
          fr: "« Ce n’est pas de l’art, c’est de la mémoire. » Je commence mon carnet ce soir.",
          en: "\"It is not art, it is memory.\" Starting my notebook tonight.",
        },
        reactions: { love: 14, sparkle: 4 },
      },
      {
        id: "r-for-2",
        authorId: "mila",
        minutesAgo: 1700,
        body: {
          fr: "Tu le fais sur papier ou en numérique ?",
          en: "Do you keep it on paper or digitally?",
        },
        reactions: {},
      },
      {
        id: "r-for-3",
        authorId: "yuki",
        minutesAgo: 1640,
        body: {
          fr: "Papier. Un carnet A6 qui vit dans la poche de ma blouse. Le numérique, je ne l’ouvrais jamais entre deux clientes.",
          en: "Paper. An A6 notebook that lives in my tunic pocket. I never opened the digital one between clients.",
        },
        reactions: { gem: 6 },
        helpful: true,
      },
    ],
  },

  /* --- materials ----------------------------------------------------- */
  {
    id: "pince-precision",
    channelId: "materials",
    authorId: "lena",
    title: { fr: "Trois pinces testées sur six mois, un verdict", en: "Three tweezers tested over six months, one verdict" },
    body: [
      {
        fr: "Courbe fine, droite classique, et une pince à godet. La godet a gagné, mais seulement pour les pierres au-dessus de 2 mm.",
        en: "Fine curve, classic straight, and a cup tweezer. The cup won — but only for stones above 2 mm.",
      },
      {
        fr: "En dessous, la courbe fine reste imbattable. Deux outils, pas un.",
        en: "Below that, the fine curve is unbeatable. Two tools, not one.",
      },
    ],
    minutesAgo: 760,
    image: img("img-13.jpg"),
    imageAlt: {
      fr: "Cristal rond doré photographié sur fond blanc.",
      en: "Round golden crystal photographed on a white background.",
    },
    reactions: { gem: 21, love: 7 },
    replies: [
      {
        id: "r-pin-1",
        authorId: "juno",
        minutesAgo: 700,
        body: {
          fr: "Confirmé. Et pour la godet, vérifie le diamètre du godet avant d’acheter : sur certaines, une 1,8 se perd dedans.",
          en: "Confirmed. And for the cup one, check the cup diameter before buying: on some, a 1.8 gets lost inside it.",
        },
        reactions: { gem: 8 },
        helpful: true,
      },
      {
        id: "r-pin-2",
        authorId: "ana",
        minutesAgo: 410,
        body: {
          fr: "Merci, je m’apprêtais à acheter une seule pince pour tout faire.",
          en: "Thank you — I was about to buy a single tweezer to do everything.",
        },
        reactions: { love: 4 },
      },
    ],
  },
  {
    id: "lampe-portable",
    channelId: "materials",
    authorId: "elif",
    title: { fr: "Lampe portable : la déception de l’année", en: "Portable lamp: this year's disappointment" },
    body: [
      {
        fr: "Achetée pour les prestations à domicile, annoncée à trois secondes de polymérisation. En pratique, il m’en faut douze, et la batterie tient une demi-journée.",
        en: "Bought for home visits, advertised at three seconds of curing. In practice I need twelve, and the battery lasts half a day.",
      },
      {
        fr: "Je ne cite pas la marque, mais méfiez-vous des temps annoncés sans distance de travail.",
        en: "I will not name the brand, but be wary of cure times quoted with no working distance.",
      },
    ],
    minutesAgo: 5200,
    reactions: { gem: 13, love: 5 },
    replies: [
      {
        id: "r-lam-1",
        authorId: "noor",
        minutesAgo: 5000,
        body: {
          fr: "En mobile, je polymérise toujours deux fois de toute façon. Le temps annoncé, je pars du principe qu’il est théorique.",
          en: "On mobile jobs I always cure twice anyway. I treat the advertised time as theoretical.",
        },
        reactions: { gem: 6 },
      },
    ],
  },

  /* --- business ------------------------------------------------------ */
  {
    id: "tarifs-sur-mesure",
    channelId: "business",
    authorId: "noor",
    title: { fr: "Comment fixez-vous le prix d’une création sur mesure ?", en: "How do you price custom designs?" },
    body: [
      {
        fr: "À la pierre, c’est simple mais ça punit les poses rapides et bien faites. Au forfait, c’est lisible mais je perds sur les sets complets.",
        en: "Per stone is simple but it punishes fast, well-executed sets. A flat rate is readable but I lose money on full sets.",
      },
      {
        fr: "Je teste un forfait par tranche : une à trois pierres, quatre à huit, au-delà sur devis. Vous faites comment ?",
        en: "I am testing banded pricing: one to three stones, four to eight, beyond that on quote. How do you handle it?",
      },
    ],
    minutesAgo: 1620,
    reactions: { gem: 19, love: 11, sparkle: 4 },
    featured: true,
    replies: [
      {
        id: "r-tar-1",
        authorId: "ines",
        minutesAgo: 1500,
        body: {
          fr: "Par tranche, depuis deux ans. Et je facture la consultation quand elle dépasse quinze minutes — ça a fait disparaître les rendez-vous fantômes.",
          en: "Banded, for two years. And I charge for the consultation past fifteen minutes — it made the no-shows disappear.",
        },
        reactions: { gem: 15, love: 6 },
        helpful: true,
      },
      {
        id: "r-tar-2",
        authorId: "fatou",
        minutesAgo: 1400,
        body: {
          fr: "Attention à ne pas faire payer la lenteur d’apprentissage aux clientes. Mes premiers tarifs étaient calés sur mon temps de débutante, il a fallu tout revoir.",
          en: "Careful not to make clients pay for your learning curve. My first prices were built on beginner timings and I had to redo them all.",
        },
        reactions: { gem: 9, love: 7 },
      },
      {
        id: "r-tar-3",
        authorId: "lena",
        minutesAgo: 1280,
        body: {
          fr: "Et affichez le prix du retrait dès le départ. C’est la question numéro un en consultation et la réponse rassure.",
          en: "And publish your removal price from the start. It is the number-one consultation question and the answer reassures.",
        },
        reactions: { gem: 12, sparkle: 3 },
      },
    ],
  },
  {
    id: "photos-avant-apres",
    channelId: "business",
    authorId: "yuki",
    title: { fr: "Le protocole photo qui m’a fait gagner des rendez-vous", en: "The photo protocol that won me bookings" },
    body: [
      {
        fr: "Même cadrage, même distance, même lumière, avant et après. Rien de plus. Mon feed est devenu lisible et les demandes ont doublé en deux mois.",
        en: "Same framing, same distance, same light, before and after. Nothing more. My feed became readable and enquiries doubled in two months.",
      },
    ],
    minutesAgo: 2900,
    reactions: { love: 24, gem: 10 },
    replies: [
      {
        id: "r-pho-1",
        authorId: "cleo",
        minutesAgo: 2700,
        body: {
          fr: "Le « même » est la partie difficile. J’ai marqué au sol l’endroit où je pose le trépied, ça a tout changé.",
          en: "The \"same\" is the hard part. I taped the tripod spot on the floor and it changed everything.",
        },
        reactions: { gem: 11, love: 3 },
        helpful: true,
      },
    ],
  },

  /* --- intros -------------------------------------------------------- */
  {
    id: "bienvenue-ana",
    channelId: "intros",
    authorId: "ana",
    title: { fr: "Bonjour depuis Valence 👋", en: "Hello from Valencia 👋" },
    body: [
      {
        fr: "Je viens du maquillage permanent et je commence la Fondation cette semaine. Je suis là surtout pour lire, au début.",
        en: "I come from permanent makeup and I start the Foundation this week. Mostly here to read, at first.",
      },
    ],
    minutesAgo: 95,
    reactions: { love: 17, sparkle: 8 },
    replies: [
      {
        id: "r-ana-1",
        authorId: "elif",
        minutesAgo: 80,
        body: {
          fr: "Bienvenue ! Le maquillage permanent, c’est une excellente base : tu as déjà la main stable et le sens de la symétrie.",
          en: "Welcome! Permanent makeup is an excellent base: you already have the steady hand and the eye for symmetry.",
        },
        reactions: { love: 6 },
      },
      {
        id: "r-ana-2",
        authorId: "maud",
        minutesAgo: 62,
        body: {
          fr: "Bienvenue Ana. Si une leçon coince, le salon « Aide formations » est fait exactement pour ça.",
          en: "Welcome Ana. If a lesson gets stuck, the Training help channel exists for exactly that.",
        },
        reactions: { sparkle: 5, love: 3 },
      },
    ],
  },
  {
    id: "bienvenue-mila",
    channelId: "intros",
    authorId: "mila",
    title: { fr: "Mila, Porto, studio qui ouvre en novembre", en: "Mila, Porto, studio opening in November" },
    body: [
      {
        fr: "J’ai signé le bail il y a dix jours. Deux fauteuils, beaucoup de lumière, et une peur raisonnable.",
        en: "I signed the lease ten days ago. Two chairs, a lot of light, and a reasonable amount of fear.",
      },
    ],
    minutesAgo: 2400,
    reactions: { love: 31, sparkle: 12 },
    replies: [
      {
        id: "r-mil-1",
        authorId: "noor",
        minutesAgo: 2200,
        body: {
          fr: "La peur raisonnable, c’est bon signe. Ouvre la porte, le reste s’apprend.",
          en: "Reasonable fear is a good sign. Open the door — the rest is learned.",
        },
        reactions: { love: 15, gem: 4 },
      },
    ],
  },
];

/* ------------------------------------------------------------------ stats */

/**
 * Community figures for the home page. Mock values, but two of them are derived
 * from the fixtures above rather than typed twice, so adding a discussion to
 * this file moves the counters with it.
 */
export const COMMUNITY_STATS = {
  artists: 1248,
  discussions: 356,
  creations: 892,
  activeThisWeek: 124,
};

/** Artists carrying the presence dot, used for the avatar stacks. */
export const ACTIVE_MEMBERS = MEMBERS.filter((m) => m.activeThisWeek);

export function discussionsInChannel(channelId: string): Discussion[] {
  return DISCUSSIONS.filter((d) => d.channelId === channelId);
}

export function replyCount(discussion: Discussion): number {
  return discussion.replies.length;
}

/**
 * The community guidelines, kept as data because they are content: four
 * expectations, written as invitations rather than as prohibitions.
 */
export const GUIDELINES: Array<{ id: string; title: Localized; body: Localized }> = [
  {
    id: "generous",
    title: { fr: "Répondez comme on aurait aimé vous répondre", en: "Answer the way you wish someone had answered you" },
    body: {
      fr: "Personne n’est né en sachant mordancer. Une question de débutant mérite la même attention qu’une question de dix ans de métier.",
      en: "Nobody was born knowing how to etch. A beginner's question deserves the same care as one from ten years into the craft.",
    },
  },
  {
    id: "credit",
    title: { fr: "Créditez le travail des autres", en: "Credit other people's work" },
    body: {
      fr: "Une référence, une palette, une technique apprise ici : citez la personne. C’est ce qui fait qu’on continue de partager.",
      en: "A reference, a palette, a technique learned here: name the person. That is what keeps people sharing.",
    },
  },
  {
    id: "consent",
    title: { fr: "Photographiez avec l’accord de vos clientes", en: "Photograph with your clients' consent" },
    body: {
      fr: "Une bouche est identifiable. Demandez avant de publier, et retirez sur simple demande.",
      en: "A mouth is identifiable. Ask before posting, and take it down on request.",
    },
  },
  {
    id: "safety",
    title: { fr: "La sécurité avant l’esthétique", en: "Safety before aesthetics" },
    body: {
      fr: "Aucune astuce ne vaut un émail abîmé. En cas de doute sur un cas clinique, orientez vers un professionnel de santé.",
      en: "No shortcut is worth damaged enamel. When a clinical case is in doubt, refer to a health professional.",
    },
  },
];

/**
 * Stand-ins for a photo upload.
 *
 * The composer has to show what attaching a creation feels like, and this
 * prototype has no storage to upload to. Rather than fake a progress bar for a
 * file that goes nowhere, the attachment area offers three photographs from the
 * brand library and says plainly that it is a sample.
 */
export const SAMPLE_UPLOADS: Array<{ id: string; src: string; alt: Localized }> = [
  {
    id: "sample-1",
    src: img("mouth-02.jpg"),
    alt: { fr: "Deux gems posées sur les canines.", en: "Two gems set on the canines." },
  },
  {
    id: "sample-2",
    src: img("mouth-04.jpg"),
    alt: { fr: "Pose en cours, dents écartées par un écarteur.", en: "A set in progress, lips held by a retractor." },
  },
  {
    id: "sample-3",
    src: img("img-12.jpg"),
    alt: { fr: "Petites gems ambre et cristal sur les incisives.", en: "Small amber and crystal gems on the incisors." },
  },
];
