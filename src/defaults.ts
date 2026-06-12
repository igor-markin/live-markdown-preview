import type { Preferences } from "./types";

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
  outlineVisible: true,
  splitRatio: 50
};
