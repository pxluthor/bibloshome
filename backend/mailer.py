"""Envio de e-mail por SMTP (mesma conta do Builder.IA), só com a biblioteca padrão."""
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or 587)
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "") or SMTP_USER


def email_configurado() -> bool:
    return bool(SMTP_HOST and SMTP_FROM)


def enviar_email(destino: str, assunto: str, texto: str, html: str | None = None) -> None:
    """Envia ou levanta exceção. Porta 465 usa SSL direto; as demais, STARTTLS quando oferecido."""
    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = SMTP_FROM
    msg["To"] = destino
    msg.set_content(texto)
    if html:
        msg.add_alternative(html, subtype="html")

    context = ssl.create_default_context()
    if SMTP_PORT == 465:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=20) as smtp:
            if SMTP_USER:
                smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(msg)
        return
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        smtp.ehlo()
        if smtp.has_extn("starttls"):
            smtp.starttls(context=context)
            smtp.ehlo()
        if SMTP_USER:
            smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.send_message(msg)


def enviar_codigo_verificacao(destino: str, nome: str, codigo: str, validade_min: int) -> None:
    texto = (
        f"Olá, {nome}!\n\nSeu código de verificação do LibraryAnywhere é: {codigo}\n\n"
        f"Ele vale por {validade_min} minutos. Se você não pediu este cadastro, ignore este e-mail."
    )
    html = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f3f5fb;padding:24px;color:#0f172a">
      <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:24px">
        <p style="margin:0 0 4px;font-size:18px;font-weight:800">Library<span style="color:#16a34a">Anywhere</span></p>
        <p style="margin:16px 0 8px;font-size:15px">Olá, <strong>{nome}</strong>! Use o código abaixo para confirmar seu e-mail:</p>
        <p style="margin:16px 0;font-size:32px;font-weight:800;letter-spacing:8px;text-align:center">{codigo}</p>
        <p style="margin:0;font-size:12px;color:#475569">Vale por {validade_min} minutos. Se você não pediu este cadastro, ignore este e-mail.</p>
      </div>
    </div>"""
    enviar_email(destino, f"{codigo} é seu código do LibraryAnywhere", texto, html)
