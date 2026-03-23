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

if [ -n "$COMPANY_ADDRESS" ]; then
    echo "Replacing PLACEHOLDER_COMPANY_ADDRESS with $COMPANY_ADDRESS"
    find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|PLACEHOLDER_COMPANY_ADDRESS|$COMPANY_ADDRESS|g" {} +
fi

if [ -n "$COMPANY_PHONE" ]; then
    echo "Replacing PLACEHOLDER_COMPANY_PHONE with $COMPANY_PHONE"
    find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|PLACEHOLDER_COMPANY_PHONE|$COMPANY_PHONE|g" {} +
fi

if [ -n "$COMPANY_EMAIL" ]; then
    echo "Replacing PLACEHOLDER_COMPANY_EMAIL with $COMPANY_EMAIL"
    find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|PLACEHOLDER_COMPANY_EMAIL|$COMPANY_EMAIL|g" {} +
fi

if [ -n "$COMPANY_INSTAGRAM" ]; then
    echo "Replacing PLACEHOLDER_COMPANY_INSTAGRAM with $COMPANY_INSTAGRAM"
    find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|PLACEHOLDER_COMPANY_INSTAGRAM|$COMPANY_INSTAGRAM|g" {} +
fi

if [ -n "$COMPANY_FACEBOOK" ]; then
    echo "Replacing PLACEHOLDER_COMPANY_FACEBOOK with $COMPANY_FACEBOOK"
    find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|PLACEHOLDER_COMPANY_FACEBOOK|$COMPANY_FACEBOOK|g" {} +
fi
