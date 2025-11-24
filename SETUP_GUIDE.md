# Gemara - Gems & Jewellery Ecommerce Platform
## Complete Setup & Integration Guide

## Project Overview

**Gemara** is a world-class gems and jewellery ecommerce platform built with Angular 20, Tailwind CSS, and Spring Boot backend. The platform features a luxury aesthetic with full ecommerce functionality including product management, shopping cart, secure checkout, and user authentication.

### Key Features
- ✨ Luxury brand aesthetic with Playfair Display typography
- 🔐 Secure JWT-based authentication
- 💳 PCI-compliant payment processing
- 📱 Fully responsive design (mobile, tablet, desktop)
- 🛍️ Complete ecommerce workflow (Browse → Cart → Checkout → Confirm)
- 👤 User profiles with order history and wishlist
- 🎨 Modern UI with smooth animations
- 📸 S3 integration for image/video hosting
- 🚀 Production-ready architecture

## Technology Stack

### Frontend
- **Framework**: Angular 20 with Standalone Components
- **Styling**: Tailwind CSS 3.4.11 with Typography Plugin
- **Language**: TypeScript 5.8
- **Build Tool**: Angular CLI with Vite
- **Package Manager**: npm

### Backend Requirements
- **Framework**: Spring Boot 3.x
- **Database**: PostgreSQL (recommended) or MySQL
- **Authentication**: JWT with refresh tokens
- **Storage**: AWS S3 for images/videos
- **Payment**: Stripe or similar PCI-compliant processor

## File Structure

```
src/
├── app/
│   ├── pages/
│   │   ├── home.ts                 # Homepage with hero, categories, featured products
│   │   ├── products.ts             # Product listing with filters
│   │   ├── product-detail.ts       # Individual product details
│   │   ├── cart.ts                 # Shopping cart
│   │   ├── checkout.ts             # Multi-step checkout (shipping, payment, review)
│   │   └── account.ts              # User profile, orders, addresses, wishlist
│   ├── components/
│   │   ├── header.ts               # Navigation header with logo and cart
│   │   └── footer.ts               # Footer with links and newsletter
│   ├── services/
│   │   └── api.service.ts          # Spring Boot API integration service
│   ├── guards/
│   │   └── auth.guard.ts           # Authentication route guard
│   ├── app.ts                      # Main app component (layout wrapper)
│   ├── app.routes.ts               # Route definitions
│   └── app.config.ts               # Application configuration
├── styles.css                      # Global styles and custom utilities
├── index.html                      # HTML entry point
└── main.ts                         # Application bootstrap

tailwind.config.js                  # Tailwind configuration with custom colors
API_CONTRACTS.md                    # Complete REST API specifications
SETUP_GUIDE.md                      # This file
```

## Installation & Setup

### Prerequisites
- Node.js 18+ and npm 9+
- Angular CLI 20+

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm start

# The app will be available at http://localhost:4200
```

### Build for Production

```bash
# Create production build
npm run build

# Output will be in dist/ directory
# Ready for deployment
```

## Backend Configuration

### Spring Boot API Setup

The frontend expects a Spring Boot API with the following configuration:

**Required Environment Variables:**
```bash
# Database
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/gemara
SPRING_DATASOURCE_USERNAME=postgres
SPRING_DATASOURCE_PASSWORD=your_password

# JWT
JWT_SECRET=your_secret_key_min_32_chars
JWT_EXPIRATION=3600000  # 1 hour in milliseconds
JWT_REFRESH_EXPIRATION=604800000  # 7 days

# AWS S3
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Payment (Stripe)
STRIPE_API_KEY=sk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:4200,https://yourdomain.com
```

### Spring Boot Pom.xml Dependencies

```xml
<!-- Spring Boot Web -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>

<!-- Spring Security & JWT -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-api</artifactId>
    <version>0.12.3</version>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-impl</artifactId>
    <version>0.12.3</version>
    <scope>runtime</scope>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-jackson</artifactId>
    <version>0.12.3</version>
    <scope>runtime</scope>
</dependency>

<!-- JPA & Hibernate -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>

<!-- PostgreSQL -->
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <scope>runtime</scope>
</dependency>

<!-- AWS S3 -->
<dependency>
    <groupId>software.amazon.awssdk</groupId>
    <artifactId>s3</artifactId>
</dependency>

<!-- Stripe -->
<dependency>
    <groupId>com.stripe</groupId>
    <artifactId>stripe-java</artifactId>
    <version>22.0.0</version>
</dependency>

<!-- Validation -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-validation</artifactId>
</dependency>

<!-- Lombok (optional) -->
<dependency>
    <groupId>org.projectlombok</groupId>
    <artifactId>lombok</artifactId>
    <optional>true</optional>
</dependency>
```

## API Integration

### Configuring API Base URL

Update `src/app/services/api.service.ts` to point to your backend:

```typescript
private baseUrl = 'https://your-api-domain.com/api/v1';
```

### Authentication Flow

1. **User registers**: POST `/auth/register` → receives user data
2. **User login**: POST `/auth/login` → receives JWT token + refresh token
3. **Token storage**: Token stored in localStorage
4. **API requests**: All protected endpoints include `Authorization: Bearer {token}` header
5. **Token refresh**: POST `/auth/refresh` → get new token before expiration

### Error Handling

The API service includes error handling for:
- 401 Unauthorized → Redirect to login
- 403 Forbidden → Access denied
- 404 Not Found → Resource not found
- 500 Server Error → Display error message

## Styling & Customization

### Color Palette

**Primary Colors:**
- Gold: `#e8a857` (Luxury accent)
- Platinum: `#6b7280` (Professional)
- Diamond: `#1c1917` (Dark luxury)

**Gemstone Colors:**
- Emerald: `#22c55e` (Green stones)
- Sapphire: `#0ea5e9` (Blue stones)
- Rose: `#ef4444` (Pink/Red stones)

### Typography

**Fonts:**
- Display: Playfair Display (headings)
- Body: Segoe UI (content)

**Custom Utilities:**
- `.btn-primary` - Gold button
- `.btn-secondary` - Dark button
- `.btn-outline` - Outline style
- `.card` - Card with shadow
- `.badge-gold` - Gold badge
- `.container-luxury` - Max-width container with padding

### Responsive Breakpoints

- Mobile: < 640px (sm)
- Tablet: 640px - 1024px (md, lg)
- Desktop: > 1024px (xl, 2xl)

All components are fully responsive with mobile-first design.

## Security Considerations

### Frontend Security

1. **JWT Token Management**
   - Tokens stored in localStorage (consider sessionStorage for higher security)
   - Automatic refresh token handling
   - Logout clears tokens

2. **HTTPS**
   - All API calls must use HTTPS in production
   - Enable HSTS headers on backend

3. **Input Validation**
   - Client-side validation on forms
   - Always validate on backend

4. **CORS**
   - Configure CORS headers on backend
   - Only allow specific origins

### Backend Security Requirements

1. **Password Security**
   - Hash passwords with bcrypt (min cost 12)
   - Never store plain text passwords

2. **SQL Injection Prevention**
   - Use parameterized queries
   - ORM frameworks (JPA/Hibernate) provide protection

3. **Payment Security**
   - Never store full credit card details
   - Use Stripe Elements or similar
   - PCI-DSS compliance required

4. **Rate Limiting**
   - Implement on auth endpoints
   - 5 failed login attempts → lock account for 15 mins

5. **Data Encryption**
   - Encrypt sensitive data at rest
   - Always use HTTPS in transit
   - Never log sensitive information

## Testing

### Run Unit Tests

```bash
ng test
```

### E2E Testing Setup

```bash
# Install Cypress (recommended)
npm install --save-dev cypress

# Open Cypress
npx cypress open
```

## Deployment

### Frontend Deployment Options

#### Netlify
1. Connect GitHub repository
2. Build command: `npm run build`
3. Publish directory: `dist/`

#### Vercel
1. Import project
2. Build command: `npm run build`
3. Output directory: `dist/`

#### AWS S3 + CloudFront
1. Build: `npm run build`
2. Upload dist/ to S3
3. Create CloudFront distribution
4. Configure domain DNS

### Backend Deployment Options

#### Heroku
```bash
git push heroku main
heroku config:set JWT_SECRET=your_secret
```

#### AWS Elastic Beanstalk
```bash
eb create gemara-prod
eb deploy
```

#### Docker Deployment
```dockerfile
FROM openjdk:17-jdk-alpine
COPY target/gemara-backend.jar app.jar
ENTRYPOINT ["java","-jar","/app.jar"]
```

## Environment Variables Reference

### Frontend (.env file - if needed)
```
NG_APP_API_URL=https://api.yourdomain.com/api/v1
NG_APP_STRIPE_PUBLIC_KEY=pk_test_xxxxx
```

### Backend (application.properties)
See "Backend Configuration" section above

## Performance Optimization

### Frontend Optimization
- Angular CLI lazy loading for routes
- Tree-shaking enabled in production build
- Image optimization via S3 CDN
- Gzip compression enabled

### Backend Optimization
- Database query optimization with indexes
- Pagination for large datasets (default 20 items)
- Redis caching for frequently accessed data
- Connection pooling configured

## Troubleshooting

### Common Issues

**Issue: CORS error when calling API**
- Solution: Configure CORS on backend
- Ensure `CORS_ALLOWED_ORIGINS` includes frontend URL

**Issue: JWT token expired**
- Solution: Implement automatic refresh token logic
- Check token expiration time setting

**Issue: S3 images not loading**
- Solution: Verify AWS credentials and bucket permissions
- Check bucket CORS configuration

**Issue: Checkout fails**
- Solution: Verify Stripe API keys are correct
- Check payment method configuration

## API Documentation

See `API_CONTRACTS.md` for complete REST API specification including:
- 27 API endpoints
- Request/response formats
- Error codes
- Authentication requirements
- S3 integration details

## Support & Next Steps

### Recommended Next Steps

1. **Set up backend**: Implement Spring Boot API endpoints
2. **Configure database**: PostgreSQL with proper schema
3. **Setup S3 bucket**: Configure for image/video storage
4. **Integrate Stripe**: Set up payment processing
5. **Testing**: Run comprehensive tests before production
6. **Deployment**: Deploy frontend and backend to production
7. **Monitoring**: Setup error tracking (Sentry)
8. **Analytics**: Integrate Google Analytics or similar

### Additional Features to Consider

- Product reviews and ratings
- Advanced search and filters
- Wishlist sharing
- Gift cards
- Email notifications
- SMS notifications
- Admin dashboard
- Inventory management
- Analytics and reporting

## License

This project is proprietary and confidential.

---

**Created**: 2024
**Last Updated**: January 2024
**Version**: 1.0.0
