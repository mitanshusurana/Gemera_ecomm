sed -i 's/\[ngSrc\]="result.imageUrl"/\[src\]="result.imageUrl"/' src/app/components/header.ts
sed -i 's/\[ngSrc\]="result()?.imageUrl"/\[src\]="result()?.imageUrl"/' src/app/pages/verify-certificate.ts
