// CloudFront Function - viewer request - attach to the /api/* behavior only.
//
// The app calls same-origin /api/login, /api/data etc. so the backend URL
// never appears in the client bundle. The HAC server serves those routes at
// the root (/login, /data), so strip the /api prefix on the way out.
//
// This replaces what vercel.json used to do with its rewrite rule.
function handler(event) {
  var request = event.request;
  request.uri = request.uri.replace(/^\/api/, '');
  if (request.uri === '') {
    request.uri = '/';
  }
  return request;
}
