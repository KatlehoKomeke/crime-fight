#!/usr/bin/env bash
# Regenerates assets/fonts/*.woff2, the web's Latin-subset copies of the native
# TTFs. Needs fonttools with brotli: `pip install fonttools brotli`.
# Keep UNICODES in step with LATIN in src/theme/web-fonts.ts.
set -euo pipefail
cd "$(dirname "$0")/.."

UNICODES='U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD'
FONTS=$(node -p "require('path').dirname(require.resolve('@expo-google-fonts/dm-sans/package.json'))")/..

for face in dm-sans/400Regular/DMSans_400Regular dm-sans/500Medium/DMSans_500Medium dm-sans/600SemiBold/DMSans_600SemiBold \
  dm-sans/700Bold/DMSans_700Bold space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold space-grotesk/700Bold/SpaceGrotesk_700Bold; do
  pyftsubset "$FONTS/$face.ttf" --unicodes="$UNICODES" --layout-features='*' --flavor=woff2 \
    --output-file="assets/fonts/$(basename "$face").woff2"
done
