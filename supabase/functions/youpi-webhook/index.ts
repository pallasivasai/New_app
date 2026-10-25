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
    return reply({ received: true, result: data }, 200);
  } catch (error) {
    console.error("youpi-webhook error", error);
    return reply({ error: "Could not process payment event." }, 500);
  }
});
