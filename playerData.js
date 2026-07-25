export async function onRequest(context) {
  const { request } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*"
  };
  return Response.json({msg:"代码正常运行，没有访问数据库"}, {headers:corsHeaders});
}
