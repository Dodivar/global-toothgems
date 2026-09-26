import type { Localized } from "./types";
import {
  DEFAULT_QUIZ_SETTINGS,
  MEDIA_LIBRARY,
  type ContentBlock,
  type Module,
  type Question,
  type Quiz,
  type Step,
  type TrainingCourse,
} from "./adminTraining";

/**
 * The seeded training catalogue.
 *
 * Five courses across every publication status, and one of them — "Pose
 * professionnelle de tooth gems" — authored in full: three modules, nine steps,
 * thirty content blocks and fifteen quiz questions with both feedback strings.
 * A builder demonstrated on an empty course proves nothing, and the readiness
 * screen needs real material to count.
 *
 * Two omissions are deliberate, not oversights: the hygiene course has a module
 * without a knowledge check and an image with no alternative text, so the
 * review screen has genuine warnings to report. The creative course has no
 * modules at all, so the builder's empty state is reachable from the list.
 */

const L = (fr: string, en: string): Localized => ({ fr, en });

const media = (id: string) => MEDIA_LIBRARY.find((m) => m.id === id)!.src;

/* -------------------------------------------------------------------------- */
/* Block constructors                                                          */
/* -------------------------------------------------------------------------- */

const text = (id: string, fr: string, en: string): ContentBlock => ({ id, type: "text", html: L(fr, en) });

const image = (
  id: string,
  mediaId: string,
  alt: Localized,
  caption: Localized,
  align: "left" | "center" | "full" = "full",
): ContentBlock => ({ id, type: "image", src: media(mediaId), alt, caption, align });

const video = (
  id: string,
  mediaId: string,
  title: Localized,
  duration: string,
  caption: Localized,
): ContentBlock => ({
  id,
  type: "video",
  poster: media(mediaId),
  title,
  duration,
  source: `gtg-media://training/${id}.mp4`,
  caption,
});

/* -------------------------------------------------------------------------- */
/* Quiz constructors                                                           */
/* -------------------------------------------------------------------------- */

interface AnswerSeed {
  text: Localized;
  correct?: boolean;
  explanation?: Localized;
}

const question = (
  id: string,
  text: Localized,
  answers: AnswerSeed[],
  correctFeedback: Localized,
  incorrectFeedback: Localized,
  learnMore?: Localized,
): Question => ({
  id,
  text,
  answers: answers.map((a, index) => ({
    id: `${id}-a${index + 1}`,
    text: a.text,
    correct: a.correct === true,
    explanation: a.explanation,
  })),
  correctFeedback,
  incorrectFeedback,
  learnMore,
});

const quiz = (id: string, title: Localized, intro: Localized, questions: Question[]): Quiz => ({
  id,
  title,
  intro,
  questions,
  settings: { ...DEFAULT_QUIZ_SETTINGS },
});

const step = (id: string, title: Localized, summary: Localized, duration: number, blocks: ContentBlock[]): Step => ({
  id,
  title,
  summary,
  duration,
  blocks,
});

/* -------------------------------------------------------------------------- */
/* Course 1 — Pose professionnelle de tooth gems (fully authored)              */
/* -------------------------------------------------------------------------- */

const PRO_MODULE_1: Module = {
  id: "m-pro-1",
  title: L("Fondations", "Foundations"),
  description: L(
    "Ce que recouvre le métier, le matériel indispensable et les règles d’hygiène qui conditionnent tout le reste.",
    "What the craft covers, the equipment you cannot work without, and the hygiene rules everything else depends on.",
  ),
  cover: media("med-07"),
  objectives: [
    L("Nommer chaque instrument du plateau et son usage.", "Name every instrument on the tray and what it is for."),
    L("Décrire les trois familles de gems et leurs contraintes.", "Describe the three gem families and their constraints."),
    L("Préparer un poste de travail conforme.", "Set up a compliant workstation."),
  ],
  steps: [
    step(
      "s-pro-1-1",
      L("Bienvenue", "Welcome"),
      L("Ce que vous saurez faire à la fin de la formation.", "What you will be able to do by the end of the course."),
      6,
      [
        text(
          "b-pro-1-1-1",
          "<h3>Bienvenue dans la formation</h3><p>En neuf étapes, vous apprendrez à poser une tooth gem de façon durable, réversible et sans aucun dommage pour l’émail. Chaque module se termine par un point de connaissances : il est là pour vous rassurer, pas pour vous piéger.</p>",
          "<h3>Welcome to the course</h3><p>In nine steps you will learn to apply a tooth gem so that it lasts, stays reversible and leaves the enamel completely intact. Each module ends with a knowledge check — it is there to reassure you, not to catch you out.</p>",
        ),
        video(
          "b-pro-1-1-2",
          "med-12",
          L("Mot d’accueil de Camille", "A word from Camille"),
          "04:12",
          L("Camille présente le déroulé des trois modules.", "Camille walks through how the three modules fit together."),
        ),
        text(
          "b-pro-1-1-3",
          "<p><strong>À la fin de cette formation, vous saurez :</strong></p><ul><li>évaluer si une dent peut recevoir une gem ;</li><li>préparer l’émail sans l’abîmer ;</li><li>poser, polymériser et contrôler la gem ;</li><li>expliquer le suivi au client et retirer la gem proprement.</li></ul>",
          "<p><strong>By the end of this course you will be able to:</strong></p><ul><li>judge whether a tooth can take a gem;</li><li>prepare enamel without damaging it;</li><li>apply, cure and inspect the gem;</li><li>explain aftercare to the client and remove the gem cleanly.</li></ul>",
        ),
      ],
    ),
    step(
      "s-pro-1-2",
      L("Matériel et outils", "Materials & tools"),
      L("Le plateau complet, instrument par instrument.", "The full tray, instrument by instrument."),
      12,
      [
        text(
          "b-pro-1-2-1",
          "<h3>Le plateau de base</h3><p>Un poste de pose tient sur un plateau. Tout ce qui n’y figure pas est un confort, pas une nécessité — et un plateau surchargé est un plateau mal désinfecté.</p>",
          "<h3>The basic tray</h3><p>An application station fits on a single tray. Anything not on it is a comfort, not a necessity — and an overloaded tray is a poorly disinfected one.</p>",
        ),
        image(
          "b-pro-1-2-2",
          "med-06",
          L(
            "Plateau d’instruments stérilisés disposés sur un champ bleu.",
            "Sterilised instruments laid out on a blue field.",
          ),
          L("Le plateau tel qu’il doit se présenter avant l’arrivée du client.", "The tray as it should look before the client arrives."),
        ),
        text(
          "b-pro-1-2-3",
          "<p>Trois familles de gems circulent en studio : les <strong>cristaux à dos plat</strong>, les <strong>gems serties</strong> et les <strong>charms</strong>. Le dos plat est la seule surface qui garantit un collage homogène ; les deux autres demandent un adhésif plus épais et une main plus sûre.</p>",
          "<p>Three gem families circulate in a studio: <strong>flat-back crystals</strong>, <strong>set gems</strong> and <strong>charms</strong>. The flat back is the only surface that guarantees an even bond; the other two need a thicker adhesive and a steadier hand.</p>",
        ),
        video(
          "b-pro-1-2-4",
          "med-08",
          L("Trier et choisir une gem", "Sorting and choosing a gem"),
          "06:48",
          L("Comment lire une taille en SS et la rapporter à la dent.", "How to read an SS size and match it to the tooth."),
        ),
        text(
          "b-pro-1-2-5",
          "<p><em>Astuce :</em> gardez une gem de chaque taille collée sur une réglette témoin. Montrer la taille réelle au client évite la plupart des déceptions.</p>",
          "<p><em>Tip:</em> keep one gem of each size glued to a sample strip. Showing the real size to a client heads off most disappointments.</p>",
        ),
      ],
    ),
    step(
      "s-pro-1-3",
      L("Bases de l’hygiène", "Hygiene basics"),
      L("Désinfection, champ de travail et gestion des déchets.", "Disinfection, working field and waste handling."),
      9,
      [
        text(
          "b-pro-1-3-1",
          "<h3>Trois zones, trois règles</h3><p>Le poste se découpe en zone propre, zone de travail et zone sale. Un instrument ne remonte jamais d’une zone sale vers une zone propre, même « juste une seconde ».</p>",
          "<h3>Three zones, three rules</h3><p>The station splits into a clean zone, a working zone and a dirty zone. An instrument never travels back from a dirty zone to a clean one, not even “just for a second”.</p>",
        ),
        image(
          "b-pro-1-3-2",
          "med-07",
          L("Poste de travail préparé avec champ jetable et instruments couverts.", "Prepared workstation with a disposable field and covered instruments."),
          L("Le champ jetable est remplacé entre chaque client.", "The disposable field is replaced between every client."),
        ),
        text(
          "b-pro-1-3-3",
          "<p>Gants à chaque pose, sans exception. Le masque est obligatoire dès qu’un mordançage est en cours : l’acide projette de fines gouttelettes que l’on ne voit pas.</p>",
          "<p>Gloves for every application, without exception. A mask is mandatory as soon as etching starts: the acid throws off fine droplets you will not see.</p>",
        ),
      ],
    ),
  ],
  quiz: quiz(
    "qz-pro-1",
    L("Point de connaissances", "Knowledge check"),
    L("Cinq questions sur le matériel et l’hygiène.", "Five questions on equipment and hygiene."),
    [
      question(
        "q-pro-1-1",
        L("Quelle est la première étape avant de poser une tooth gem ?", "What is the first step before applying a tooth gem?"),
        [
          {
            text: L("Nettoyer et préparer la dent", "Clean and prepare the tooth"),
            correct: true,
            explanation: L("L’adhésif n’accroche que sur un émail propre et sec.", "Adhesive only grips clean, dry enamel."),
          },
          { text: L("Appliquer l’adhésif immédiatement", "Apply the adhesive immediately") },
          { text: L("Placer le cristal en premier", "Place the crystal first") },
          { text: L("Polymériser la gem avant la préparation", "Cure the gem before preparation") },
        ],
        L(
          "Exact ! Une préparation soigneuse de la dent est indispensable avant la pose.",
          "Correct! Proper tooth preparation is essential before applying the gem.",
        ),
        L(
          "Pas tout à fait. La dent doit être correctement nettoyée et préparée avant de commencer la pose.",
          "Not quite. The tooth must be properly cleaned and prepared before the application process.",
        ),
        L(
          "Le module 02 revient en détail sur le protocole de préparation.",
          "Module 02 covers the preparation protocol in detail.",
        ),
      ),
      question(
        "q-pro-1-2",
        L("Quelle forme de gem garantit le collage le plus homogène ?", "Which gem shape gives the most even bond?"),
        [
          { text: L("Le cristal à dos plat", "The flat-back crystal"), correct: true },
          { text: L("La gem sertie", "The set gem") },
          { text: L("Le charm articulé", "The articulated charm") },
          { text: L("La perle ronde", "The round pearl") },
        ],
        L("Exact ! Le dos plat maximise la surface en contact avec l’émail.", "Correct! A flat back maximises the surface in contact with the enamel."),
        L("Pas tout à fait. Une surface bombée réduit la zone de collage et fragilise la pose.", "Not quite. A curved surface reduces the bonding area and weakens the application."),
      ),
      question(
        "q-pro-1-3",
        L("Le port du masque est obligatoire à quel moment ?", "When is wearing a mask mandatory?"),
        [
          { text: L("Pendant le mordançage", "During etching"), correct: true },
          { text: L("Uniquement en fin de séance", "Only at the end of the session") },
          { text: L("Jamais, les gants suffisent", "Never — gloves are enough") },
          { text: L("Seulement si le client le demande", "Only if the client asks") },
        ],
        L("Exact ! L’acide projette des gouttelettes invisibles à l’œil nu.", "Correct! The acid throws off droplets invisible to the naked eye."),
        L("Pas tout à fait. Le mordançage projette de l’acide : le masque est obligatoire à ce moment précis.", "Not quite. Etching sprays acid, so the mask is mandatory at exactly that moment."),
      ),
      question(
        "q-pro-1-4",
        L("Que fait-on du champ de travail entre deux clients ?", "What happens to the working field between two clients?"),
        [
          { text: L("On le remplace systématiquement", "It is replaced every time"), correct: true },
          { text: L("On l’essuie avec une lingette", "It is wiped with a cloth") },
          { text: L("On le retourne", "It is turned over") },
          { text: L("On le garde s’il paraît propre", "It is kept if it looks clean") },
        ],
        L("Exact ! Le champ est jetable et se change à chaque client.", "Correct! The field is disposable and changes with every client."),
        L("Pas tout à fait. Un champ jetable ne se nettoie pas : il se remplace.", "Not quite. A disposable field is not cleaned — it is replaced."),
      ),
      question(
        "q-pro-1-5",
        L("Un instrument posé en zone sale peut-il revenir en zone propre ?", "Can an instrument placed in the dirty zone go back to the clean zone?"),
        [
          { text: L("Non, jamais avant restérilisation", "No, never before re-sterilisation"), correct: true },
          { text: L("Oui, s’il n’a pas touché la bouche", "Yes, if it has not touched the mouth") },
          { text: L("Oui, pendant la même séance", "Yes, during the same session") },
          { text: L("Oui, après un passage sous l’eau", "Yes, after a rinse under water") },
        ],
        L("Exact ! Le sens de circulation ne s’inverse jamais.", "Correct! The direction of travel is never reversed."),
        L("Pas tout à fait. Le trajet propre → sale est à sens unique, sans exception de durée.", "Not quite. The clean → dirty path is one-way, with no exception for how long it has been."),
      ),
    ],
  ),
};

const PRO_MODULE_2: Module = {
  id: "m-pro-2",
  title: L("Techniques de pose", "Application techniques"),
  description: L(
    "Le protocole complet, du mordançage au contrôle final, avec les repères de temps qui font tenir une pose.",
    "The full protocol, from etching to the final inspection, with the timings that make an application last.",
  ),
  cover: media("med-09"),
  objectives: [
    L("Réaliser un mordançage calibré de 20 à 30 secondes.", "Perform a calibrated 20 to 30 second etch."),
    L("Doser l’adhésif sans excédent sur la gencive.", "Dose adhesive without excess reaching the gum."),
    L("Polymériser en deux temps et contrôler la tenue.", "Cure in two stages and check the hold."),
  ],
  steps: [
    step(
      "s-pro-2-1",
      L("Préparation de la dent", "Tooth preparation"),
      L("Nettoyage, isolation et mordançage.", "Cleaning, isolation and etching."),
      14,
      [
        text(
          "b-pro-2-1-1",
          "<h3>Isoler avant tout</h3><p>Une dent qui reste humide ne collera pas. Écarteur, rouleaux de coton, aspiration : l’isolation se met en place avant le premier geste, pas pendant.</p>",
          "<h3>Isolate first</h3><p>A tooth that stays wet will not bond. Retractor, cotton rolls, suction: isolation goes in before the first move, not during it.</p>",
        ),
        video(
          "b-pro-2-1-2",
          "med-09",
          L("Mordançage pas à pas", "Etching step by step"),
          "08:30",
          L("Vue rapprochée du gel appliqué puis rincé.", "Close-up of the gel being applied and rinsed."),
        ),
        text(
          "b-pro-2-1-3",
          "<p>Le gel reste en place <strong>20 à 30 secondes</strong>, jamais davantage. Rincez abondamment, puis séchez : l’émail correctement mordancé prend un aspect crayeux, mat et uniforme. S’il brille encore, recommencez.</p>",
          "<p>The gel stays on for <strong>20 to 30 seconds</strong>, never longer. Rinse thoroughly, then dry: correctly etched enamel turns chalky, matte and even. If it still shines, start again.</p>",
        ),
        image(
          "b-pro-2-1-4",
          "med-09",
          L("Émail mordancé, aspect crayeux uniforme.", "Etched enamel with an even, chalky surface."),
          L("L’aspect à obtenir avant d’appliquer l’adhésif.", "The look to reach before applying adhesive."),
        ),
      ],
    ),
    step(
      "s-pro-2-2",
      L("Application de l’adhésif", "Adhesive application"),
      L("Quantité, placement et premier passage de lampe.", "Quantity, placement and the first lamp pass."),
      11,
      [
        text(
          "b-pro-2-2-1",
          "<h3>Moins, mais mieux placé</h3><p>Une goutte de la taille d’une tête d’épingle suffit. L’excédent migre vers la gencive, durcit, et devient un piège à plaque que le client sentira avec la langue dès le lendemain.</p>",
          "<h3>Less, better placed</h3><p>A drop the size of a pinhead is enough. Excess migrates towards the gum, hardens, and becomes a plaque trap the client will feel with their tongue by the next day.</p>",
        ),
        image(
          "b-pro-2-2-2",
          "med-10",
          L("Lampe de polymérisation positionnée face à la dent.", "Curing lamp positioned facing the tooth."),
          L("La lampe reste perpendiculaire à la surface.", "The lamp stays perpendicular to the surface."),
        ),
        text(
          "b-pro-2-2-3",
          "<p>Premier passage de lampe : <strong>10 secondes</strong>, uniquement pour figer la position. Le durcissement complet viendra après le placement du cristal.</p>",
          "<p>First lamp pass: <strong>10 seconds</strong>, only to lock the position. Full curing comes after the crystal is placed.</p>",
        ),
      ],
    ),
    step(
      "s-pro-2-3",
      L("Placement du cristal", "Crystal placement"),
      L("Poser, orienter, polymériser et contrôler.", "Place, orient, cure and inspect."),
      13,
      [
        text(
          "b-pro-2-3-1",
          "<h3>Le geste qui compte</h3><p>Le cristal se dépose, il ne s’enfonce pas. Une pression excessive chasse l’adhésif sur les bords et laisse un dos mal soutenu.</p>",
          "<h3>The move that matters</h3><p>The crystal is set down, not pressed in. Too much pressure squeezes the adhesive out at the edges and leaves the back unsupported.</p>",
        ),
        video(
          "b-pro-2-3-2",
          "med-01",
          L("Pose et orientation du cristal", "Placing and orienting the crystal"),
          "09:55",
          L("Trois poses filmées à la même échelle.", "Three applications filmed at the same scale."),
        ),
        text(
          "b-pro-2-3-3",
          "<p>Polymérisation finale : <strong>20 secondes par face accessible</strong>. Contrôlez ensuite au miroir et à la sonde — sans forcer. Une gem correctement posée ne bouge pas et ne présente aucun rebord d’adhésif perceptible.</p>",
          "<p>Final cure: <strong>20 seconds per accessible face</strong>. Then check with mirror and probe — without forcing. A correctly applied gem does not move and leaves no adhesive ridge you can feel.</p>",
        ),
        image(
          "b-pro-2-3-4",
          "med-04",
          L("Contrôle de la gem après polymérisation.", "Checking the gem after curing."),
          L("Le contrôle final se fait toujours à sec.", "The final check is always done on a dry field."),
        ),
      ],
    ),
  ],
  quiz: quiz(
    "qz-pro-2",
    L("Point de connaissances", "Knowledge check"),
    L("Cinq questions sur le protocole de pose.", "Five questions on the application protocol."),
    [
      question(
        "q-pro-2-1",
        L("Combien de temps le gel de mordançage reste-t-il en place ?", "How long does the etching gel stay on?"),
        [
          { text: L("20 à 30 secondes", "20 to 30 seconds"), correct: true },
          { text: L("5 secondes", "5 seconds") },
          { text: L("2 minutes", "2 minutes") },
          { text: L("Jusqu’à ce que la dent brille", "Until the tooth shines") },
        ],
        L("Exact ! Au-delà, le mordançage attaque l’émail inutilement.", "Correct! Beyond that, etching attacks the enamel for nothing."),
        L("Pas tout à fait. Le repère est de 20 à 30 secondes, puis rinçage abondant.", "Not quite. The window is 20 to 30 seconds, followed by a thorough rinse."),
      ),
      question(
        "q-pro-2-2",
        L("À quoi reconnaît-on un émail correctement mordancé ?", "How do you recognise correctly etched enamel?"),
        [
          { text: L("Il est mat et crayeux", "It is matte and chalky"), correct: true },
          { text: L("Il est brillant", "It is shiny") },
          { text: L("Il est jaune", "It is yellow") },
          { text: L("Il est translucide", "It is translucent") },
        ],
        L("Exact ! L’aspect crayeux signale une surface prête à recevoir l’adhésif.", "Correct! The chalky look signals a surface ready for adhesive."),
        L("Pas tout à fait. Un émail encore brillant n’a pas été mordancé assez longtemps.", "Not quite. Enamel that still shines has not been etched long enough."),
      ),
      question(
        "q-pro-2-3",
        L("Quelle quantité d’adhésif faut-il déposer ?", "How much adhesive should be applied?"),
        [
          { text: L("Une goutte de la taille d’une tête d’épingle", "A drop the size of a pinhead"), correct: true },
          { text: L("Assez pour couvrir toute la dent", "Enough to cover the whole tooth") },
          { text: L("Deux gouttes bien étalées", "Two well-spread drops") },
          { text: L("Le moins possible, presque rien", "As little as possible, almost nothing") },
        ],
        L("Exact ! Cette quantité suffit et évite les excédents en bord de gencive.", "Correct! That amount is enough and avoids excess at the gum line."),
        L("Pas tout à fait. L’excédent durcit en bord de gencive et devient un piège à plaque.", "Not quite. Excess hardens at the gum line and becomes a plaque trap."),
        L("L’étape « Erreurs fréquentes » du module 03 montre les conséquences d’un excédent.", "The “Common mistakes” step in module 03 shows what excess leads to."),
      ),
      question(
        "q-pro-2-4",
        L("Comment se déroule la polymérisation ?", "How is curing carried out?"),
        [
          { text: L("En deux temps : 10 s puis 20 s par face", "In two stages: 10 s, then 20 s per face"), correct: true },
          { text: L("En une seule fois, 5 secondes", "In one go, 5 seconds") },
          { text: L("En trois passages de 30 secondes", "In three 30-second passes") },
          { text: L("Sans lampe, à l’air libre", "Without a lamp, in open air") },
        ],
        L("Exact ! Le premier passage fige la position, le second assure la tenue.", "Correct! The first pass locks the position, the second secures the hold."),
        L("Pas tout à fait. Le protocole est en deux temps : 10 secondes, puis 20 secondes par face accessible.", "Not quite. The protocol has two stages: 10 seconds, then 20 seconds per accessible face."),
      ),
      question(
        "q-pro-2-5",
        L("Comment dépose-t-on le cristal sur l’adhésif ?", "How is the crystal set onto the adhesive?"),
        [
          { text: L("On le dépose sans appuyer", "It is set down without pressing"), correct: true },
          { text: L("On l’enfonce fermement", "It is pressed in firmly") },
          { text: L("On le fait glisser en place", "It is slid into place") },
          { text: L("On le maintient à la pince pendant la pose", "It is held with pliers throughout") },
        ],
        L("Exact ! Une pression excessive chasse l’adhésif et fragilise le dos de la gem.", "Correct! Too much pressure squeezes out adhesive and leaves the gem's back unsupported."),
        L("Pas tout à fait. Le cristal se dépose : la pression chasse l’adhésif sur les bords.", "Not quite. The crystal is set down — pressure pushes the adhesive out to the edges."),
      ),
    ],
  ),
};

const PRO_MODULE_3: Module = {
  id: "m-pro-3",
  title: L("Suivi et pratique professionnelle", "Aftercare & professional practice"),
  description: L(
    "Ce qui se passe après la pose : consignes au client, erreurs à corriger et qualité de l’expérience en studio.",
    "What happens after the application: client instructions, mistakes to correct and the quality of the studio experience.",
  ),
  cover: media("med-05"),
  objectives: [
    L("Formuler des consignes de suivi claires et écrites.", "Give clear, written aftercare instructions."),
    L("Identifier les quatre causes de décollement les plus fréquentes.", "Identify the four most common causes of a gem coming off."),
    L("Structurer un rendez-vous de A à Z.", "Structure an appointment from start to finish."),
  ],
  steps: [
    step(
      "s-pro-3-1",
      L("Consignes de suivi", "Aftercare instructions"),
      L("Les 48 premières heures et l’entretien courant.", "The first 48 hours and everyday care."),
      8,
      [
        text(
          "b-pro-3-1-1",
          "<h3>Les 48 premières heures</h3><p>Pas d’aliments durs, pas de brossage agressif sur la zone, et surtout : ne pas jouer avec la gem. La majorité des décollements précoces vient de la langue, pas de l’alimentation.</p>",
          "<h3>The first 48 hours</h3><p>No hard food, no aggressive brushing over the area, and above all: do not play with the gem. Most early failures come from the tongue, not from food.</p>",
        ),
        image(
          "b-pro-3-1-2",
          "med-05",
          L("Gem intacte une semaine après la pose.", "Gem intact one week after application."),
          L("Résultat à une semaine, entretien courant respecté.", "Result at one week with normal care followed."),
        ),
        text(
          "b-pro-3-1-3",
          "<p>Remettez toujours les consignes <strong>par écrit</strong>. Un client qui repart avec une carte de suivi revient pour un contrôle, pas pour une réclamation.</p>",
          "<p>Always hand over the instructions <strong>in writing</strong>. A client who leaves with an aftercare card comes back for a check-up, not a complaint.</p>",
        ),
      ],
    ),
    step(
      "s-pro-3-2",
      L("Erreurs fréquentes", "Common mistakes"),
      L("Quatre causes de décollement et leur correction.", "Four causes of failure and how to correct them."),
      10,
      [
        text(
          "b-pro-3-2-1",
          "<h3>Quatre causes, quatre corrections</h3><ul><li><strong>Isolation insuffisante</strong> — la salive revient pendant le collage.</li><li><strong>Mordançage trop court</strong> — l’émail reste brillant.</li><li><strong>Excès d’adhésif</strong> — la gem se décolle par le bord.</li><li><strong>Polymérisation partielle</strong> — une face reste molle.</li></ul>",
          "<h3>Four causes, four corrections</h3><ul><li><strong>Poor isolation</strong> — saliva returns during bonding.</li><li><strong>Etch too short</strong> — the enamel stays shiny.</li><li><strong>Excess adhesive</strong> — the gem lifts from the edge.</li><li><strong>Partial curing</strong> — one face stays soft.</li></ul>",
        ),
        video(
          "b-pro-3-2-2",
          "med-03",
          L("Reprise d’une pose ratée", "Reworking a failed application"),
          "07:24",
          L("Dépose, nettoyage et nouvelle pose sur dent latérale.", "Removal, cleaning and reapplication on a lateral tooth."),
        ),
        text(
          "b-pro-3-2-3",
          "<p>Une reprise est gratuite dans les quinze jours. C’est une règle commerciale, mais c’est surtout un retour d’information : notez systématiquement la cause identifiée.</p>",
          "<p>A rework is free within fifteen days. That is a commercial rule, but above all it is feedback: always write down the cause you identified.</p>",
        ),
      ],
    ),
    step(
      "s-pro-3-3",
      L("Expérience client", "Client experience"),
      L("Consentement, photo et prise de rendez-vous.", "Consent, photography and booking."),
      9,
      [
        text(
          "b-pro-3-3-1",
          "<h3>Le rendez-vous, de A à Z</h3><p>Accueil, consentement signé, choix de la gem devant miroir, pose, photo avant/après, remise de la carte de suivi. Six moments, toujours dans le même ordre.</p>",
          "<h3>The appointment, end to end</h3><p>Welcome, signed consent, gem chosen in front of the mirror, application, before/after photo, aftercare card. Six moments, always in the same order.</p>",
        ),
        image(
          "b-pro-3-3-2",
          "med-11",
          L("Fiche de consentement remplie et signée.", "Completed and signed consent form."),
          L("La fiche est conservée, le client en reçoit une copie.", "The form is filed; the client receives a copy."),
        ),
        text(
          "b-pro-3-3-3",
          "<p>La photo avant/après se prend dans les mêmes conditions d’éclairage, à la même distance. C’est votre portfolio, et c’est aussi votre preuve en cas de litige.</p>",
          "<p>Take the before/after photo under the same lighting, at the same distance. It is your portfolio, and it is also your evidence if a dispute arises.</p>",
        ),
      ],
    ),
  ],
  quiz: quiz(
    "qz-pro-3",
    L("Point de connaissances", "Knowledge check"),
    L("Cinq questions sur le suivi et la pratique en studio.", "Five questions on aftercare and studio practice."),
    [
      question(
        "q-pro-3-1",
        L("Quelle est la cause la plus fréquente d’un décollement précoce ?", "What most often causes an early failure?"),
        [
          { text: L("Le client joue avec la gem", "The client plays with the gem"), correct: true },
          { text: L("Le brossage du soir", "Evening brushing") },
          { text: L("Les boissons chaudes", "Hot drinks") },
          { text: L("Le sommeil", "Sleeping") },
        ],
        L("Exact ! La langue exerce une pression répétée que le collage ne supporte pas.", "Correct! The tongue applies a repeated pressure the bond cannot take."),
        L("Pas tout à fait. C’est la langue, et non l’alimentation, qui est en cause dans la plupart des cas.", "Not quite. In most cases it is the tongue, not food, that is responsible."),
      ),
      question(
        "q-pro-3-2",
        L("Sous quelle forme les consignes de suivi sont-elles remises ?", "In what form are aftercare instructions handed over?"),
        [
          { text: L("Par écrit, sur une carte de suivi", "In writing, on an aftercare card"), correct: true },
          { text: L("Oralement, en fin de séance", "Verbally, at the end of the session") },
          { text: L("Par message, le lendemain", "By message, the next day") },
          { text: L("Elles ne sont pas nécessaires", "They are not necessary") },
        ],
        L("Exact ! Une consigne écrite se relit ; une consigne orale s’oublie.", "Correct! A written instruction can be re-read; a spoken one is forgotten."),
        L("Pas tout à fait. Les consignes se remettent par écrit, à la fin du rendez-vous.", "Not quite. Instructions are handed over in writing, at the end of the appointment."),
      ),
      question(
        "q-pro-3-3",
        L("Un émail resté brillant après mordançage indique :", "Enamel still shiny after etching means:"),
        [
          { text: L("Un mordançage trop court", "The etch was too short"), correct: true },
          { text: L("Un mordançage réussi", "The etch worked") },
          { text: L("Un excès d’adhésif", "Too much adhesive") },
          { text: L("Une lampe défectueuse", "A faulty lamp") },
        ],
        L("Exact ! Il faut reprendre le mordançage avant d’aller plus loin.", "Correct! Etch again before going any further."),
        L("Pas tout à fait. L’émail prêt est mat et crayeux, jamais brillant.", "Not quite. Ready enamel is matte and chalky, never shiny."),
      ),
      question(
        "q-pro-3-4",
        L("Dans quel délai une reprise est-elle offerte ?", "Within what period is a rework offered free?"),
        [
          { text: L("Quinze jours", "Fifteen days"), correct: true },
          { text: L("Quarante-huit heures", "Forty-eight hours") },
          { text: L("Trois mois", "Three months") },
          { text: L("Il n’y a pas de reprise", "There is no rework") },
        ],
        L("Exact ! Quinze jours, et la cause identifiée est notée à chaque fois.", "Correct! Fifteen days, and the identified cause is recorded every time."),
        L("Pas tout à fait. Le délai retenu en studio est de quinze jours.", "Not quite. The period used in the studio is fifteen days."),
      ),
      question(
        "q-pro-3-5",
        L("Quand la fiche de consentement est-elle signée ?", "When is the consent form signed?"),
        [
          { text: L("Avant la pose, à l’accueil", "Before the application, at welcome"), correct: true },
          { text: L("Après la pose", "After the application") },
          { text: L("À la première réclamation", "At the first complaint") },
          { text: L("Uniquement pour les mineurs", "Only for minors") },
        ],
        L("Exact ! Le consentement précède systématiquement le premier geste.", "Correct! Consent always comes before the first move."),
        L("Pas tout à fait. La fiche se signe à l’accueil, avant toute intervention.", "Not quite. The form is signed at welcome, before any work begins."),
      ),
    ],
  ),
};

/* -------------------------------------------------------------------------- */
/* Supporting courses                                                          */
/* -------------------------------------------------------------------------- */

const FUND_MODULE_1: Module = {
  id: "m-fund-1",
  title: L("Découvrir le tooth gem", "Discovering tooth gems"),
  description: L(
    "Ce qu’est une tooth gem, ce qu’elle n’est pas, et pourquoi la pose est réversible.",
    "What a tooth gem is, what it is not, and why the application is reversible.",
  ),
  cover: media("med-01"),
  objectives: [
    L("Expliquer le principe du collage réversible.", "Explain how the reversible bond works."),
    L("Répondre aux cinq questions les plus posées.", "Answer the five most common questions."),
  ],
  steps: [
    step(
      "s-fund-1-1",
      L("Qu’est-ce qu’une tooth gem ?", "What is a tooth gem?"),
      L("Principe, durée de vie et réversibilité.", "Principle, lifespan and reversibility."),
      7,
      [
        text(
          "b-fund-1-1-1",
          "<h3>Un bijou collé, rien de plus</h3><p>La gem est fixée à l’émail avec un adhésif dentaire. Rien n’est percé, rien n’est limé, et la dépose ne laisse aucune trace.</p>",
          "<h3>A glued ornament, nothing more</h3><p>The gem is fixed to the enamel with dental adhesive. Nothing is drilled, nothing is filed, and removal leaves no trace.</p>",
        ),
        image(
          "b-fund-1-1-2",
          "med-01",
          L("Sourire avec une gem posée sur l’incisive latérale.", "Smile with a gem on the lateral incisor."),
          L("Une pose simple, la plus demandée en studio.", "A single application, the most requested in studio."),
        ),
      ],
    ),
    step(
      "s-fund-1-2",
      L("Choisir sa première gem", "Choosing your first gem"),
      L("Taille, couleur et position selon la dent.", "Size, colour and position by tooth."),
      9,
      [
        text(
          "b-fund-1-2-1",
          "<p>Sur une incisive latérale, une taille <strong>SS5</strong> reste discrète ; <strong>SS7</strong> est déjà très visible. Faites toujours essayer avant de coller.</p>",
          "<p>On a lateral incisor, an <strong>SS5</strong> stays discreet; <strong>SS7</strong> is already very visible. Always try before bonding.</p>",
        ),
        video(
          "b-fund-1-2-2",
          "med-08",
          L("Tailles et couleurs en main", "Sizes and colours in hand"),
          "05:10",
          L("Comparaison de six tailles sur la même dent.", "Six sizes compared on the same tooth."),
        ),
      ],
    ),
  ],
  quiz: quiz(
    "qz-fund-1",
    L("Point de connaissances", "Knowledge check"),
    L("Deux questions pour valider les bases.", "Two questions to confirm the basics."),
    [
      question(
        "q-fund-1-1",
        L("La pose d’une tooth gem est-elle réversible ?", "Is applying a tooth gem reversible?"),
        [
          { text: L("Oui, sans trace sur l’émail", "Yes, with no mark on the enamel"), correct: true },
          { text: L("Non, la dent est percée", "No, the tooth is drilled") },
          { text: L("Oui, mais la dent est limée", "Yes, but the tooth is filed") },
        ],
        L("Exact ! Le collage est conçu pour être retiré proprement.", "Correct! The bond is designed to be removed cleanly."),
        L("Pas tout à fait. Rien n’est percé ni limé : la gem est simplement collée.", "Not quite. Nothing is drilled or filed — the gem is simply bonded."),
      ),
      question(
        "q-fund-1-2",
        L("Quelle taille reste discrète sur une incisive latérale ?", "Which size stays discreet on a lateral incisor?"),
        [
          { text: L("SS5", "SS5"), correct: true },
          { text: L("SS7", "SS7") },
          { text: L("SS12", "SS12") },
        ],
        L("Exact ! SS5 est la taille d’entrée la plus demandée.", "Correct! SS5 is the most requested entry size."),
        L("Pas tout à fait. Au-delà de SS5, la gem devient nettement visible.", "Not quite. Above SS5 the gem becomes clearly visible."),
      ),
    ],
  ),
};

const FUND_MODULE_2: Module = {
  id: "m-fund-2",
  title: L("Poser sa première gem", "Applying your first gem"),
  description: L("Le protocole raccourci, pour une pose simple sur dent antérieure.", "The short protocol, for a single application on a front tooth."),
  cover: media("med-02"),
  objectives: [L("Réaliser une pose simple en autonomie.", "Complete a single application unaided.")],
  steps: [
    step(
      "s-fund-2-1",
      L("Le protocole en six gestes", "The protocol in six moves"),
      L("De l’isolation au contrôle final.", "From isolation to the final check."),
      12,
      [
        text(
          "b-fund-2-1-1",
          "<h3>Six gestes, dans l’ordre</h3><ol><li>Isoler</li><li>Mordancer</li><li>Rincer et sécher</li><li>Adhésif</li><li>Cristal</li><li>Polymériser</li></ol><p>Aucun de ces gestes ne se saute, même pour une pose « rapide ».</p>",
          "<h3>Six moves, in order</h3><ol><li>Isolate</li><li>Etch</li><li>Rinse and dry</li><li>Adhesive</li><li>Crystal</li><li>Cure</li></ol><p>None of these is skipped, not even for a “quick” application.</p>",
        ),
        image(
          "b-fund-2-1-3",
          "med-02",
          L("Composition de deux gems sur incisives.", "Two-gem composition on the incisors."),
          L("Une fois la pose simple acquise, la composition suit.", "Once the single application is mastered, composition follows."),
        ),
      ],
    ),
  ],
  quiz: null,
};

const HYG_MODULE_1: Module = {
  id: "m-hyg-1",
  title: L("Protocole de stérilisation", "Sterilisation protocol"),
  description: L("Ce qui se stérilise, ce qui se jette, et ce qui se trace.", "What is sterilised, what is discarded, and what is recorded."),
  cover: media("med-06"),
  objectives: [
    L("Distinguer usage unique et instrument stérilisable.", "Tell single-use apart from sterilisable instruments."),
    L("Tenir un registre de stérilisation exploitable.", "Keep a usable sterilisation log."),
  ],
  steps: [
    step(
      "s-hyg-1-1",
      L("Usage unique et réutilisable", "Single-use and reusable"),
      L("Le tri, avant même le nettoyage.", "Sorting, before cleaning even starts."),
      10,
      [
        text(
          "b-hyg-1-1-1",
          "<h3>Trier d’abord</h3><p>Tout ce qui touche la salive et ne passe pas l’autoclave est à usage unique. La question se tranche à l’achat, pas en fin de journée.</p>",
          "<h3>Sort first</h3><p>Anything that touches saliva and cannot go through an autoclave is single-use. That decision is made at purchase, not at the end of the day.</p>",
        ),
        image(
          "b-hyg-1-1-2",
          "med-06",
          L("", ""),
          L("Plateau après tri, avant mise en sachet.", "Tray after sorting, before pouching."),
        ),
      ],
    ),
    step(
      "s-hyg-1-2",
      L("Registre et traçabilité", "Log and traceability"),
      L("Ce qu’un contrôle attend de vous.", "What an inspection expects from you."),
      8,
      [
        text(
          "b-hyg-1-2-1",
          "<p>Chaque cycle d’autoclave est consigné : date, charge, indicateur de passage. Un registre tenu est la seule preuve recevable.</p>",
          "<p>Every autoclave cycle is logged: date, load, process indicator. A maintained log is the only acceptable evidence.</p>",
        ),
      ],
    ),
  ],
  quiz: quiz(
    "qz-hyg-1",
    L("Point de connaissances", "Knowledge check"),
    L("Deux questions sur la stérilisation.", "Two questions on sterilisation."),
    [
      question(
        "q-hyg-1-1",
        L("Qu’est-ce qui détermine l’usage unique ?", "What determines single-use?"),
        [
          { text: L("L’impossibilité de passer l’autoclave", "It cannot go through an autoclave"), correct: true },
          { text: L("Le prix de l’instrument", "The price of the instrument") },
          { text: L("La couleur du manche", "The colour of the handle") },
        ],
        L("Exact ! Si l’autoclave est impossible, l’instrument est jetable.", "Correct! If the autoclave is impossible, the instrument is disposable."),
        L("Pas tout à fait. C’est la compatibilité avec l’autoclave qui tranche.", "Not quite. Autoclave compatibility is what decides."),
      ),
      question(
        "q-hyg-1-2",
        L("Que consigne-t-on pour chaque cycle ?", "What is logged for each cycle?"),
        [
          { text: L("Date, charge et indicateur de passage", "Date, load and process indicator"), correct: true },
          { text: L("Uniquement la date", "The date only") },
          { text: L("Rien, le cycle suffit", "Nothing — the cycle itself is enough") },
        ],
        L("Exact ! Les trois informations forment la preuve.", "Correct! Those three details together form the evidence."),
        L("Pas tout à fait. Une date seule ne prouve pas qu’un cycle a abouti.", "Not quite. A date alone does not prove a cycle completed."),
      ),
    ],
  ),
};

const HYG_MODULE_2: Module = {
  id: "m-hyg-2",
  title: L("Gérer un incident", "Handling an incident"),
  description: L("Coupure, allergie, ingestion : les trois situations à préparer.", "Cut, allergy, swallowing: the three situations to prepare for."),
  cover: media("med-04"),
  objectives: [L("Appliquer la conduite à tenir sans improviser.", "Follow the set procedure without improvising.")],
  steps: [
    step(
      "s-hyg-2-1",
      L("Conduite à tenir", "What to do"),
      L("Trois incidents, trois protocoles écrits.", "Three incidents, three written protocols."),
      11,
      [
        text(
          "b-hyg-2-1-1",
          "<h3>Préparé, pas improvisé</h3><p>Une gem avalée est presque toujours sans gravité, mais l’information se donne calmement et par écrit. Les protocoles sont affichés au poste, pas cherchés dans un téléphone.</p>",
          "<h3>Prepared, not improvised</h3><p>A swallowed gem is almost always harmless, but the information is given calmly and in writing. Protocols are posted at the station, not looked up on a phone.</p>",
        ),
      ],
    ),
  ],
  // Deliberately left without a knowledge check, so the readiness screen has a
  // real warning to report rather than a decorative one.
  quiz: null,
};

const CREA_MODULE_1: Module = {
  id: "m-crea-1",
  title: L("Composer une constellation", "Composing a constellation"),
  description: L("Équilibre, rythme et lisibilité d’une composition multi-gems.", "Balance, rhythm and readability in a multi-gem composition."),
  cover: media("med-02"),
  objectives: [L("Composer un motif équilibré sur deux dents.", "Compose a balanced motif across two teeth.")],
  steps: [
    step(
      "s-crea-1-1",
      L("Règles de composition", "Composition rules"),
      L("Trois principes qui tiennent à l’échelle d’un sourire.", "Three principles that hold at the scale of a smile."),
      10,
      [
        text(
          "b-crea-1-1-1",
          "<h3>Impair, asymétrique, orienté</h3><p>Un nombre impair de gems se lit mieux qu’un nombre pair. L’asymétrie évite l’effet « alignement ». L’orientation suit la courbe naturelle du sourire, jamais l’horizontale.</p>",
          "<h3>Odd, asymmetric, oriented</h3><p>An odd number of gems reads better than an even one. Asymmetry avoids the “row of teeth” effect. Orientation follows the natural curve of the smile, never the horizontal.</p>",
        ),
        image(
          "b-crea-1-1-2",
          "med-02",
          L("Composition asymétrique de trois gems.", "Asymmetric three-gem composition."),
          L("Trois gems, deux dents, une seule ligne de lecture.", "Three gems, two teeth, one reading line."),
        ),
      ],
    ),
  ],
  quiz: null,
};

/* -------------------------------------------------------------------------- */
/* Courses                                                                     */
/* -------------------------------------------------------------------------- */

export const TRAINING_COURSES: TrainingCourse[] = [
  {
    id: "pose-professionnelle",
    title: L("Pose professionnelle de tooth gems", "Professional Tooth Gem Application"),
    shortDescription: L(
      "Le protocole complet, de la préparation de l’émail au suivi client.",
      "The complete protocol, from enamel preparation to client aftercare.",
    ),
    fullDescription: L(
      "La formation de référence du studio. Trois modules couvrent les fondations du métier, le protocole de pose dans le détail, puis le suivi et la pratique professionnelle. Chaque module se termine par un point de connaissances de cinq questions, avec une explication pour chaque réponse.",
      "The studio's reference course. Three modules cover the foundations of the craft, the application protocol in detail, then aftercare and professional practice. Each module ends with a five-question knowledge check, with an explanation for every answer.",
    ),
    cover: media("med-09"),
    category: "technique",
    level: "intermediate",
    duration: 92,
    instructorId: "ins-camille",
    objectives: [
      L("Poser une gem durable sans abîmer l’émail.", "Apply a lasting gem without damaging enamel."),
      L("Diagnostiquer et corriger une pose ratée.", "Diagnose and correct a failed application."),
      L("Conduire un rendez-vous complet en autonomie.", "Run a full appointment unaided."),
    ],
    requirements: [
      L("Avoir suivi « Fondamentaux du tooth gem » ou disposer d’une expérience équivalente.", "Have completed “Tooth Gems Fundamentals” or have equivalent experience."),
      L("Disposer d’un poste de travail et d’une lampe de polymérisation.", "Have a workstation and a curing lamp available."),
    ],
    completion: { allSteps: true, allQuizzes: true, minScore: 70, certificate: true },
    status: "published",
    createdAt: "2026-03-04T09:12:00.000Z",
    updatedAt: "2026-09-11T14:32:00.000Z",
    completionRate: 78,
    enrolled: 412,
    modules: [PRO_MODULE_1, PRO_MODULE_2, PRO_MODULE_3],
  },
  {
    id: "fondamentaux",
    title: L("Fondamentaux du tooth gem", "Tooth Gems Fundamentals"),
    shortDescription: L(
      "Le point de départ : comprendre, choisir et poser une première gem.",
      "The starting point: understanding, choosing and applying a first gem.",
    ),
    fullDescription: L(
      "Une entrée en matière courte, pensée pour les artistes qui découvrent la pratique. On y explique ce qu’est une tooth gem, comment choisir taille et couleur, et comment réaliser une première pose simple en toute sécurité.",
      "A short introduction, written for artists discovering the practice. It explains what a tooth gem is, how to choose size and colour, and how to complete a safe first application.",
    ),
    cover: media("med-01"),
    category: "technique",
    level: "beginner",
    duration: 28,
    instructorId: "ins-sofia",
    objectives: [
      L("Expliquer la pose à un client en une minute.", "Explain the application to a client in one minute."),
      L("Réaliser une pose simple sur dent antérieure.", "Complete a single application on a front tooth."),
    ],
    requirements: [L("Aucun prérequis.", "No prerequisites.")],
    completion: { allSteps: true, allQuizzes: true, minScore: 60, certificate: true },
    status: "published",
    createdAt: "2026-01-16T10:40:00.000Z",
    updatedAt: "2026-08-29T11:05:00.000Z",
    completionRate: 91,
    enrolled: 738,
    modules: [FUND_MODULE_1, FUND_MODULE_2],
  },
  {
    id: "cristaux-charms",
    title: L("Techniques avancées cristaux et charms", "Advanced Crystal & Charm Techniques"),
    shortDescription: L(
      "Compositions multi-gems, charms articulés et dents latérales.",
      "Multi-gem compositions, articulated charms and lateral teeth.",
    ),
    fullDescription: L(
      "Pour les artistes qui maîtrisent la pose simple et veulent aller plus loin : surfaces bombées, charms suspendus, zones difficiles d’accès et corrections de compositions existantes.",
      "For artists who have mastered the single application and want to go further: curved surfaces, hanging charms, hard-to-reach areas and corrections to existing compositions.",
    ),
    cover: media("med-03"),
    category: "technique",
    level: "advanced",
    duration: 46,
    instructorId: "ins-sofia",
    objectives: [L("Poser un charm sur surface bombée.", "Apply a charm to a curved surface.")],
    requirements: [L("Formation « Pose professionnelle » validée.", "“Professional Application” completed.")],
    completion: { allSteps: true, allQuizzes: false, minScore: 70, certificate: false },
    status: "review",
    createdAt: "2026-06-22T08:55:00.000Z",
    updatedAt: "2026-09-16T16:48:00.000Z",
    completionRate: 0,
    enrolled: 0,
    modules: [CREA_MODULE_1],
  },
  {
    id: "hygiene-securite",
    title: L("Hygiène, sécurité et suivi", "Hygiene, Safety & Aftercare"),
    shortDescription: L(
      "Stérilisation, traçabilité et conduite à tenir en cas d’incident.",
      "Sterilisation, traceability and what to do when an incident happens.",
    ),
    fullDescription: L(
      "Le module réglementaire du studio, à jour des recommandations en vigueur. Il couvre le tri du matériel, le registre de stérilisation et les trois incidents à préparer à l’avance.",
      "The studio's regulatory module, aligned with current recommendations. It covers equipment sorting, the sterilisation log and the three incidents to prepare for in advance.",
    ),
    cover: media("med-06"),
    category: "hygiene",
    level: "all",
    duration: 29,
    instructorId: "ins-lena",
    objectives: [
      L("Tenir un registre de stérilisation conforme.", "Keep a compliant sterilisation log."),
      L("Réagir à un incident sans improviser.", "React to an incident without improvising."),
    ],
    requirements: [L("Aucun prérequis.", "No prerequisites.")],
    completion: { allSteps: true, allQuizzes: true, minScore: 80, certificate: true },
    status: "unpublished",
    createdAt: "2025-11-08T13:20:00.000Z",
    updatedAt: "2026-09-02T09:14:00.000Z",
    completionRate: 64,
    enrolled: 287,
    modules: [HYG_MODULE_1, HYG_MODULE_2],
  },
  {
    id: "design-creatif",
    title: L("Design créatif tooth gem", "Creative Tooth Gem Design"),
    shortDescription: L(
      "Composition, couleur et signature artistique. Formation en cours d’écriture.",
      "Composition, colour and artistic signature. Course still being written.",
    ),
    fullDescription: L(
      "Une formation en préparation, consacrée à la direction artistique d’une pose : équilibre des compositions, harmonies de couleurs et construction d’une signature reconnaissable.",
      "A course in preparation, devoted to the art direction of an application: balanced compositions, colour harmonies and building a recognisable signature.",
    ),
    cover: media("med-02"),
    category: "creative",
    level: "intermediate",
    duration: 0,
    instructorId: "ins-noor",
    objectives: [],
    requirements: [],
    completion: { allSteps: true, allQuizzes: false, minScore: 70, certificate: false },
    status: "draft",
    createdAt: "2026-09-15T15:02:00.000Z",
    updatedAt: "2026-09-17T10:26:00.000Z",
    completionRate: 0,
    enrolled: 0,
    // No modules: the builder's empty state has to be reachable from the list.
    modules: [],
  },
];
