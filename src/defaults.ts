import type { Preferences } from "./types";
import { DEFAULT_LIGHT_COLOR_SCHEME } from "./colorSchemes";

export const DEFAULT_MARKDOWN = `# Untitled draft

## Notes

- Write locally
- Preview safely
- Keep the draft on this device

| Item | Status |
| --- | --- |
| Editor | Ready |
| Preview | Ready |
`;

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "light",
  colorScheme: DEFAULT_LIGHT_COLOR_SCHEME,
  outlineVisible: true,
  splitRatio: 50
};
