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
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "").slice(-10);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const orderId = String(body.order_id ?? "").trim();
    const phone = digits(body.customer_phone);
    if (!/^[0-9a-f-]{36}$/i.test(orderId) || phone.length !== 10) {
      return reply({ error: "A valid order ID and customer phone are required." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiUrl = (Deno.env.get("YOUPI_API_URL") ?? "").replace(/\/+$/, "");
    const checkoutBase = (Deno.env.get("YOUPI_CHECKOUT_URL") ?? "").replace(/\/+$/, "");
    const merchantId = Deno.env.get("YOUPI_MERCHANT_ID") ?? "";
    const merchantKey = Deno.env.get("YOUPI_MERCHANT_KEY") ?? "";
    const returnUrl = Deno.env.get("LOCAL_BASKET_RETURN_URL") ?? "";
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase server configuration is missing.");
    if (!apiUrl || !checkoutBase || !merchantId || !merchantKey || !returnUrl) {
      return reply({
        error: "YouPI checkout is not configured yet. Add YOUPI_API_URL, YOUPI_CHECKOUT_URL, YOUPI_MERCHANT_ID, YOUPI_MERCHANT_KEY and LOCAL_BASKET_RETURN_URL in Supabase Edge Function secrets."
      }, 503);
    }
    const parsedReturn = new URL(returnUrl);
    if (parsedReturn.protocol !== "https:" && parsedReturn.hostname !== "localhost") {
      return reply({ error: "LOCAL_BASKET_RETURN_URL must use HTTPS." }, 503);
    }

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: order, error: orderError } = await db
      .from("orders")
      .select("id,order_number,customer_name,customer_phone,phone,total,payment_method,payment_status,payment_provider,payment_reference")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return reply({ error: "Order not found." }, 404);
    if (digits(order.customer_phone ?? order.phone) !== phone) {
      return reply({ error: "Order details could not be verified." }, 403);
    }
    if (order.payment_method !== "upi_qr") {
      return reply({ error: "This order is not configured for UPI checkout." }, 409);
    }
    if (order.payment_status === "paid") {
      return reply({ error: "This order has already been paid." }, 409);
    }

    // Reuse an existing hosted session on retries; don't accidentally create a second payment.
    if (order.payment_provider === "youpi_pg" && order.payment_reference) {
      return reply({
        paymentId: order.payment_reference,
        orderId: order.order_number,
        checkoutUrl: `${checkoutBase}/checkout/${encodeURIComponent(order.payment_reference)}`,
        payment_status: order.payment_status
      });
    }

    const payload = {
      orderId: order.order_number,
      amount: Number(order.total).toFixed(2),
      currency: "INR",
      returnUrl: parsedReturn.href,
      customer: {
        fullName: String(order.customer_name ?? "").slice(0, 100),
        phoneNumber: phone
      },
      description: `Local Basket order ${order.order_number}`,
      metadata: {
        localBasketOrderId: order.id,
        localBasketOrderNumber: order.order_number,
        source: "local-basket"
      }
    };
    const response = await fetch(`${apiUrl}/api/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Merchant-Id": merchantId,
        "X-Merchant-Key": merchantKey,
        "Idempotency-Key": order.id
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    const responseText = await response.text();
    let gateway: any;
    try { gateway = JSON.parse(responseText); } catch { gateway = null; }
    if (!response.ok || !gateway?.paymentId || !gateway?.checkoutUrl) {
      console.error("YouPI session create failed", response.status, responseText.slice(0, 500));
      return reply({
        error: gateway?.message || gateway?.error || `YouPI could not create a checkout session (HTTP ${response.status}). Check the gateway URL and merchant configuration.`
      }, 502);
    }

    const checkoutUrl = new URL(gateway.checkoutUrl);
    if (checkoutUrl.protocol !== "https:" && checkoutUrl.hostname !== "localhost") {
      return reply({ error: "The gateway returned an invalid checkout URL." }, 502);
    }

    const { error: updateError } = await db.from("orders").update({
      payment_provider: "youpi_pg",
      payment_reference: String(gateway.paymentId),
      payment_status: "pending",
      updated_at: new Date().toISOString()
    }).eq("id", order.id).neq("payment_status", "paid");
    if (updateError) throw updateError;

    return reply({
      paymentId: String(gateway.paymentId),
      orderId: order.order_number,
      checkoutUrl: checkoutUrl.href,
      payment_status: "pending"
    });
  } catch (error) {
    console.error("create-youpi-payment failed", error);
    return reply({ error: "Could not start YouPI checkout. Please retry or contact the store." }, 500);
  }
});
