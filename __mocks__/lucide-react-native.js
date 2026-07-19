// jest-expo/Metro resolves lucide-react-native's "react-native" export
// condition to an ESM-only .mjs bundle that Jest's babel transform (which
// only matches .js/.jsx/.ts/.tsx) never processes, crashing any test that
// imports a screen using these icons. The icons themselves render nothing
// meaningful under RNTL anyway — this manual mock (auto-picked-up by Jest
// for node_modules, see https://jestjs.io/docs/manual-mocks) swaps every
// icon for a trivial functional component so screens under test can render.
const React = require("react");

module.exports = new Proxy(
  {},
  {
    get: () => (props) => React.createElement("Icon", props),
  },
);
