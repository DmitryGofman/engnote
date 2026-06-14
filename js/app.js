/*
 * app.js — bootstrap + hash router.
 *   #/            note list (home)
 *   #/note/:id    open the note editor
 */
(function (global) {
  "use strict";
  const UI = global.UI;

  function route() {
    const hash = location.hash || "#/";
    const parts = hash.replace(/^#\//, "").split("/");
    if (parts[0] === "note" && parts[1]) UI.renderEditor(parts[1]);
    else UI.renderList();
  }

  global.addEventListener("hashchange", route);
  global.addEventListener("DOMContentLoaded", route);
  if (document.readyState !== "loading") route();

  // Register the service worker for offline + install-to-home-screen.
  if ("serviceWorker" in navigator) {
    global.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* offline mode just won't be available */ });
    });
  }
})(window);
