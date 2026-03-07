#!/bin/sh

# Replace placeholders in any .js file
if [ -n "$API_URL" ]; then
    echo "Replacing PLACEHOLDER_API_URL with $API_URL"
    find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|PLACEHOLDER_API_URL|$API_URL|g" {} +
fi

if [ -n "$RAZORPAY_KEY" ]; then
    echo "Replacing PLACEHOLDER_RAZORPAY_KEY with $RAZORPAY_KEY"
    find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|PLACEHOLDER_RAZORPAY_KEY|$RAZORPAY_KEY|g" {} +
fi

if [ -n "$WHATSAPP_NUMBER" ]; then
    echo "Replacing PLACEHOLDER_WHATSAPP_NUMBER with $WHATSAPP_NUMBER"
    find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|PLACEHOLDER_WHATSAPP_NUMBER|$WHATSAPP_NUMBER|g" {} +
fi
