export const environment = {
  production: true,
  // Replaced at container start by admin-env-subst.sh from $API_URL.
  // Kept as the placeholder token rather than a localhost URL so a
  // missing substitution fails visibly instead of silently pointing the
  // deployed admin panel at the operator's own machine.
  apiUrl: 'PLACEHOLDER_API_URL',
  // Replaced at container start by admin-env-subst.sh from $STOREFRONT_URL.
  storefrontUrl: 'PLACEHOLDER_STOREFRONT_URL',
};
