#!/bin/sh

# Replace placeholders in the Angular SSR browser distribution files
# This script is optional if environment variables are handled at build time
# Uncomment the sections below if you need runtime environment substitution

# TARGET_DIR is the path to the distribution
# We use the parent dist folder so it applies to both browser and server builds for SSR
TARGET_DIR="${TARGET_DIR:-/app/dist}"

if [ ! -d "$TARGET_DIR" ]; then
    echo "Warning: Target directory $TARGET_DIR not found. Skipping environment substitution."
    exit 0
fi

if [ -n "$API_URL" ]; then
    echo "Replacing PLACEHOLDER_API_URL with $API_URL in $TARGET_DIR"
    find "$TARGET_DIR" -type f \( -name "*.js" -o -name "*.mjs" \) -exec sed -i "s|PLACEHOLDER_API_URL|$API_URL|g" {} +
fi

if [ -n "$RAZORPAY_KEY" ]; then
    echo "Replacing PLACEHOLDER_RAZORPAY_KEY with $RAZORPAY_KEY in $TARGET_DIR"
    find "$TARGET_DIR" -type f \( -name "*.js" -o -name "*.mjs" \) -exec sed -i "s|PLACEHOLDER_RAZORPAY_KEY|$RAZORPAY_KEY|g" {} +
fi

if [ -n "$WHATSAPP_NUMBER" ]; then
    echo "Replacing PLACEHOLDER_WHATSAPP_NUMBER with $WHATSAPP_NUMBER in $TARGET_DIR"
    find "$TARGET_DIR" -type f \( -name "*.js" -o -name "*.mjs" \) -exec sed -i "s|PLACEHOLDER_WHATSAPP_NUMBER|$WHATSAPP_NUMBER|g" {} +
fi

if [ -n "$COMPANY_ADDRESS" ]; then
    echo "Replacing PLACEHOLDER_COMPANY_ADDRESS with $COMPANY_ADDRESS in $TARGET_DIR"
    find "$TARGET_DIR" -type f \( -name "*.js" -o -name "*.mjs" \) -exec sed -i "s|PLACEHOLDER_COMPANY_ADDRESS|$COMPANY_ADDRESS|g" {} +
fi

if [ -n "$COMPANY_PHONE" ]; then
    echo "Replacing PLACEHOLDER_COMPANY_PHONE with $COMPANY_PHONE in $TARGET_DIR"
    find "$TARGET_DIR" -type f \( -name "*.js" -o -name "*.mjs" \) -exec sed -i "s|PLACEHOLDER_COMPANY_PHONE|$COMPANY_PHONE|g" {} +
fi

if [ -n "$COMPANY_EMAIL" ]; then
    echo "Replacing PLACEHOLDER_COMPANY_EMAIL with $COMPANY_EMAIL in $TARGET_DIR"
    find "$TARGET_DIR" -type f \( -name "*.js" -o -name "*.mjs" \) -exec sed -i "s|PLACEHOLDER_COMPANY_EMAIL|$COMPANY_EMAIL|g" {} +
fi

if [ -n "$COMPANY_INSTAGRAM" ]; then
    echo "Replacing PLACEHOLDER_COMPANY_INSTAGRAM with $COMPANY_INSTAGRAM in $TARGET_DIR"
    find "$TARGET_DIR" -type f \( -name "*.js" -o -name "*.mjs" \) -exec sed -i "s|PLACEHOLDER_COMPANY_INSTAGRAM|$COMPANY_INSTAGRAM|g" {} +
fi

if [ -n "$COMPANY_FACEBOOK" ]; then
    echo "Replacing PLACEHOLDER_COMPANY_FACEBOOK with $COMPANY_FACEBOOK in $TARGET_DIR"
    find "$TARGET_DIR" -type f \( -name "*.js" -o -name "*.mjs" \) -exec sed -i "s|PLACEHOLDER_COMPANY_FACEBOOK|$COMPANY_FACEBOOK|g" {} +
fi
