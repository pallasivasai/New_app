import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return [...signed].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const secret = Deno.env.get("YOUPI_WEBHOOK_SECRET") ?? "";
    if (!secret) return json({ error: "Webhook secret is not configured" }, 503);
    const rawBody = await req.text();
    if (rawBody.length > 128_000) return json({ error: "Payload too large" }, 413);

    const signature = (req.headers.get("x-gateway-signature") ?? "").trim();
    const signatureV2 = (req.headers.get("x-gateway-signature-v2") ?? "").trim();
    const timestampHeader = (req.headers.get("x-gateway-timestamp") ?? "").trim();
    const deliveryHeader = (req.headers.get("x-gateway-delivery-id") ?? "").trim();
    const rawExpected = `sha256=${await hmacHex(secret, rawBody)}`;
    let validSignature = constantTimeEqual(signature, rawExpected);
    if (!validSignature && timestampHeader && signatureV2) {
      const v2Expected = `sha256=${await hmacHex(secret, `${timestampHeader}.${rawBody}`)}`;
      validSignature = constantTimeEqual(signatureV2, v2Expected);
    }
    if (!validSignature) return json({ error: "Invalid gateway signature" }, 401);

    let event: any;
    try { event = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON" }, 400); }
    const eventTime = Number(event.timestamp);
    if (!Number.isFinite(eventTime) || Math.abs(Date.now() - eventTime) > 2 * 60 * 60 * 1000) {
      return json({ error: "Webhook timestamp is missing or outside the allowed window" }, 401);
    }
    if (timestampHeader && timestampHeader !== String(event.timestamp)) {
      return json({ error: "Webhook timestamp header mismatch" }, 401);
    }
    if (deliveryHeader && event.deliveryId && deliveryHeader !== String(event.deliveryId)) {
      return json({ error: "Webhook delivery ID mismatch" }, 401);
    }
    const allowedEvents = new Set(["SUCCESS", "FAILED", "EXPIRED", "CANCELLED"]);
    if (!allowedEvents.has(String(event.event)) || !event.paymentId || !event.orderId) {
      return json({ error: "Unsupported or incomplete payment event" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Server database configuration missing" }, 503);
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const localOrderId = String(event.metadata?.localBasketOrderId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(localOrderId)) {
      return json({ error: "Local Basket order mapping is missing" }, 400);
    }
    const { data: order, error: orderError } = await db.from("orders")
      .select("id,order_number,total,payment_method,payment_status,payment_provider,payment_reference")
      .eq("id", localOrderId).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: "Order not found" }, 404);
    if (order.order_number !== String(event.orderId) ||
        order.payment_method !== "upi_qr" ||
        order.payment_provider !== "youpi_pg" ||
        order.payment_reference !== String(event.paymentId)) {
      return json({ error: "Gateway event does not match the stored order/payment reference" }, 409);
    }
    const expectedPaise = Math.round(Number(order.total) * 100);
    const actualPaise = Number(event.amountPaise);
    if (!Number.isFinite(actualPaise) || actualPaise !== expectedPaise ||
        String(event.currency ?? "INR").toUpperCase() !== "INR") {
      return json({ error: "Gateway amount/currency does not match the order" }, 409);
    }

    // Idempotency: a retried signed delivery returns success without double-processing.
    const { data: prior, error: priorError } = await db.from("payment_events")
      .select("id").eq("provider", "youpi_pg").eq("provider_payment_id", String(event.paymentId))
      .eq("event_type", String(event.event)).limit(1).maybeSingle();
    if (priorError) throw priorError;
    if (prior) return json({ received: true, duplicate: true });

    let nextStatus = order.payment_status;
    if (event.event === "SUCCESS") nextStatus = "paid";
    else if (event.event === "FAILED") nextStatus = "failed";
    else if (event.event === "EXPIRED") nextStatus = "expired";
    else if (event.event === "CANCELLED") nextStatus = "cancelled";

    const { error: updateError } = await db.from("orders").update({
      payment_status: nextStatus,
      payment_provider: "youpi_pg",
      updated_at: new Date().toISOString()
    }).eq("id", order.id).eq("payment_reference", String(event.paymentId));
    if (updateError) throw updateError;

    const { error: eventError } = await db.from("payment_events").insert({
      order_id: order.id,
      event_type: String(event.event),
      reference: String(event.utr ?? "").slice(0, 200) || null,
      notes: `Verified YouPI webhook delivery ${String(event.deliveryId ?? deliveryHeader ?? "").slice(0, 80)}`,
      provider: "youpi_pg",
      provider_payment_id: String(event.paymentId),
      verified: true,
      payload: event
    });
    if (eventError) throw eventError;
    return json({ received: true });
  } catch (error) {
    console.error("youpi-webhook failed", error);
    return json({ error: "Webhook processing failed" }, 500);
  }
});
