---
name: global-toothgems-mvp-requirements
description: Authoritative MVP scope and acceptance criteria for the Global Toothgems platform.
---

# Global Toothgems — MVP Requirements

## MVP objective

The MVP must be launchable as a real commercial platform with two connected pillars:

1. E-commerce for retail tooth-gem products.
2. Online training with at least one purchasable course.

The customer must use one account for both pillars.

## MUST HAVE — Store

### Catalog and products
- Product catalog.
- Product detail pages.
- Product pricing.
- Product availability/status.
- Product imagery.
- Product variants/options where required by the product model.
- Related products.
- FAQ/help content for the shop.
- Product links/content suitable for Instagram-driven discovery.

### Customer account
- Registration.
- Login/logout.
- Account management.
- Shared identity between store and training portal.
- Order history.
- Training purchases/access should be associated with the same customer account.

### Checkout
- Shopping cart.
- Checkout.
- Payment.
- Support for installment payment where the selected payment provider actually supports it.
- Order confirmation.
- Clear purchase state handling.

### Multilingual
- FR / EN / DE storefront support.
- Language selection.
- Localized customer-facing content.

### Reviews
- Product reviews.
- Optional customer photo attached to a review.
- Moderation/status must be considered before public display.

### Newsletter
- Newsletter subscription.
- Explicit consent handling.
- Unsubscribe mechanism.

### Gift
- Gift card / voucher capability if it can be implemented without compromising the launch-critical checkout.
- Otherwise keep as an early post-MVP item rather than blocking launch.

## MUST HAVE — Training

### Training access
- A customer can purchase at least one online course.
- After purchase, the course becomes accessible from the customer's account.
- Training and store accounts are shared.

### Course experience
- Attractive learning portal.
- Course overview.
- Modules/lessons.
- Video/content lesson delivery.
- Progress tracking.

### Quiz foundation
- Quiz/question capability.
- Support at minimum for MCQ-style questions.
- Feedback after an answer.
- Final score.
- Course/lesson progression must be persisted.

### Course administration
Administrators must be able to:
- create courses;
- edit courses;
- create/edit lessons;
- create/edit questions;
- publish/unpublish content;
- save drafts;
- hide content before publication/teasing.

The exact administration UX can evolve, but content must not require code changes for every new course.

### Kit QR flow
If physical training kits are part of the MVP:
- each relevant kit can include a QR code;
- QR destination opens the corresponding explanatory video/content;
- the destination must work well on mobile.

## MVP SHOULD HAVE

- Product recommendations/related products.
- Basic customer profile.
- Basic admin dashboard.
- Course progress percentage.
- Basic completion state.
- Basic responsive/mobile-first UX.
- SEO-friendly public product/course pages.
- Transactional email foundations.

## MVP SHOULD NOT BLOCK LAUNCH

The following are explicitly valuable but must not delay the first commercial release:
- advanced loyalty;
- sophisticated referral program;
- advanced gamification;
- forum/Discord-like community;
- diplomas/certificates;
- social certificate sharing;
- confetti/reward animations beyond lightweight completion feedback;
- advanced adaptive quizzes;
- graduate-only navigation;
- extensive achievement systems.

## MVP NON-GOALS

Do not implement these unless the product owner explicitly promotes them into MVP:
- complex loyalty rules such as automatic “5 purchases above €50 = 20%”;
- full referral infrastructure;
- native Discord replacement/forum;
- XP economy;
- levels and badges;
- diploma generation and social verification;
- elaborate graduation gating;
- complex quiz branching;
- elaborate social integrations;
- multi-role training marketplace;
- instructor marketplace.

## Scope rule

When a requested feature is not clearly in MVP:
1. do not silently implement it;
2. identify it as roadmap scope;
3. implement only the minimum foundation needed to avoid blocking future expansion.
