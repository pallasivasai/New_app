import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  try {
    const body = await req.json();
    const customer_name = String(body.customer_name ?? "").trim().slice(0, 100);
    const customer_phone = String(body.customer_phone ?? "").replace(/\D/g, "").slice(-10);
    const delivery_address = String(body.delivery_address ?? "").trim().slice(0, 500);
    const delivery_notes = String(body.delivery_notes ?? "").trim().slice(0, 500);
    const delivery_fee = Math.max(0, Math.min(Number(body.delivery_fee ?? 20), 200));
    const payment_method = body.payment_method === "cash_on_delivery" ? "cash_on_delivery" : "upi_qr";
    const items = Array.isArray(body.items) ? body.items : [];
    if (customer_name.length < 2 || customer_phone.length !== 10 || delivery_address.length < 8 || items.length < 1 || items.length > 40) {
      return new Response(JSON.stringify({ error: "Please provide valid customer details and cart items." }), { status: 400, headers: cors });
    }
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Server database configuration missing");
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const normalized = items.map((i: any) => ({ id: Number(i.product_id), quantity: Math.floor(Number(i.quantity)) }));
    if (normalized.some((i: any) => !Number.isSafeInteger(i.id) || i.id < 1 || !Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.quantity > 50)) {
      return new Response(JSON.stringify({ error: "Cart has invalid product or quantity." }), { status: 400, headers: cors });
    }
    const ids = [...new Set(normalized.map((i: any) => i.id))];
    const { data: products, error: productError } = await db.from("products").select("id,name,unit,price,stock_qty,is_active").in("id", ids);
    if (productError) throw productError;
    if (!products || products.length !== ids.length) return new Response(JSON.stringify({ error: "One or more products are unavailable." }), { status: 409, headers: cors });
    const orderItems = [];
    let subtotal = 0;
    for (const item of normalized) {
      const p = products.find((x: any) => x.id === item.id);
      if (!p || !p.is_active) return new Response(JSON.stringify({ error: "A product is unavailable." }), { status: 409, headers: cors });
      if (item.quantity > p.stock_qty) return new Response(JSON.stringify({ error: `${p.name} has only ${p.stock_qty} in stock.` }), { status: 409, headers: cors });
      const unit_price = Number(p.price);
      const line_total = Math.round(unit_price * item.quantity * 100) / 100;
      subtotal += line_total;
      orderItems.push({ product_id: p.id, product_name: p.name, unit: p.unit, unit_price, quantity: item.quantity, line_total });
    }
    subtotal = Math.round(subtotal * 100) / 100;
    const total = Math.round((subtotal + delivery_fee) * 100) / 100;
    const { data: order, error: orderError } = await db.from("orders").insert({
      customer_name, customer_phone, phone: customer_phone, delivery_address, delivery_notes, subtotal, delivery_fee, total, total_amount: total,
      payment_method, payment_provider: payment_method === "cash_on_delivery" ? "cash_on_delivery" : "manual_upi",
      payment_status: payment_method === "cash_on_delivery" ? "cash_on_delivery" : "pending", status: "pending"
    }).select("id,order_number,customer_name,customer_phone,delivery_address,delivery_notes,subtotal,delivery_fee,total,status,payment_method,payment_status,created_at").single();
    if (orderError) throw orderError;
    const rows = orderItems.map(i => ({ ...i, order_id: order.id }));
    const { error: itemsError } = await db.from("order_items").insert(rows);
    if (itemsError) {
      await db.from("orders").delete().eq("id", order.id);
      throw itemsError;
    }
    return new Response(JSON.stringify({ order, items: orderItems, message: "Order saved to database." }), { status: 201, headers: cors });
  } catch (e) {
    console.error("create-order error", e);
    return new Response(JSON.stringify({ error: "Could not place the order. Please retry." }), { status: 500, headers: cors });
  }
});