// Generated from webapp/src/i18n/locales/{fr,en}.json (`documents`) by webapp/scripts/sync-documents.mjs.

/** The documents' strings, by language, keyed like the webapp's i18n (`documents.invoice.title`…). */
export const DOCUMENT_MESSAGES = {
  "fr": {
    "documents": {
      "seller": "Vendeur",
      "page": "Page {{page}} sur {{count}}",
      "meta": {
        "reference": "Référence",
        "orderDate": "Commande du",
        "issuedOn": "Édité le",
        "order": "Commande"
      },
      "columns": {
        "item": "Article",
        "qty": "Qté",
        "unitPrice": "Prix unitaire",
        "discount": "Remise",
        "total": "Total",
        "date": "Date",
        "reason": "Motif",
        "status": "Statut",
        "amount": "Montant",
        "unitPriceExcl": "PU HT",
        "vatRate": "TVA",
        "totalExcl": "Total HT",
        "totalIncl": "Total TTC",
        "base": "Base HT",
        "vat": "Montant TVA"
      },
      "footer": {
        "capital": "au capital de {{amount}}",
        "registration": "Immatriculation {{number}}",
        "vat": "TVA intracommunautaire {{number}}"
      },
      "order": {
        "title": "Bon de commande",
        "fileName": "bon-de-commande",
        "notice": "Ce bon de commande récapitule votre commande telle qu’elle a été enregistrée. Il ne constitue pas une facture."
      },
      "invoice": {
        "title": "Facture",
        "number": "Facture n°",
        "issuedOn": "Date d’émission",
        "saleDate": "Date de la vente",
        "buyer": "Client",
        "shipping": "Livraison",
        "shippingNamed": "Livraison — {{method}}",
        "adjustment": "Remboursement",
        "giftCardVat": "hors champ de la TVA",
        "lineDiscount": "remise de {{amount}} TTC",
        "lineDiscountNoVat": "remise de {{amount}}",
        "totalExcl": "Total HT",
        "totalVat": "TVA",
        "totalIncl": "Total TTC",
        "total": "Total",
        "paidGiftCard": "Réglé en carte cadeau",
        "paidCard": "Réglé par carte",
        "vatTitle": "Récapitulatif de la TVA",
        "vatFranchise": "TVA non applicable, art. 293 B du CGI",
        "paid": "Facture acquittée le {{date}} : paiement comptant à la commande, aucun escompte pour paiement anticipé.",
        "giftCardNote": "Cartes cadeaux : bons à usages multiples, hors du champ de la TVA lors de leur achat ; la TVA est due lors de leur utilisation.",
        "latePayment": "Clients professionnels : en cas de retard de paiement, pénalités au taux de trois fois le taux d’intérêt légal et indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce).",
        "fileName": "facture",
        "studioPlan": "Abonnement Studio 3D — formule {{plan}}",
        "studioProration": "Ajustement au prorata — formule {{plan}}",
        "studioInterval": {
          "month": "facturation mensuelle",
          "year": "facturation annuelle"
        },
        "studioPeriod": "du {{start}} au {{end}}",
        "paidBalance": "Réglé avec le crédit de votre compte",
        "paidSubscription": "Facture acquittée le {{date}} : paiement de l’abonnement par carte, aucun escompte pour paiement anticipé."
      },
      "creditNote": {
        "title": "Avoir",
        "number": "Avoir n°",
        "credits": "Facture d’origine",
        "totalIncl": "Total de l’avoir TTC",
        "total": "Total de l’avoir",
        "notice": "Avoir émis sur la facture {{invoice}} du {{date}}, au titre du remboursement confirmé le {{refundedOn}}.",
        "toCard": "Le montant a été remboursé sur le moyen de paiement utilisé. Cet avoir est la pièce comptable de ce remboursement : il ne constitue pas un crédit à dépenser sur le site.",
        "toGiftCard": "Le montant a été recrédité sur la carte cadeau utilisée.",
        "fileName": "avoir",
        "studioWithdrawal": "Rétractation — part non utilisée de l’abonnement Studio 3D, formule {{plan}}",
        "studioUsedDays": "{{used}} jours utilisés sur {{total}}"
      }
    }
  },
  "en": {
    "documents": {
      "seller": "Seller",
      "page": "Page {{page}} of {{count}}",
      "meta": {
        "reference": "Reference",
        "orderDate": "Order date",
        "issuedOn": "Issued on",
        "order": "Order"
      },
      "columns": {
        "item": "Item",
        "qty": "Qty",
        "unitPrice": "Unit price",
        "discount": "Discount",
        "total": "Total",
        "date": "Date",
        "reason": "Reason",
        "status": "Status",
        "amount": "Amount",
        "unitPriceExcl": "Unit price excl. VAT",
        "vatRate": "VAT",
        "totalExcl": "Total excl. VAT",
        "totalIncl": "Total incl. VAT",
        "base": "Net amount",
        "vat": "VAT amount"
      },
      "footer": {
        "capital": "with a share capital of {{amount}}",
        "registration": "Registration {{number}}",
        "vat": "VAT number {{number}}"
      },
      "order": {
        "title": "Order form",
        "fileName": "order-form",
        "notice": "This order form summarises your order as it was recorded. It is not an invoice."
      },
      "invoice": {
        "title": "Invoice",
        "number": "Invoice no.",
        "issuedOn": "Issue date",
        "saleDate": "Date of sale",
        "buyer": "Customer",
        "shipping": "Shipping",
        "shippingNamed": "Shipping — {{method}}",
        "adjustment": "Refund",
        "giftCardVat": "outside the scope of VAT",
        "lineDiscount": "discount of {{amount}} incl. VAT",
        "lineDiscountNoVat": "discount of {{amount}}",
        "totalExcl": "Total excl. VAT",
        "totalVat": "VAT",
        "totalIncl": "Total incl. VAT",
        "total": "Total",
        "paidGiftCard": "Paid by gift card",
        "paidCard": "Paid by card",
        "vatTitle": "VAT summary",
        "vatFranchise": "TVA non applicable, art. 293 B du CGI (VAT not applicable, article 293 B of the French General Tax Code).",
        "paid": "Invoice paid on {{date}}: payment in full when ordering, no discount for early payment.",
        "giftCardNote": "Gift cards: multi-purpose vouchers, outside the scope of VAT when bought; VAT is due when they are used.",
        "latePayment": "Business customers: late payment incurs interest at three times the French legal rate and a fixed €40 recovery fee (French Commercial Code, art. L441-10).",
        "fileName": "invoice",
        "studioPlan": "3D Studio subscription — {{plan}} plan",
        "studioProration": "Prorated adjustment — {{plan}} plan",
        "studioInterval": {
          "month": "monthly billing",
          "year": "yearly billing"
        },
        "studioPeriod": "from {{start}} to {{end}}",
        "paidBalance": "Paid from your account credit",
        "paidSubscription": "Invoice paid on {{date}}: subscription paid by card, no discount for early payment."
      },
      "creditNote": {
        "title": "Credit note",
        "number": "Credit note no.",
        "credits": "Original invoice",
        "totalIncl": "Credit note total incl. VAT",
        "total": "Credit note total",
        "notice": "Credit note issued against invoice {{invoice}} of {{date}}, for the refund confirmed on {{refundedOn}}.",
        "toCard": "The amount was refunded to the payment method used. This credit note is the accounting document for that refund: it is not a credit to spend on the site.",
        "toGiftCard": "The amount was credited back to the gift card used.",
        "fileName": "credit-note",
        "studioWithdrawal": "Withdrawal — unused share of the 3D Studio subscription, {{plan}} plan",
        "studioUsedDays": "{{used}} of {{total}} days used"
      }
    }
  }
} as const;
