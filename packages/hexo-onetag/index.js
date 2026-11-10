// Hexo runs this file with `hexo` in scope when hexo-onetag is listed in the site's package.json.
"use strict";
const plugin = require("./lib/plugin");

/* global hexo */
if (typeof hexo !== "undefined" && hexo && hexo.extend) plugin.register(hexo);

module.exports = plugin;
