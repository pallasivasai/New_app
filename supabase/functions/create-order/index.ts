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

function getYouPiConfig() {
  const apiUrl = (Deno.env.get("YOUPI_API_URL") ?? "").trim().replace(/\/+$/, "");
  const merchantId = (Deno.env.get("YOUPI_MERCHANT_ID") ?? "").trim();
  const merchantKey = (Deno.env.get("YOUPI_MERCHANT_KEY") ?? "").trim();
  const webhookSecret = (Deno.env.get("YOUPI_WEBHOOK_SECRET") ?? "").trim();
  const missing = [
    !apiUrl && "YOUPI_API_URL",
    !merchantId && "YOUPI_MERCHANT_ID",
    !merchantKey && "YOUPI_MERCHANT_KEY",
    !webhookSecret && "YOUPI_WEBHOOK_SECRET",
  ].filter(Boolean);
  if (missing.length) return { error: missing as string[] };
  let url: URL;
  try { url = new URL(apiUrl); } catch { return { error: ["YOUPI_API_URL"] as string[] }; }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    return { error: ["YOUPI_API_URL must use HTTPS"] as string[] };
  }
  return { apiUrl, merchantId, merchantKey, webhookSecret };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  let createdOrderId: string | null = null;
  let errorStatus = 500;
  let publicError = "Could not place the order. Please retry.";
  let db: ReturnType<typeof createClient> | null = null;

  try {
    const body = await req.json();
    const customer_name = String(body.customer_name ?? "").trim().slice(0, 100);
    const customer_phone = String(body.customer_phone ?? "").replace(/\D/g, "").slice(-10);
    const delivery_address = String(body.delivery_address ?? "").trim().slice(0, 500);
    const delivery_notes = String(body.delivery_notes ?? "").trim().slice(0, 500);
    const delivery_fee = Math.max(0, Math.min(Number(body.delivery_fee ?? 20), 200));
    const payment_method = body.payment_method === "cash_on_delivery" ? "cash_on_delivery" : "upi_qr";
    const items = Array.isArray(body.items) ? body.items : [];

    if (customer_name.length < 2 || customer_phone.length !== 10 ||
        delivery_address.length < 8 || items.length < 1 || items.length > 40 ||
        !Number.isFinite(delivery_fee)) {
      return reply({ error: "Please provide valid customer details and cart items." }, 400);
    }

    // UPI checkout is disabled until a merchant-owned YouPI gateway is configured.
    // Never silently fall back to a static QR or mark an order paid from a browser event.
    const youpi = payment_method === "upi_qr" ? getYouPiConfig() : null;
    if (youpi && "error" in youpi) {
      console.error("YouPI configuration missing/invalid", youpi.error);
      return reply({
        error: "Automated UPI checkout is not configured yet. Please use Cash on Delivery, or ask the store owner to finish YouPI gateway setup.",
        code: "YOUPI_NOT_CONFIGURED",
      }, 503);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Server database configuration missing");
    db = createClient(url, serviceKey, { auth: { persistSession: false } });

    const normalized = items.map((i: any) => ({
      id: Number(i.product_id ?? i.id),
      quantity: Math.floor(Number(i.quantity)),
    }));
    if (normalized.some((i: any) =>
      !Number.isSafeInteger(i.id) || i.id < 1 ||
      !Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.quantity > 50
    )) {
      return reply({ error: "Cart has invalid product or quantity." }, 400);
    }

    const ids = [...new Set(normalized.map((i: any) => i.id))];
    const { data: products, error: productError } = await db
      .from("products")
      .select("id,name,unit,price,stock_qty,is_active")
      .in("id", ids);
    if (productError) throw productError;
    if (!products || products.length !== ids.length) {
      return reply({ error: "One or more products are unavailable." }, 409);
    }

    const orderItems: any[] = [];
    let subtotal = 0;
    for (const item of normalized) {
      const p = products.find((x: any) => Number(x.id) === item.id);
      if (!p || !p.is_active) return reply({ error: "A product is unavailable." }, 409);
      if (item.quantity > Number(p.stock_qty)) {
        return reply({ error: `${p.name} has only ${p.stock_qty} in stock.` }, 409);
      }
      const unit_price = Number(p.price);
      const line_total = Math.round(unit_price * item.quantity * 100) / 100;
      subtotal += line_total;
      orderItems.push({
        product_id: p.id,
        product_name: p.name,
        unit: p.unit ?? "item",
        unit_price,
        quantity: item.quantity,
        subtotal: line_total,
        line_total,
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const total = Math.round((subtotal + delivery_fee) * 100) / 100;
    const { data: order, error: orderError } = await db.from("orders").insert({
      customer_name,
      customer_phone,
      phone: customer_phone,
      delivery_address,
      delivery_notes,
      subtotal,
      delivery_fee,
      total,
      total_amount: total,
      payment_method,
      payment_provider: payment_method === "cash_on_delivery" ? "cash_on_delivery" : "youpi_pg",
      payment_status: payment_method === "cash_on_delivery" ? "cash_on_delivery" : "pending",
      status: "pending",
    }).select("id,order_number,customer_name,customer_phone,delivery_address,delivery_notes,subtotal,delivery_fee,total,status,payment_method,payment_status,payment_provider,payment_reference,payment_checkout_url,created_at").single();
    if (orderError) throw orderError;
    createdOrderId = order.id;

    const rows = orderItems.map((i: any) => ({ ...i, order_id: order.id }));
    const { error: itemsError } = await db.from("order_items").insert(rows);
    if (itemsError) throw itemsError;

    let savedOrder = order;
    let payment: Record<string, unknown> | null = null;

    if (payment_method === "upi_qr" && youpi && !("error" in youpi)) {
      const appBase = (Deno.env.get("LOCAL_BASKET_PUBLIC_URL") || "https://new-app-psi-six.vercel.app").trim().replace(/\/+$/, "");
      let appOrigin: string;
      try { appOrigin = new URL(appBase).origin; } catch { throw new Error("LOCAL_BASKET_PUBLIC_URL is invalid."); }
      if (!appOrigin.startsWith("https://") && !appOrigin.includes("localhost")) {
        throw new Error("LOCAL_BASKET_PUBLIC_URL must use HTTPS.");
      }
      const returnUrl = `${appOrigin}/?payment_return=1&order_id=${encodeURIComponent(order.order_number)}`;
      const response = await fetch(`${youpi.apiUrl}/api/v1/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Merchant-Id": youpi.merchantId,
          "X-Merchant-Key": youpi.merchantKey,
          "Idempotency-Key": order.order_number,
        },
        body: JSON.stringify({
          orderId: order.order_number,
          amount: total.toFixed(2),
          currency: "INR",
          returnUrl,
          metadata: {
            source: "local-basket",
            localBasketOrderId: order.id,
            localBasketOrderNumber: order.order_number,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 400);
        console.error("YouPI create-payment rejected", { status: response.status, detail });
        errorStatus = 502;
        publicError = "The payment gateway could not create a checkout session. Your order was not completed; please retry or use Cash on Delivery.";
        throw new Error("YouPI payment session creation failed.");
      }

      const gatewayPayment = await response.json();
      const paymentId = String(gatewayPayment.paymentId ?? "").trim();
      const checkoutUrl = String(gatewayPayment.checkoutUrl ?? "").trim();
      if (!paymentId || !checkoutUrl) {
        errorStatus = 502;
        publicError = "The payment gateway returned an incomplete checkout response. Please retry or use Cash on Delivery.";
        throw new Error("YouPI response missing paymentId or checkoutUrl.");
      }

      let checkout: URL;
      try { checkout = new URL(checkoutUrl); } catch { throw new Error("YouPI returned an invalid checkout URL."); }
      if (checkout.protocol !== "https:" && checkout.hostname !== "localhost" && checkout.hostname !== "127.0.0.1") {
        throw new Error("YouPI checkout URL must use HTTPS.");
      }

      const { data: updated, error: updateError } = await db.from("orders").update({
        payment_provider: "youpi_pg",
        payment_reference: paymentId,
        payment_checkout_url: checkout.href,
        payment_status: "pending",
      }).eq("id", order.id)
        .select("id,order_number,customer_name,customer_phone,delivery_address,delivery_notes,subtotal,delivery_fee,total,status,payment_method,payment_status,payment_provider,payment_reference,payment_checkout_url,created_at")
        .single();
      if (updateError) throw updateError;
      savedOrder = updated;
      payment = {
        provider: "youpi_pg",
        paymentId,
        checkoutUrl: checkout.href,
        status: gatewayPayment.status ?? "ACTIVE",
      };
    }

    return reply({ order: savedOrder, items: orderItems, payment, message: "Order saved." }, 201);
  } catch (e) {
    console.error("create-order error", e);
    if (createdOrderId && db) {
      try {
        const { error: cleanupError } = await db.from("orders").delete().eq("id", createdOrderId);
        if (cleanupError) console.error("create-order cleanup failed", cleanupError);
      } catch (cleanupError) {
        console.error("create-order cleanup failed", cleanupError);
      }
    }
    return reply({ error: publicError }, errorStatus);
  }
});
