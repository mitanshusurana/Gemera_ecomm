#!/bin/sh

# Replace placeholders in main.*.js
if [ -n "$API_URL" ]; then
    echo "Replacing PLACEHOLDER_API_URL with $API_URL"
    find /usr/share/nginx/html -type f -name "main*.js" -exec sed -i "s|PLACEHOLDER_API_URL|$API_URL|g" {} +
fi

if [ -n "$RAZORPAY_KEY" ]; then
    echo "Replacing PLACEHOLDER_RAZORPAY_KEY with $RAZORPAY_KEY"
    find /usr/share/nginx/html -type f -name "main*.js" -exec sed -i "s|PLACEHOLDER_RAZORPAY_KEY|$RAZORPAY_KEY|g" {} +
fi
