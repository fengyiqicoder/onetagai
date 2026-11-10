// Adds the Ask AI script tag before </body> of every page.
"use strict";
const React = require("react");
const { resolveKey, scriptAttributes } = require("./core");

exports.onRenderBody = ({ setPostBodyComponents }, pluginOptions) => {
  const o = pluginOptions || {};
  if (o.askAi === false) return;
  // Written out in full so webpack can put the build-time value of ONETAG_KEY here.
  const key = resolveKey(o.key, process.env.ONETAG_KEY);
  // __BASE_PATH__ is the pathPrefix when the site is built with --prefix-paths, else "".
  const basePath = typeof __BASE_PATH__ !== "undefined" ? __BASE_PATH__ : "";
  const attrs = scriptAttributes(o, key, basePath);
  setPostBodyComponents([React.createElement("script", Object.assign({ key: "gatsby-onetag", async: true }, attrs))]);
};
