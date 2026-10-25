import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "").slice(-10);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    const orderId = String(body.order_id ?? "").trim();
    const phone = digits(body.customer_phone);
    if (!/^[0-9a-f-]{36}$/i.test(orderId) || phone.length !== 10) return reply({ error: "Invalid order lookup details." }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Server database configuration missing");
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await db.from("orders")
      .select("id,order_number,customer_phone,phone,payment_method,payment_status,payment_provider,status,updated_at")
      .eq("id", orderId).maybeSingle();
    if (error) throw error;
    if (!data || digits(data.customer_phone ?? data.phone) !== phone) return reply({ error: "Order details could not be verified." }, 404);
    return reply({
      order_id: data.id,
      order_number: data.order_number,
      payment_method: data.payment_method,
      payment_status: data.payment_status,
      payment_provider: data.payment_provider,
      status: data.status,
      updated_at: data.updated_at
    });
  } catch (error) {
    console.error("check-youpi-payment failed", error);
    return reply({ error: "Could not check payment status. Please retry." }, 500);
  }
});
