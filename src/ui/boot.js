// Loads the app. Served over http(s), the browser loads the ES modules in
// src/ directly. Opened from disk (file://), browsers refuse module imports,
// so the same code is loaded from the checked-in classic bundle instead.
(function boot() {
  var script = document.createElement('script');
  if (window.location.protocol === 'file:') {
    script.src = 'dist/portal.js';
  } else {
    script.type = 'module';
    script.src = 'src/ui/app.mjs';
  }
  document.body.appendChild(script);
})();
