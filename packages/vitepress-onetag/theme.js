// vitepress-onetag/theme: an "Ask AI" button in the VitePress nav bar.
// It only calls onetagAskDocs.open(); the box itself comes from the script tag withOnetag() adds.
// This file imports vue only (not vitepress), so it works the same in dev, the client build and SSR.
import { h, defineComponent } from "vue";

const ICON = "M4 4h16v12H8l-4 4V4z";

const STYLE = [
  "display:inline-flex", "align-items:center", "gap:6px", "height:32px", "margin-left:12px", "padding:0 12px",
  "border:1px solid var(--vp-c-divider)", "border-radius:8px", "background:var(--vp-c-bg-alt)",
  "color:var(--vp-c-text-1)", "font-size:13px", "font-weight:500", "line-height:1", "white-space:nowrap", "cursor:pointer",
].join(";");

export function openAskAi(question) {
  if (typeof window === "undefined" || !window.onetagAskDocs) return false;
  if (question) window.onetagAskDocs.ask(question);
  else window.onetagAskDocs.open();
  return true;
}

export const AskAiButton = defineComponent({
  name: "OnetagAskAiButton",
  props: { label: { type: String, default: "Ask AI" } },
  setup(props) {
    return () =>
      h("button", { type: "button", class: "onetag-ask-ai", style: STYLE, "aria-label": props.label, onClick: () => openAskAi() }, [
        h("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "aria-hidden": "true" }, [h("path", { d: ICON })]),
        h("span", props.label),
      ]);
  },
});

/**
 * Wrap a theme (usually vitepress/theme) so its nav bar gets an Ask AI button.
 * Use with withOnetag(config, { position: "none" }) so the floating button is not shown too.
 */
export function withAskAiButton(theme, options) {
  const o = options || {};
  const slot = o.slot || "nav-bar-content-after";
  const Base = theme.Layout;
  return {
    extends: theme,
    Layout: defineComponent({
      name: "OnetagLayout",
      setup(_, { slots }) {
        return () => h(Base, null, Object.assign({}, slots, {
          [slot]: () => [slots[slot] && slots[slot](), h(AskAiButton, { label: o.label })],
        }));
      },
    }),
  };
}

export default withAskAiButton;
