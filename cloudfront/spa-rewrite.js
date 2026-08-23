// CloudFront Function - viewer request - attach to the DEFAULT behavior only.
//
// S3 has no concept of client-side routes, so a request for /classes or
// /gpa would 404. Anything that doesn't look like a file gets served the
// React shell instead, and react-router takes it from there.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
    return request;
  }

  var last = uri.split('/').pop();
  if (last.indexOf('.') === -1) {
    request.uri = '/index.html';
  }

  return request;
}
