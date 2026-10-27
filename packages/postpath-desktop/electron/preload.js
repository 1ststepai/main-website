"use strict";

const { contextBridge } = require("electron");

/**
 * Minimal bridge for the desktop shell.
 * Desk UI stays a localhost web app; no Node APIs are exposed to page scripts.
 */
contextBridge.exposeInMainWorld("postpathDesktop", {
  shell: true,
  product: "PostPath",
  deskUrl: "http://127.0.0.1:47830/",
});
