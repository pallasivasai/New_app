import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const validReturnBase = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("Public app URL must use HTTPS.");
  }
  return url.origin;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const rawBody = await req.text();
    if (rawBody.length > 64_000) return reply({ error: "Request too large." }, 413);
    const signature = req.headers.get("x-gateway-signature") ?? "";
    const timestampHeader = req.headers.get("x-gateway-timestamp") ?? "";
    const deliveryId = req.headers.get("x-gateway-delivery-id") ?? "";
    const secret = Deno.env.get("YOUPI_WEBHOOK_SECRET");

    if (!secret) {
      console.error("YOUPI_WEBHOOK_SECRET is not configured");
      return reply({ error: "Webhook is not configured." }, 503);
    }
    if (!signature.startsWith("sha256=") || !deliveryId || !timestampHeader) {
      return reply({ error: "Missing or invalid webhook signature headers." }, 401);
    }

    const timestampNumber = Number(timestampHeader);
    if (!Number.isFinite(timestampNumber)) return reply({ error: "Invalid webhook timestamp." }, 401);
    const timestampMs = timestampNumber < 10_000_000_000 ? timestampNumber * 1000 : timestampNumber;
    if (Math.abs(Date.now() - timestampMs) > 2 * 60 * 60 * 1000) {
      return reply({ error: "Webhook timestamp is outside the allowed window." }, 401);
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
    const expected = "sha256=" + Array.from(signatureBytes, b => b.toString(16).padStart(2, "0")).join("");
    const actualBytes = new TextEncoder().encode(signature);
    const expectedBytes = new TextEncoder().encode(expected);
    let mismatch = actualBytes.length ^ expectedBytes.length;
    const max = Math.max(actualBytes.length, expectedBytes.length);
    for (let i = 0; i < max; i++) mismatch |= (actualBytes[i] ?? 0) ^ (expectedBytes[i] ?? 0);
    if (mismatch !== 0) return reply({ error: "Invalid webhook signature." }, 401);

    let event: any;
    try { event = JSON.parse(rawBody); } catch { return reply({ error: "Invalid JSON payload." }, 400); }

    // Header timestamps/IDs must agree with the values inside the signed body.
    // This prevents an old valid payload from being replayed with a fresh header timestamp.
    if (String(event.timestamp ?? "") !== timestampHeader ||
        String(event.deliveryId ?? "") !== deliveryId) {
      return reply({ error: "Webhook timestamp or delivery ID mismatch." }, 401);
    }

    const eventType = String(event.event ?? req.headers.get("x-gateway-event") ?? "").toUpperCase();
    const orderNumber = String(event.orderId ?? "").trim();
    const paymentId = String(event.paymentId ?? "").trim();
    const amountPaise = Number(event.amountPaise);
    const currency = String(event.currency ?? "INR").toUpperCase();
    const utr = String(event.utr ?? "").trim().slice(0, 120);

    if (!["SUCCESS", "FAILED", "EXPIRED", "CANCELLED"].includes(eventType) ||
        !orderNumber || !paymentId || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 ||
        currency !== "INR") {
      return reply({ error: "Invalid payment event fields." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceRole) throw new Error("Server database configuration missing.");
    const db = createClient(url, serviceRole, { auth: { persistSession: false } });

    const { data, error } = await db.rpc("apply_youpi_payment_event", {
      p_order_number: orderNumber,
      p_payment_id: paymentId,
      p_event_type: eventType,
      p_amount_paise: amountPaise,
      p_currency: currency,
      p_utr: utr || null,
      p_payload: event,
      p_delivery_id: deliveryId,
    });
    if (error) {
      console.error("YouPI webhook reconciliation rejected", { message: error.message, orderNumber, paymentId, eventType });
      return reply({ error: "Payment event did not match a valid Local Basket order." }, 409);
    }

    // Send an owner email only after the signed webhook and database reconciliation
    // have confirmed the exact order/payment/amount. Email is a notification, not proof of payment.
    if (eventType === "SUCCESS" && data?.duplicate !== true && data?.result?.payment_status === "paid") {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const from = Deno.env.get("PAYMENT_CONFIRMATION_FROM");
      const to = Deno.env.get("PAYMENT_CONFIRMATION_EMAIL") || "psairabel143@gmail.com";
      if (resendKey && from) {
        try {
          const { data: paidOrder, error: orderLookupError } = await db.from("orders")
            .select("order_number,customer_name,total,total_amount,payment_reference,payment_status")
            .eq("order_number", orderNumber)
            .maybeSingle();
          if (orderLookupError) throw orderLookupError;
          if (paidOrder?.payment_status === "paid" && paidOrder.payment_reference === paymentId) {
            const amount = Number(paidOrder.total ?? paidOrder.total_amount);
            const mail = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from,
                to: [to],
                subject: `Local Basket: payment confirmed for ${orderNumber}`,
                html: `<h2>Payment verified</h2><p>Local Basket received a verified YouPI payment event.</p><p><b>Order:</b> ${orderNumber}</p><p><b>Customer:</b> ${String(paidOrder.customer_name ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c] ?? c))}</p><p><b>Amount:</b> ₹${amount.toFixed(2)}</p><p><b>Payment reference:</b> ${paymentId}</p><p>This email is a notification; confirm settlement against your bank records.</p>`
              }),
              signal: AbortSignal.timeout(10000)
            });
            if (!mail.ok) console.error("Payment verified but owner email failed", { status: mail.status, orderNumber });
          }
        } catch (mailError) {
          // Never make the gateway retry a valid payment just because email delivery failed.
          console.error("Payment verified; owner email notification failed", { orderNumber, error: String(mailError) });
        }
      } else {
        console.warn("Payment verified; owner email skipped because RESEND_API_KEY or PAYMENT_CONFIRMATION_FROM is missing.");
      }
    }
    return reply({ received: true, result: data }, 200);
  } catch (error) {
    console.error("youpi-webhook error", error);
    return reply({ error: "Could not process payment event." }, 500);
  }
});
