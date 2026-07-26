export async function onRequest({ request, env }) {
  try {
    if (!env || !env.DB) {
      return Response.json({ ok:false, msg:"env.DB undefined" });
    }
    const row = await env.DB.prepare("SELECT 1 AS test").first();
    return Response.json({ ok:true, data:row });
  } catch (err) {
    return Response.json({ ok:false, error:err.message });
  }
}
