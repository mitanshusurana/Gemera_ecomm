#!/bin/sh
set -e

# Inject the API URL into the built admin bundle at container start.
#
# This previously rewrote the literal 'http://localhost:8080/api/v1', which was
# what environment.prod.ts contained -- so if API_URL was unset the deployed
# admin panel silently pointed at the operator's own machine and simply failed
# to load anything. It now substitutes the same PLACEHOLDER_API_URL token the
# storefront uses (see env-subst.sh), and refuses to start without a value
# rather than serving a bundle that cannot reach the API.

TARGET_DIR="${TARGET_DIR:-/usr/share/nginx/html}"

if [ -z "$API_URL" ]; then
    echo "FATAL: API_URL is not set. The admin bundle would ship with an" >&2
    echo "       unresolved PLACEHOLDER_API_URL and could not reach the API." >&2
    exit 1
fi

if [ ! -d "$TARGET_DIR" ]; then
    echo "FATAL: build output not found at $TARGET_DIR" >&2
    exit 1
fi

echo "Replacing PLACEHOLDER_API_URL with $API_URL in $TARGET_DIR"
find "$TARGET_DIR" -type f \( -name "*.js" -o -name "*.mjs" \) \
    -exec sed -i "s|PLACEHOLDER_API_URL|$API_URL|g" {} +

# Confirm nothing was missed. A leftover token means the admin panel is broken
# in a way that only shows up as failed requests in the browser.
if grep -rql "PLACEHOLDER_API_URL" "$TARGET_DIR" 2>/dev/null; then
    echo "FATAL: PLACEHOLDER_API_URL still present after substitution." >&2
    exit 1
fi

# Storefront origin for the product 'View Live' preview link. Optional: if it
# is not set the link is left unresolved rather than pointing at localhost.
if [ -n "$STOREFRONT_URL" ]; then
    echo "Replacing PLACEHOLDER_STOREFRONT_URL with $STOREFRONT_URL"
    find "$TARGET_DIR" -type f \( -name "*.js" -o -name "*.mjs" \)         -exec sed -i "s|PLACEHOLDER_STOREFRONT_URL|$STOREFRONT_URL|g" {} +
else
    echo "WARNING: STOREFRONT_URL not set; product preview links will not work." >&2
fi

echo "API URL injected."
