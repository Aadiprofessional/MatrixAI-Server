export async function onRequest(context) {
  return new Response(JSON.stringify({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'MatrixAI Server',
    version: '1.0.0'
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
} 