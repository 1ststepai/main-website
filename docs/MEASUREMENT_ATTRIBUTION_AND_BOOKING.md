# Measurement, Attribution, and Booking

## What the site now measures

Vercel Web Analytics records page views plus these privacy-limited custom events:

- `website_strategy_call_click`
- `booking_page_view`
- `booking_fallback_click`
- `booking_confirmation_page_view`
- `booking_confirmed`
- `fit_check_view`
- `fit_check_click`
- `fit_check_start`
- `fit_check_submitted`
- `fit_check_error`
- `campaign_landing_view`
- `campaign_cta_click`
- `case_study_click`

Form email addresses and submitted website URLs are never included in analytics events.

## Attribution flow

`src/site-analytics.js` captures these values from the landing URL:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_term`
- `utm_content`
- `gclid`
- `fbclid`
- `msclkid`

The first touch and most recent attributed touch are retained in browser storage. The active attribution values are appended to all internal `/book/` and `/fit-check/` links. On `/book/`, they are appended to both the embedded LeadConnector calendar URL and its fallback link.

Test with:

```text
/?utm_source=test&utm_medium=qa&utm_campaign=website-rebuild
```

Then open `/book/` and confirm the iframe and fallback URL include the same values.

## LeadConnector calendar activation

The public calendar ID remains:

```text
Rb4aqLM1NdU5kvZcqNmj
```

In HighLevel, update that calendar:

1. Rename `1ststep.ai Intro Call` to `Website Strategy Call`.
2. Set the post-booking redirect URL to:

   ```text
   https://www.1ststep.ai/book/confirmed/
   ```

3. Keep the calendar booking submission as the HighLevel conversion action so HighLevel records its own first/latest attribution.

The repository changes the branded page heading immediately. The title rendered inside the third-party iframe does not change until step 1 is saved in HighLevel.

## Confirmed booking conversion

Do not treat the redirect-page view as the definitive booking conversion. A visitor can open that URL directly.

Create a HighLevel workflow:

1. Trigger: `Customer Booked Appointment`.
2. Filter: Calendar is `Website Strategy Call`.
3. Filter: Appointment status is `confirmed`.
4. Action: send a webhook `POST` to:

   ```text
   https://www.1ststep.ai/api/leadconnector-booking-confirmed
   ```

5. Header:

   ```text
   Authorization: Bearer {{shared secret}}
   ```

6. Body:

   ```json
   {
     "type": "CustomerBookedAppointment",
     "calendarId": "Rb4aqLM1NdU5kvZcqNmj",
     "appointmentStatus": "confirmed",
     "appointmentId": "{{appointment.id}}",
     "utm_source": "{{contact.first_attribution_source}}",
     "utm_medium": "{{contact.first_attribution_medium}}",
     "utm_campaign": "{{contact.first_attribution_campaign}}"
   }
   ```

Use HighLevel's merge-field picker for the appointment and attribution fields available in the account. Do not paste placeholder braces without confirming their preview values.

Set the same strong random value as a Vercel production environment variable:

```text
LEADCONNECTOR_ANALYTICS_WEBHOOK_SECRET
```

The endpoint is fail-closed when the secret is missing, accepts only the website-strategy calendar, requires `confirmed` status, deduplicates appointment retries, and sends `booking_confirmed` through Vercel's server analytics API.

## Fit Check delivery

`POST /api/fit-check` accepts only:

- website URL
- email
- timeline
- budget range
- allowlisted campaign attribution

The request succeeds only when the existing Resend configuration delivers the notification. Required production values:

```text
RESEND_API_KEY
APP_IDEA_NOTIFY_TO
APP_IDEA_NOTIFY_FROM
```

