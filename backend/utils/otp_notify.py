"""
OTP Notification Service - Send OTP via SMS/Email
Supports: Twilio (SMS), AWS SES (Email), Custom providers
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# SMS Providers
SMS_PROVIDER = (os.getenv("SMS_PROVIDER") or "twilio").lower()
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM_PHONE = os.getenv("TWILIO_FROM_PHONE")

# Email Providers  
EMAIL_PROVIDER = (os.getenv("EMAIL_PROVIDER") or "none").lower()
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL")

# Development Mode
OTP_DEV_MODE = (os.getenv("OTP_DEV_MODE", "true")).lower() in {"1", "true", "yes", "on"}


async def send_otp_sms(phone: str, otp: str) -> bool:
    """
    Send OTP via SMS
    
    Args:
        phone: Phone number (10-digit format without +91)
        otp: 6-digit OTP code
        
    Returns:
        True if sent successfully, False otherwise
    """
    if SMS_PROVIDER == "twilio":
        return await _send_via_twilio(phone, otp)
    elif SMS_PROVIDER == "none":
        logger.warning(f"SMS_PROVIDER set to 'none', OTP not sent to {phone}")
        return False
    else:
        logger.error(f"Unknown SMS_PROVIDER: {SMS_PROVIDER}")
        return False


async def _send_via_twilio(phone: str, otp: str) -> bool:
    """
    Send SMS via Twilio
    """
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not TWILIO_FROM_PHONE:
        logger.error("Twilio credentials not configured")
        return False
    
    try:
        from twilio.rest import Client
        
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        # Format phone number: +91 for India
        formatted_phone = f"+91{phone}"
        
        message = f"Your Brandcart OTP is: {otp}. Valid for 5 minutes. Never share this with anyone."
        
        msg = client.messages.create(
            body=message,
            from_=TWILIO_FROM_PHONE,
            to=formatted_phone
        )
        
        logger.info(f"OTP sent via Twilio to {formatted_phone}: {msg.sid}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send OTP via Twilio: {str(e)}")
        return False


async def send_otp_email(email: str, otp: str, phone: str = "") -> bool:
    """
    Send OTP via Email
    
    Args:
        email: Email address
        otp: 6-digit OTP code
        phone: Phone number (optional, for context)
        
    Returns:
        True if sent successfully, False otherwise
    """
    if EMAIL_PROVIDER == "smtp":
        return await _send_via_smtp(email, otp)
    elif EMAIL_PROVIDER == "none":
        logger.warning(f"EMAIL_PROVIDER set to 'none', OTP email not sent to {email}")
        return False
    else:
        logger.info(f"Email OTP provider '{EMAIL_PROVIDER}' not configured, skipping")
        return False


async def _send_via_smtp(email: str, otp: str) -> bool:
    """
    Send Email via SMTP
    """
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASSWORD:
        logger.error("SMTP credentials not configured")
        return False
    
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        subject = "Brandcart Login OTP"
        
        html_body = f"""
        <html>
            <body style="font-family: Arial, sans-serif;">
                <h2>Your Brandcart OTP</h2>
                <p>Your One-Time Password (OTP) for Brandcart login is:</p>
                <h1 style="color: #FF6B35; letter-spacing: 2px;">{otp}</h1>
                <p style="color: #666;">
                    <strong>Valid for 5 minutes only</strong><br>
                    Never share this OTP with anyone.
                </p>
                <hr>
                <p style="font-size: 12px; color: #999;">
                    If you didn't request this OTP, please ignore this email.
                </p>
            </body>
        </html>
        """
        
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM_EMAIL or SMTP_USER
        msg["To"] = email
        
        text_part = MIMEText(f"Your Brandcart OTP is: {otp}\nValid for 5 minutes.", "plain")
        html_part = MIMEText(html_body, "html")
        
        msg.attach(text_part)
        msg.attach(html_part)
        
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        
        logger.info(f"OTP email sent to {email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send OTP email: {str(e)}")
        return False


async def notify_otp(phone: str, email: Optional[str] = None, otp: str = "") -> dict:
    """
    Send OTP notification via available channels
    
    Args:
        phone: Phone number
        email: Email address (optional)
        otp: OTP code to send
        
    Returns:
        Dictionary with notification status
    """
    result = {
        "sms_sent": False,
        "email_sent": False,
        "message": ""
    }
    
    if OTP_DEV_MODE:
        logger.warning(f"⚠️  OTP_DEV_MODE enabled - OTP for {phone} is: {otp}")
        result["message"] = "Development mode: OTP not sent to actual channels"
        return result
    
    # Send SMS
    if phone:
        result["sms_sent"] = await send_otp_sms(phone, otp)
    
    # Send Email
    if email:
        result["email_sent"] = await send_otp_email(email, otp, phone)
    
    if result["sms_sent"] or result["email_sent"]:
        result["message"] = "OTP sent successfully"
    else:
        result["message"] = "Failed to send OTP through any channel"
    
    return result
