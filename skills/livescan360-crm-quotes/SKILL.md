---
name: livescan360-crm-quotes
description: Build, price, and save quotes in the LiveScan360 CRM at crm.livescan360.com — including UPS shipping calculation, Florida tax lookup, PDF letterhead template settings, and quote email delivery.
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
Go to Quotes → New Quote
Select the contact from the dropdown
Set a descriptive title (e.g., "Equipment & Services Quote")
Set Issue Date and Valid Until date
Under Advisors, check the checkbox next to Shah Saint-Cyr

## Step 3 — Add Line Items

For each product/service:

Description, Quantity, Unit Price
Discount field is optional (leave blank if none)

Common line items:

"LiveScan Services" — price per scan x number of applicants
"Custom Pre-wired Mobile Kit" — equipment bundle

## Step 4 — UPS Ground Shipping
Enter the client's full street address, city, state, ZIP in the shipping fields first
Click "Calculate UPS shipping" button
The calculated rate populates automatically
WARNING: After UPS calculation, the browser extension may crash — save the quote immediately

## Step 5 — Taxes
Confirm city, state, and ZIP are entered in the address fields
Click the circular-arrow Tax refresh icon next to the tax field
The correct county tax rate populates automatically
Note: Mapbox is not configured — do not use the map-based lookup

Florida Tax Reference:

Key West, FL 33040 = Monroe County 7.50%
Miami, FL 33137 = Miami-Dade County 7.00%
Fort Lauderdale, FL 33301 = Broward County 7.00%
Tampa, FL 33602 = Hillsborough County 8.50%
Orlando, FL 32801 = Orange County 6.50%

## Step 6 — Save the Quote
Set Prepared by: Shah Saint-Cyr
Verify Advisors checkbox is checked
Click Preview PDF to verify the letterhead and line items look correct
Click Save

## PDF Letterhead Template Settings

Shah's template is managed separately from the quote form. To edit: Quotes page → Edit template button

Current settings (as of 2026-10-02):

Company name: LiveScan360, Inc.
Tagline: Registered Live Scan Vendor / FDLE-Authorized Live Scan Submitter
Phone: 305-834-7455 | 718-501-1604
Email: shah@livescan360.com
Website: www.livescan360.com
Prepared by (default): Shah Saint-Cyr

## Step 7 — Send Quote Email

After saving, go to Quotes → [Quote #] → Preview PDF → download the PDF file.
Attach the PDF to the email below and send from shah@livescan360.com.

---

**Subject:** Your LiveScan360 Quote — Quote #[QUOTE_NUMBER] — [CLIENT_NAME]

Hi [CLIENT_FIRST_NAME],

Thank you for your interest in LiveScan360. Please find your personalised quote attached as a PDF for your review.

**Quote Summary**

- Quote #: [QUOTE_NUMBER]
- Issue Date: [ISSUE_DATE]
- Valid Until: [VALID_UNTIL]
- Total: $[TOTAL_AMOUNT]

The attached PDF includes a full breakdown of all line items, applicable UPS Ground shipping, and Florida sales tax for your county.

To accept this quote, move forward with scheduling, or ask any questions, simply reply to this email or call us directly at **305-834-7455**.

**Have a concern or question about this quote?**
Click the link below to raise an issue — it takes 30 seconds and helps us track and resolve it quickly:

👉 [Raise an Issue with This Quote](https://github.com/aalikes/agent-hub/issues/new?template=quote-issue.md&title=Quote+Issue%3A+%23[QUOTE_NUMBER]+-+[CLIENT_NAME]&body=%23%23+Quote+Issue%0A%0A**Quote+%23%3A**+[QUOTE_NUMBER]%0A**Client+Name%3A**+[CLIENT_NAME]%0A**Issue+Date%3A**+[ISSUE_DATE]%0A%0A**Description+of+Issue+or+Question%3A**%0A%0A%5BPlease+describe+your+concern+here%5D%0A%0A----%0A_Submitted+via+LiveScan360+Quote+Email_)

We appreciate your time and look forward to serving you.

Warm regards,

**Shah Saint-Cyr**
LiveScan360, Inc.
📞 305-834-7455 | 718-501-1604
✉️ shah@livescan360.com
🌐 www.livescan360.com
_Registered Live Scan Vendor / FDLE-Authorised Live Scan Submitter_

---

**Attachment:** Quote_#[QUOTE_NUMBER]_[CLIENT_NAME]_LiveScan360.pdf

---

**Placeholders to replace before sending:**
- [QUOTE_NUMBER] — e.g., 00037
- [CLIENT_NAME] — e.g., Jacob Sawyer
- [CLIENT_FIRST_NAME] — e.g., Jacob
- [ISSUE_DATE] — e.g., October 2, 2026
- [VALID_UNTIL] — e.g., November 2, 2026
- [TOTAL_AMOUNT] — e.g., 5,409.35

## Known Quirks
Extension crash after UPS calculation — save immediately after the shipping rate populates
Tax field requires address first — the refresh icon won't return a rate if address fields are empty
Prepared by in the quote form is not the letterhead — the PDF email/phone come from Edit template, not the quote form field
Shah is advisor, not org admin — Settings → Organization will show "not assigned" for Shah's account; this is expected
Contact must exist first — the New Quote dropdown only shows existing contacts

## First Quote Built (Reference)
Quote #00037 — Jacob Sawyer, Equipment & Services Quote
Line items: LiveScan Services (625 x $8.00 = $5,000) + Custom Pre-wired Mobile Kit ($0.00)
Shipping: UPS Ground $31.95 (to 3414 Duck Ave #8, Key West, FL 33040)
Tax: Monroe County 7.50% = $377.40
Total: $5,409.35
