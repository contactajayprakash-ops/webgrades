// The app is always the new 2.0 "Midnight Glass" shell. The classic ('legacy')
// sidebar UI was retired and its toggle removed from Settings. Kept as a function
// so existing call sites (App.jsx, Dashboard.jsx) are untouched.
export function loadUI() {
  return 'v2'
}
