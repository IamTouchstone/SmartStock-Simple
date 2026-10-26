# SmartStock Version 1.0.1 — Store Assets & Replacement Guide

This package contains the official store listing graphics for **SmartStock Version 1.0.1**, updated with the new stag logo and dark navy theme (`#090D16`, `#0F172A`, `#64ffda`).

## 1. Summary of Assets Prepared

| Filename | Resolution | Description / Purpose |
| :--- | :--- | :--- |
| `01_store_icon_512x512.png` | 512 x 512 | Official LoveWorld / Google Play store launcher icon |
| `02_hi_res_icon_1024x1024.png` | 1024 x 1024 | High-resolution master icon for store marketing & feature highlights |
| `03_feature_graphic_1024x500.png` | 1024 x 500 | App store header banner / feature graphic with dark forest green accent (`#0A2E24`) |
| `screenshot_1_auth_signin.png` | 1080 x 1920 | Sign In & Org Registration screen with new stag branding |
| `screenshot_2_dashboard.png` | 1080 x 1920 | 3-Card Intelligent Inventory Dashboard (Total Products, Low Stock Alerts, Total Stock Units) |
| `screenshot_3_inventory_catalog.png` | 1080 x 1920 | Real-time multi-branch catalog & stock redistribution screen |
| `screenshot_4_barcode_scanner.png` | 1080 x 1920 | Mobile barcode camera scanning & AI receipt/invoice OCR intake |
| `screenshot_5_profile_security.png` | 1080 x 1920 | Account profile, email verification, organization scope, and session security |

---

## 2. Audit of Legacy Store Listing Images (To Be Replaced)

| Old Store Asset | Previous Status | Why It Must Be Replaced in Version 1.0.1 | Replacement Asset |
| :--- | :--- | :--- | :--- |
| `Alerts.png` (333x925) | Legacy v1.0.0 | Deprecated low-resolution browser crop. Contains outdated notification mockups. | `screenshot_2_dashboard.png` |
| `Inventory and overview.png` (330x941) | Legacy v1.0.0 | Non-standard resolution, displays old branding colors and legacy navigation layout. | `screenshot_3_inventory_catalog.png` |
| `Product details.png` (336x927) | Legacy v1.0.0 | Obsolete screen proportions and old iconography. | `screenshot_4_barcode_scanner.png` |
| `Sales & trends.png` (342x920) | Legacy v1.0.0 | Outdated promotional mockup with placeholder sales numbers. | `screenshot_2_dashboard.png` |
| `smartstock.png` (933x393) | Legacy banner | Used obsolete lightning bolt logo `⚡` instead of the official new stag logo. | `03_feature_graphic_1024x500.png` |
| `fashion_buotique_business.png` (333x941) | Promo mockup | Generic placeholder not representative of the core mobile application. | Retained in archive only; replaced in store listing by `screenshot_1_auth_signin.png`. |
| `trader_smiling_phone.png` | Promo graphic | Marketing photography rather than an app screenshot. Retained in repository for promotional materials. | Do not use as screenshot; use standard 1080x1920 UI screenshots. |

---

## 3. Store Submission Checklist for Version 1.0.1 Update

1. Log in to the LoveWorld App Store Developer Console.
2. Select the existing published application: **SmartStock** (`com.smartstock.app`).
3. Click **Store Listing / Graphic Assets**:
   - Upload `01_store_icon_512x512.png` as the primary App Icon.
   - Upload `03_feature_graphic_1024x500.png` as the Feature Graphic banner.
   - Delete legacy low-res screenshots and upload `screenshot_1` through `screenshot_5` under Phone Screenshots.
4. Go to **Release Management / App Releases**:
   - Target Release: **Update** (do not create a new app).
   - Version Name: `1.0.1`.
   - Version Code: `2`.
   - Upload the generated Release APK / AAB.
5. Save changes and submit for review.
