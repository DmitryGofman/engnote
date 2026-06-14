/*
 * catalog.js — projects & tags as first-class catalogs (ARCHITECTURE.md §3.3).
 *
 * Decisions reference catalogs by id so the same real-world project/tag can
 * never fragment into "Base", "base", "Base Assy". Normalization happens here,
 * once, before any lookup. get-or-create guarantees no duplicates.
 */
(function (global) {
  "use strict";

  const Store = global.Store;
  const Schema = global.Schema;

  function normProject(name) {
    // Projects keep their display casing but match case-insensitively.
    return (name || "").trim();
  }

  function normTag(name) {
    // Tags are fully canonicalized: trimmed + lowercased.
    return (name || "").trim().toLowerCase();
  }

  // --- Projects -------------------------------------------------------------
  function findProjectByName(name) {
    const key = normProject(name).toLowerCase();
    if (!key) return null;
    return Store.listProjects().find(function (p) {
      return p.name.trim().toLowerCase() === key;
    }) || null;
  }

  function getOrCreateProject(name) {
    const clean = normProject(name);
    if (!clean) return null;
    const existing = findProjectByName(clean);
    if (existing) return existing;
    return Store.addProject(Schema.makeProject(clean));
  }

  function getProject(id) {
    if (!id) return null;
    return Store.listProjects().find(function (p) { return p.id === id; }) || null;
  }

  // Most-recently-used first, so the projects you keep using float to the top.
  function byRecent(a, b) {
    return (b.last_used_at || b.created_at || "").localeCompare(a.last_used_at || a.created_at || "");
  }

  function searchProjects(query) {
    const q = normProject(query).toLowerCase();
    const all = Store.listProjects().sort(byRecent);
    if (!q) return all;
    return all.filter(function (p) { return p.name.toLowerCase().indexOf(q) >= 0; });
  }

  // --- Tags -----------------------------------------------------------------
  function findTagByName(name) {
    const key = normTag(name);
    if (!key) return null;
    return Store.listTags().find(function (t) { return t.name === key; }) || null;
  }

  function getOrCreateTag(name) {
    const clean = normTag(name);
    if (!clean) return null;
    const existing = findTagByName(clean);
    if (existing) return existing;
    return Store.addTag(Schema.makeTag(clean));
  }

  function getTag(id) {
    if (!id) return null;
    return Store.listTags().find(function (t) { return t.id === id; }) || null;
  }

  function searchTags(query) {
    const q = normTag(query);
    const all = Store.listTags().sort(byRecent);
    if (!q) return all;
    return all.filter(function (t) { return t.name.indexOf(q) >= 0; });
  }

  // Resolve a list of tag ids to display names (skips dangling ids).
  function tagNames(ids) {
    return (ids || [])
      .map(getTag)
      .filter(Boolean)
      .map(function (t) { return t.name; });
  }

  global.Catalog = {
    normProject: normProject,
    normTag: normTag,
    findProjectByName: findProjectByName,
    getOrCreateProject: getOrCreateProject,
    getProject: getProject,
    searchProjects: searchProjects,
    findTagByName: findTagByName,
    getOrCreateTag: getOrCreateTag,
    getTag: getTag,
    searchTags: searchTags,
    tagNames: tagNames,
  };
})(window);
