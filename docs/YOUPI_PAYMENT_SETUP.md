# Local Basket — YouPI-PG payment setup

This integration uses the hosted checkout API from the public [YouPI-PG repository](https://github.com/youpi-pg/YouPI-PG). That repository describes itself as an **experimental research project**, not a certified or production-ready gateway. Use test accounts and low-value tests only until you independently review security, bank terms, and applicable compliance requirements. Never treat a browser callback or screenshot as proof of payment.

## What is implemented

- The customer creates a Local Basket order in public.orders and public.order_items.
- The app invokes the `create-order` Supabase Edge Function. That server-side function validates the cart against live product/stock data, saves the order, creates the hosted YouPI payment session, and returns the checkout URL.
- The function verifies the order ID and customer phone, checks the server-side order total, then asks YouPI to create a hosted session. The merchant secret stays on the server.
- The customer is redirected to the returned checkoutUrl.
- YouPI sends a signed webhook to youpi-webhook. The function verifies HMAC-SHA256 over the raw request body (or the gateway V2 timestamped signature), checks timestamp, delivery ID, order ID, amount, currency, and saved payment ID, then updates orders.payment_status and inserts a payment_events audit record.
- The app polls check-youpi-payment, which only reads the Local Basket order status. It never marks a payment as paid from a browser event.
- COD remains separate and unchanged.

## Required Supabase Edge Function secrets

In Supabase Dashboard → Project Settings → Edge Functions → Secrets, add these secrets. `YOUPI_API_URL`, `YOUPI_MERCHANT_ID`, `YOUPI_MERCHANT_KEY`, and `YOUPI_WEBHOOK_SECRET` are required to enable UPI. `LOCAL_BASKET_PUBLIC_URL` is optional. **Do not put secret values in this file, frontend environment variables, or a public GitHub repository.**

| Secret | Purpose |
| --- | --- |
| YOUPI_API_URL | Public HTTPS base URL exposing POST /api/v1/payments |
| YOUPI_CHECKOUT_URL | Public HTTPS checkout portal base URL; checkout path is /checkout/{paymentId} |
| YOUPI_MERCHANT_ID | Merchant UUID configured in your YouPI deployment |
| YOUPI_MERCHANT_KEY | Merchant API credential accepted as X-Merchant-Key |
| YOUPI_WEBHOOK_SECRET | Same merchant webhook secret registered in YouPI for signed event delivery |
| LOCAL_BASKET_PUBLIC_URL | HTTPS Local Basket site origin used to build the return URL (defaults to https://new-app-psi-six.vercel.app) |

Supabase supplies SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Edge Functions. Never copy the service-role key into the browser.

## Register the webhook in YouPI

Set the merchant webhook endpoint to:

https://jgubunffqfyapurxpoih.supabase.co/functions/v1/youpi-webhook

Subscribe to SUCCESS, FAILED, EXPIRED, and CANCELLED. Copy the merchant's webhook secret into Supabase as YOUPI_WEBHOOK_SECRET. Use the same secret on both ends.

## Check before using the gateway

1. Confirm the gateway is deployed and reachable over public HTTPS; the API URL and checkout portal may be different hosts.
2. Ensure the YouPI merchant is configured with a valid receiving UPI account and webhook delivery is enabled.
3. Add the secrets above, then test with a small amount and confirm the signed webhook reaches Supabase.
4. Verify in Supabase that exactly the matching Local Basket order becomes paid, the amount matches to the paise, and a verified row is added to payment_events.
5. Confirm retries are idempotent and failed, expired, and cancelled sessions remain unpaid.

Until the gateway URL, merchant credentials, receiving account, and webhook are configured, the checkout function intentionally returns a clear not-configured response rather than pretending to accept a payment.