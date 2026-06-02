import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

export async function sendVerificationEmail(email: string, code: string): Promise<{ success: boolean; message: string }> {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'HydraRank <no-reply@hydrarank.com>';

  if (!host || !user || !pass) {
    const errorMsg = 'Configurações de e-mail (SMTP) não encontradas no servidor. Certifique-se de configurar SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM nas variáveis de ambiente (Secrets/Settings).';
    console.error(`[SMTP ERROR]: ${errorMsg}`);
    return {
      success: false,
      message: errorMsg,
    };
  }

  if (!transporter) {
    const isSecure = port === 465;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: {
        user,
        pass,
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
      }
    });
  }

  const mailOptions = {
    from,
    to: email,
    subject: `Seu Código de Confirmação HydraRank: ${code}`,
    text: `Olá!\n\nSeu código de login para o HydraRank é: ${code}\n\nEste código é válido por 10 minutos.\n\nBeba água e mantenha-se hidratado!`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc;">
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="font-size: 30px;">💧</span>
          <h2 style="font-size: 22px; font-weight: bold; color: #010409; margin-top: 10px;">HydraRank</h2>
          <p style="font-size: 12px; color: #06b6d4; text-transform: uppercase; font-weight: bold; tracking-spacing: 1px; margin: 0;">Placar de Hidratação Competitivo</p>
        </div>
        <p style="font-size: 14px; color: #334155;">Olá!</p>
        <p style="font-size: 14px; color: #334155;">Seu código de login para acessar sua conta competitiva no HydraRank é:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-family: monospace; font-size: 28px; font-weight: bold; color: #06b6d4; background-color: #0d1117; padding: 12px 24px; border-radius: 8px; letter-spacing: 4px; display: inline-block;">
            ${code}
          </span>
        </div>
        <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 30px;">
          Este código é válido por 10 minutos. Se você não solicitou este acesso, ignore este e-mail.
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email enviado com sucesso para ${email}: MessageID ${info.messageId}`);
    return { success: true, message: 'Código de confirmação enviado para o seu e-mail!' };
  } catch (error: any) {
    console.error('Erro ao enviar e-mail via SMTP:', error);
    return {
      success: false,
      message: `Erro ao enviar e-mail SMTP: ${error.message || error}`,
    };
  }
}
