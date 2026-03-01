# OTP Notification Setup Guide

This guide explains how to set up OTP sending for Brandcart.

## Overview

OTP (One-Time Password) is sent via SMS to users during login. The system supports:
- **SMS via Twilio** (Recommended for production)
- **Email via SMTP** (Optional)
- **Development Mode** - Shows OTP in response for testing

## Setting Up Twilio for SMS OTP

### Step 1: Create a Twilio Account

1. Go to [https://www.twilio.com/console](https://www.twilio.com/console)
2. Sign up for a free account (you'll get $15-$30 free credits)
3. Verify your phone number

### Step 2: Get Your Twilio Credentials

1. Log in to the Twilio Console
2. In the **Account** menu, find:
   - **Account SID** (starts with `AC`)
   - **Auth Token** (keep this secret!)
3. Copy these credentials

### Step 3: Get a Twilio Phone Number

1. In Twilio Console, click on **Messaging** > **Try it out** > **Send an SMS**
2. Select your region and get a phone number
3. This will be your `TWILIO_FROM_PHONE` (e.g., `+12015550123`)

### Step 4: Update Backend Configuration

Edit `.env` in the backend folder:

```dotenv
ENV=development
OTP_DEV_MODE=true          # Set to 'false' in production

# Twilio SMS Configuration
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_PHONE=+12015550123
```

### Step 5: Install Dependencies

```bash
cd backend
pip install twilio
```

### Step 6: Test It

1. Start the backend: `python -m uvicorn main:app --reload`
2. Open frontend and try to log in
3. Send OTP to a test phone number
4. Check if SMS is received

## Development Mode Testing

If you don't have Twilio set up yet, use development mode:

```dotenv
OTP_DEV_MODE=true
SMS_PROVIDER=none
```

In this mode:
- OTP will be printed in the API response
- OTP will also be logged to console
- No SMS is actually sent
- Use the response OTP for testing

## Production Checklist

Before going to production:

- [ ] Set `ENV=production`
- [ ] Set `OTP_DEV_MODE=false`
- [ ] Configure TWILIO credentials
- [ ] Test SMS delivery with real phone numbers
- [ ] Set up SMS rate limiting (already configured: max 3 OTPs per 5 minutes)
- [ ] Monitor Twilio usage and costs
- [ ] Enable HTTPS for all API calls

## Troubleshooting

### OTP not received

```python
# Check backend logs:
# 1. Is SMS_PROVIDER set to 'twilio'?
# 2. Are Twilio credentials correct?
# 3. Is the phone number in correct format? (must be 10 digits for India)
# 4. Check Twilio console for delivery errors
```

### Twilio errors

- **Invalid phone number**: Phone must be 10 digits (India format)
- **Unauthorized**: Check Account SID and Auth Token
- **Out of credits**: Twilio account balance too low
- **Invalid sender ID**: Check TWILIO_FROM_PHONE format

### Email OTP (Optional)

If you want to also send OTP via email:

```dotenv
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password  # Use app-specific password for Gmail
SMTP_FROM_EMAIL=noreply@brandcart.in
```

**For Gmail**: Create an app-specific password at [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

## API Response

### Success Response (with OTP in dev mode)

```json
{
  "message": "OTP sent successfully",
  "sms_sent": true,
  "email_sent": false,
  "otp": "123456"  // Only in dev mode
}
```

### Error Handling

The frontend includes rate limiting:
- Max 5 OTP requests per 60 seconds (client-side)
- Max 3 OTP requests per 5 minutes (server-side)

## Backend Code Location

- **OTP Sending**: `backend/utils/otp_notify.py`
- **Auth Routes**: `backend/routes/auth.py`
- **Configuration**: `backend/config/env.py`

## Costs

### Twilio Pricing (India)

- SMS: ₹1-3 per SMS outgoing
- Free trial: $15-30 USD credits
- Production: Budget $100-500/month depending on volume

### Gmail SMTP (Free)

- Unlimited emails (SMTP)
- App-specific password required
