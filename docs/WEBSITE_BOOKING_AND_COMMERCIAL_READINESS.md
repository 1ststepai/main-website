# Website Booking and Commercial Readiness

## Current commercial paths

### Custom Website Build

Website → Website Strategy Call → scoped proposal → signed agreement → agreed project deposit → build begins.

There is no public deposit checkout. The project amount depends on an approved scope, and work starts only after the proposal, agreement, and deposit terms are approved.

### Website Blueprint

The homepage describes the intended fixed scope:

- Current-site review
- Messaging and homepage hierarchy
- Conversion-path recommendations
- Visual-direction recommendations
- Recommended website scope
- Recorded strategy session
- Written project roadmap

The checkout is fail-closed in `public/commercial-config.js`. It may be shown only when all of the following are approved:

1. Fixed price and display wording
2. Hosted HTTPS checkout URL from the approved payment provider
3. Product terms URL plus an approved refund/cancellation policy
4. Fulfillment owner, scheduling process, and delivery timeframe
5. Whether the payment is credited toward a full website build
6. Privacy and terms coverage for the purchase flow

Activation requires `enabled`, `termsApproved`, `fulfillmentApproved`, and `creditPolicyApproved` to be `true`; a real price, HTTPS checkout URL, and terms URL; and an explicit Boolean value for `creditedTowardBuild`.

Do not create a payment product or turn on the checkout until those items are approved. Card details must remain with the approved payment provider.

## Owner decisions still required

- Minimum custom website investment
- Typical custom website timeline
- Website Blueprint price
- Whether the Blueprint payment is credited toward a build
- Approved payment provider and checkout URL
- Approved custom-build deposit percentage and payment terms

## GoHighLevel owner checklist

Apply and visibly verify these changes in GoHighLevel. They were not changed by the repository implementation.

- Rename “1ststep.ai Intro Call” to “1stStep.ai Website Strategy Call.”
- Add a useful call description.
- Make phone optional unless operationally required.
- Request the prospect’s current website.
- Ask for the biggest website problem.
- Add a budget-range question.
- Add the desired launch date or timeframe.
- Replace generic Additional Information with a project-focused question.
- Review the marketing-consent wording and whether it is required.
- Configure confirmation, reminder, no-show, and follow-up messages.
- Send the prospect to a useful confirmation page after booking.

The verified calendar URL remains centralized in `public/commercial-config.js`. The branded `/book/` page embeds that calendar and includes the same URL as a fallback link. The site does not store or intercept calendar form data.

## Analytics

No existing analytics vendor was found, so this implementation does not add tracking or a new analytics dependency. If an approved analytics system is added later, recommended events are:

- `website_strategy_call_click`
- `booking_page_view`
- `booking_fallback_click`
- `website_blueprint_checkout_click`
- `portfolio_case_study_click`
