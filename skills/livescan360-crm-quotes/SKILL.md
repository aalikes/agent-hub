---
name: livescan360-crm-quotes
description: Build, price, and save quotes in the LiveScan360 CRM at crm.livescan360.com — including UPS shipping calculation, Florida tax lookup, and PDF letterhead template settings.
---

# LiveScan360 CRM — Quote Workflow

## Platform Access

- CRM URL: https://crm.livescan360.com/admin/crm
- Shah's login: shah@livescan360.com (advisor role — NOT org admin)
- Philip Lilavois is org owner/admin
- Shah's quote template is personal to him (not shared with Philip's)

## Step 1 — Check Contacts First

Before creating a new quote, search Contacts to confirm the client record exists. If not, create the contact first, then return to Quotes.

## Step 2 — Create the Quote

1. Go to Quotes → New Quote
2. Select the contact from the dropdown
3. Set a descriptive title (e.g., "Equipment & Services Quote")
4. Set Issue Date and Valid Until date
5. Under Advisors, check the checkbox next to Shah Saint-Cyr

## Step 3 — Add Line Items

For each product/service:
- Description, Quantity, Unit Price
- Discount field is optional (leave blank if none)

Common line items:
- "LiveScan Services" — price per scan x number of applicants
- "Custom Pre-wired Mobile Kit" — equipment bundle

## Step 4 — UPS Ground Shipping

1. Enter the client's full street address, city, state, ZIP in the shipping fields first
2. Click "Calculate UPS shipping" button
3. The calculated rate populates automatically
4. WARNING: After UPS calculation, the browser extension may crash — save the quote immediately

## Step 5 — Taxes

1. Confirm city, state, and ZIP are entered in the address fields
2. Click the circular-arrow Tax refresh icon next to the tax field
3. The correct county tax rate populates automatically
4. Note: Mapbox is not configured — do not use the map-based lookup

Florida Tax Reference:
- Key West, FL 33040 = Monroe County 7.50%
- Miami, FL 33137 = Miami-Dade County 7.00%
- Fort Lauderdale, FL 33301 = Broward County 7.00%
- Tampa, FL 33602 = Hillsborough County 8.50%
- Orlando, FL 32801 = Orange County 6.50%

## Step 6 — Save the Quote

1. Set Prepared by: Shah Saint-Cyr
2. Verify Advisors checkbox is checked
3. Click Preview PDF to verify the letterhead and line items look correct
4. Click Save

## PDF Letterhead Template Settings

Shah's template is managed separately from the quote form.
To edit: Quotes page → Edit template button

Current settings (as of 2026-10-02):
- Company name: LiveScan360, Inc.
- Tagline: Registered Live Scan Vendor / FDLE-Authorized Live Scan Submitter
- Phone: 305-834-7455 | 718-501-1604
- Email: shah@livescan360.com
- Website: www.livescan360.com
- Prepared by (default): Shah Saint-Cyr

## Known Quirks

1. Extension crash after UPS calculation — save immediately after the shipping rate populates
2. Tax field requires address first — the refresh icon won't return a rate if address fields are empty
3. Prepared by in the quote form is not the letterhead — the PDF email/phone come from Edit template, not the quote form field
4. Shah is advisor, not org admin — Settings → Organization will show "not assigned" for Shah's account; this is expected
5. Contact must exist first — the New Quote dropdown only shows existing contacts

## First Quote Built (Reference)

- Quote #00037 — Jacob Sawyer, Equipment & Services Quote
- Line items: LiveScan Services (625 x $8.00 = $5,000) + Custom Pre-wired Mobile Kit ($0.00)
- Shipping: UPS Ground $31.95 (to 3414 Duck Ave #8, Key West, FL 33040)
- Tax: Monroe County 7.50% = $377.40
- Total: $5,409.35
