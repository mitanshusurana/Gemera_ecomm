#!/bin/sh

# Replace API URL in any .js file
if [ -n "$API_URL" ]; then
    echo "Replacing http://localhost:8080/api/v1 with $API_URL"
    find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|http://localhost:8080/api/v1|$API_URL|g" {} +
fi
