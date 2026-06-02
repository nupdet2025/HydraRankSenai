import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  getUserByEmail,
  saveUser,
  addWaterLog,
  deleteWaterLog,
  getUserLogs,
  getDailySummaryByDate,
  getPeriodSummary,
  createVerificationCode,
  verifyVerificationCode,
  createSession,
  getSession,
  deleteSession,
  getAllUsers,
  UserProfile,
  deleteUserProfile,
} from './src/backend/database.js';
import { sendVerificationEmail } from './src/backend/email.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // UTILITY MIDDLEWARE: Auth validation based on Bearer token
  const authenticateToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({ error: 'Token de autenticação não fornecido.' });
      return;
    }

    try {
      const session = await getSession(token);
      if (!session) {
        res.status(403).json({ error: 'Sessão inválida ou expirada.' });
        return;
      }
      req.body.userEmail = session.email;
      next();
    } catch (error) {
      res.status(500).json({ error: 'Erro interno ao validar a sessão.' });
    }
  };

  // API ROUTE: request confirmation code for passwordless login
  app.post('/api/auth/request-code', async (req, res) => {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'Insira um e-mail válido.' });
      return;
    }

    try {
      // Generate a 6-digit confirmation code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await createVerificationCode(email, code);

      // Print in console for server operator visibility
      console.log(`[AUTH CODE LOG] Código gerado para ${email}: ${code}`);

      // Attempt to send real email via configured SMTP
      const emailResult = await sendVerificationEmail(email.toLowerCase().trim(), code);

      if (!emailResult.success) {
        res.status(500).json({ error: emailResult.message });
        return;
      }

      res.json({
        success: true,
        message: 'Código de confirmação enviado para seu e-mail!',
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: `Erro ao enviar o código de verificação: ${error.message || error}` });
    }
  });

  // API ROUTE: verify confirmation code and authenticate session
  app.post('/api/auth/verify-code', async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
      res.status(400).json({ error: 'E-mail e código são necessários.' });
      return;
    }

    try {
      const isValid = await verifyVerificationCode(email, code);
      if (!isValid) {
        res.status(400).json({ error: 'Código de confirmação inválido ou expirado.' });
        return;
      }

      const session = await createSession(email);
      const user = await getUserByEmail(email);

      res.json({
        success: true,
        token: session.token,
        email: session.email,
        profile: user, // null if they have not registered yet
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao verificar o código.' });
    }
  });

  // API ROUTE: Get current user profile
  app.get('/api/auth/me', authenticateToken, async (req, res) => {
    const email = req.body.userEmail;
    try {
      const user = await getUserByEmail(email);
      if (!user) {
        // Logged in but profile is still uncreated
        res.json({ profile: null, email });
        return;
      }
      res.json({ profile: user, email });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar dados do perfil.' });
    }
  });

  // API ROUTE: Create or update user profile
  app.post('/api/auth/profile', authenticateToken, async (req, res) => {
    const { username, avatar } = req.body;
    const email = req.body.userEmail;

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      res.status(400).json({ error: 'O nome do usuário não pode estar vazio.' });
      return;
    }

    if (!avatar || typeof avatar !== 'string') {
      res.status(400).json({ error: 'Selecione uma figurinha de avatar válida.' });
      return;
    }

    try {
      const user: UserProfile = {
        email,
        username: username.trim(),
        avatar: avatar.trim(),
        createdAt: new Date().toISOString(),
      };
      const saved = await saveUser(user);
      res.json({ success: true, profile: saved });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao salvar os dados do perfil.' });
    }
  });

  // API ROUTE: Delete current user profile and matching logs/sessions
  app.delete('/api/auth/profile', authenticateToken, async (req, res) => {
    const email = req.body.userEmail;
    try {
      const success = await deleteUserProfile(email);
      if (success) {
        res.json({ success: true, message: 'Seu perfil e todos os dados foram apagados com sucesso!' });
      } else {
        res.status(404).json({ error: 'Perfil não encontrado ou já deletado.' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao apagar perfil do usuário.' });
    }
  });

  // API ROUTE: Log water intake
  app.post('/api/water/add', authenticateToken, async (req, res) => {
    const { date, amount } = req.body; // YYYY-MM-DD, amount in ml
    const email = req.body.userEmail;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Data em formato inválido. Use AAAA-MM-DD.' });
      return;
    }

    const ml = Number(amount);
    if (isNaN(ml) || ml <= 0) {
      res.status(400).json({ error: 'Quantidade de água deve ser um número maior que zero.' });
      return;
    }

    try {
      const newLog = await addWaterLog(email, date, ml);
      res.json({ success: true, log: newLog });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao registrar o consumo de água.' });
    }
  });

  // API ROUTE: Delete water intake log
  app.delete('/api/water/delete', authenticateToken, async (req, res) => {
    const { logId } = req.body;
    const email = req.body.userEmail;

    if (!logId) {
      res.status(400).json({ error: 'ID do registro de água é obrigatório.' });
      return;
    }

    try {
      const success = await deleteWaterLog(logId, email);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Registro não encontrado ou não pertence a você.' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro ao deletar o registro.' });
    }
  });

  // API ROUTE: Get water history logs for the authenticated user
  app.get('/api/water/history', authenticateToken, async (req, res) => {
    const email = req.body.userEmail;
    try {
      const logs = await getUserLogs(email);
      // Sort logs by timestamp descending
      const sorted = logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      res.json({ logs: sorted });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao recuperar histórico.' });
    }
  });

  // API ROUTE: Get competitive leaderboards
  // Query param: `period` = 'today' | 'week' | 'month' | 'overall' (all time)
  // Query param: `date` = specific YYYY-MM-DD, defaults to today
  app.get('/api/water/ranking', async (req, res) => {
    const period = (req.query.period as string) || 'today';
    const clientDate = (req.query.date as string) || new Date().toISOString().split('T')[0];

    try {
      const users = await getAllUsers();
      let summary: Record<string, number> = {};

      if (period === 'today') {
        summary = await getDailySummaryByDate(clientDate);
      } else if (period === 'week') {
        // Calculate the range of last 7 calendar days ending on clientDate
        const targetDate = new Date(clientDate);
        const startDateObj = new Date(targetDate);
        startDateObj.setDate(targetDate.getDate() - 6);
        const startDate = startDateObj.toISOString().split('T')[0];
        summary = await getPeriodSummary(startDate, clientDate);
      } else if (period === 'month') {
        // Calculate range of last 30 calendar days ending on clientDate
        const targetDate = new Date(clientDate);
        const startDateObj = new Date(targetDate);
        startDateObj.setDate(targetDate.getDate() - 29);
        const startDate = startDateObj.toISOString().split('T')[0];
        summary = await getPeriodSummary(startDate, clientDate);
      } else {
        // Overall: calculate summary for all days
        summary = await getPeriodSummary('1970-01-01', '9999-12-31');
      }

      // Format leaders: join active water consumption with profile data
      const rankingList = Object.entries(users).map(([email, profile]) => {
        const totalAmount = summary[email] || 0;
        return {
          email: profile.email,
          username: profile.username,
          avatar: profile.avatar,
          totalAmount,
        };
      });

      // Filter out those with no profile name, but keep ones with 0 ml consumed on that day to participate
      const activeRankers = rankingList.filter((item) => item.username);

      // Sort by amount descending, and secondary alphabetically
      activeRankers.sort((a, b) => {
        if (b.totalAmount !== a.totalAmount) {
          return b.totalAmount - a.totalAmount;
        }
        return a.username.localeCompare(b.username);
      });

      res.json({
        period,
        date: clientDate,
        ranking: activeRankers,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao carregar o ranking de usuários.' });
    }
  });

  // Log out session
  app.post('/api/auth/logout', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      await deleteSession(token);
    }
    res.json({ success: true });
  });

  // Mount Vite middleware for development or Static Asset serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`);
  });
}

startServer();
