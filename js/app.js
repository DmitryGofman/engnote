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
})(window);
